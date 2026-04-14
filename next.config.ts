import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep heavy native/worker packages out of the Next.js bundle.
  // pdfjs-dist ships a pdf.worker.mjs that must run in Node directly;
  // tesseract.js relies on WASM + native bindings that break when bundled.
  // Because these are external, their optional "canvas" peer-dep is never
  // resolved by the bundler — no alias stub needed.
  serverExternalPackages: ["pdfjs-dist", "tesseract.js", "tesseract.js-core"],

  // Next.js 16 uses Turbopack by default.
  // Empty config silences the "webpack config present but no turbopack config" error.
  turbopack: {},
};

export default nextConfig;
