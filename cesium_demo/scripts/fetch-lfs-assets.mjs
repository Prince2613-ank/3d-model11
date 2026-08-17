import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

// Render's and Vercel's git checkouts don't reliably smudge Git LFS pointers
// (git lfs pull can exit 0 without actually replacing pointer files in their
// build sandboxes). This fetches the real binaries directly from GitHub's
// public LFS batch API over HTTPS instead, independent of git/git-lfs.
const LFS_BATCH_URL = "https://github.com/Prince2613-ank/3d-model11.git/info/lfs/objects/batch";
const POINTER_PREFIX = "version https://git-lfs.github.com/spec/v1";
const APP_ROOT = fileURLToPath(new URL("..", import.meta.url));

async function findGlbFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findGlbFiles(full)));
    } else if (extname(entry.name) === ".glb") {
      files.push(full);
    }
  }
  return files;
}

function parsePointer(text) {
  const oid = text.match(/oid sha256:([a-f0-9]{64})/)?.[1];
  const size = text.match(/size (\d+)/)?.[1];
  return oid && size ? { oid, size: Number(size) } : null;
}

async function findPointerFiles() {
  const glbFiles = await findGlbFiles(APP_ROOT);
  const pointers = [];
  for (const file of glbFiles) {
    const { size } = await stat(file);
    if (size > 1024) continue; // real binaries are always far larger than a pointer file
    const text = await readFile(file, "utf8").catch(() => null);
    if (!text?.startsWith(POINTER_PREFIX)) continue;
    const pointer = parsePointer(text);
    if (pointer) pointers.push({ file, ...pointer });
  }
  return pointers;
}

async function main() {
  const pointers = await findPointerFiles();
  if (pointers.length === 0) {
    console.log("No unresolved Git LFS pointer files found among .glb assets.");
    return;
  }

  console.log(`Fetching ${pointers.length} Git LFS object(s) via HTTPS batch API...`);
  const batchRes = await fetch(LFS_BATCH_URL, {
    method: "POST",
    headers: {
      Accept: "application/vnd.git-lfs+json",
      "Content-Type": "application/vnd.git-lfs+json"
    },
    body: JSON.stringify({
      operation: "download",
      transfers: ["basic"],
      objects: pointers.map(({ oid, size }) => ({ oid, size }))
    })
  });
  if (!batchRes.ok) {
    throw new Error(`LFS batch API request failed: ${batchRes.status} ${await batchRes.text()}`);
  }
  const { objects } = await batchRes.json();
  const byOid = new Map(objects.map((object) => [object.oid, object]));

  for (const pointer of pointers) {
    const href = byOid.get(pointer.oid)?.actions?.download?.href;
    if (!href) {
      throw new Error(`No download URL for ${pointer.file} (oid ${pointer.oid})`);
    }
    const res = await fetch(href);
    if (!res.ok) {
      throw new Error(`Failed to download ${pointer.file}: ${res.status}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    await writeFile(pointer.file, buffer);
    console.log(`Fetched ${pointer.file} (${buffer.length} bytes)`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
