import { defineConfig } from "vite";
import cesium from "vite-plugin-cesium";

// Set VITE_ASSET_CDN_BASE (e.g. https://cdn.example.com/) at build time to
// serve every hashed bundle/model from an external CDN-backed object store
// (R2/S3 + Cloudflare/CloudFront) instead of this app's own origin. Leave
// unset for local dev / default same-origin hosting.
const assetBase = process.env.VITE_ASSET_CDN_BASE || "/";

export default defineConfig({
  base: assetBase,
  plugins: [cesium({ rebuildCesium: true })],
  server: {
    port: 5500,
    strictPort: true
  }
});
