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

  // Cross-Origin-Opener-Policy: same-origin-allow-popups
  // Chrome's default COOP breaks `window.opener.postMessage` from Firebase's
  // auth-handler popup (firebaseapp.com) back to the parent on *.hosted.app,
  // so `signInWithPopup` opens the Google sheet fine but never resolves in
  // the parent when the popup closes. `same-origin-allow-popups` keeps the
  // main window's origin isolated but explicitly allows the popup we opened
  // ourselves to talk back to us. Do NOT set COEP — it would disable
  // third-party scripts (gstatic, Firebase auth handler).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
