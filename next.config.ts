import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep heavy native/worker packages out of the Next.js bundle.
  // pdfjs-dist ships a pdf.worker.mjs that must run in Node directly;
  // tesseract.js relies on WASM + native bindings that break when bundled.
  serverExternalPackages: ["pdfjs-dist", "tesseract.js", "tesseract.js-core"],

  webpack(config) {
    // pdf-lib / pdfjs-dist reference "canvas" for Node environments.
    // We don't need it (server runs headless) — alias to false prevents
    // "Module not found: Can't resolve 'canvas'" build errors.
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
      encoding: false,
    };
    return config;
  },
};

export default nextConfig;
