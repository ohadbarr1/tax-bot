import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep heavy native/worker packages out of the Next.js bundle.
  // pdf-parse bundles its own Node-compatible pdfjs-dist legacy build and
  // must stay external so the worker + wasm assets resolve at runtime;
  // tesseract.js relies on WASM + native bindings that break when bundled.
  // Because these are external, their optional "canvas" peer-dep is never
  // resolved by the bundler — no alias stub needed.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "tesseract.js", "tesseract.js-core"],

  // pdf-parse dynamically loads pdfjs-dist's fake worker from disk at runtime
  // (see "Setting up fake worker failed" error). @vercel/nft's static trace
  // can't see the dynamic path, so we force-include the worker file plus the
  // rest of the bundled pdfjs-dist legacy build into the standalone output.
  outputFileTracingIncludes: {
    "/api/parse/form-106": [
      "./node_modules/pdf-parse/node_modules/pdfjs-dist/legacy/build/**/*",
    ],
  },

  // Next.js 16 uses Turbopack by default.
  // Empty config silences the "webpack config present but no turbopack config" error.
  turbopack: {},
};

export default nextConfig;
