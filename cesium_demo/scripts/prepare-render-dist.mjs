import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

// Render's static-site builds need dist mirrored one level up (see render.yaml's
// staticPublishPath). Other hosts (Vercel, local) don't grant write access outside
// this directory's root, so skip there instead of failing the build.
if (!process.env.RENDER) {
  process.exit(0);
}

const appRoot = process.cwd();
const source = resolve(appRoot, "dist");
const target = resolve(appRoot, "..", ".cesium_demo", "dist");

await rm(target, { recursive: true, force: true });
await mkdir(resolve(target, ".."), { recursive: true });
await cp(source, target, { recursive: true });
