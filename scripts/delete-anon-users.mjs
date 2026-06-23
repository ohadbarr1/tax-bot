#!/usr/bin/env node
/**
 * scripts/delete-anon-users.mjs
 *
 * Bulk-delete all anonymous Firebase Auth users from the taxbackil project.
 * Fixes the TOO_MANY_ATTEMPTS_TRY_LATER rate-limit caused by 392 anon users
 * minted in one day of testing (2026-06-23).
 *
 * Prerequisites:
 *   1. gcloud auth application-default login
 *      (or set GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json)
 *   2. npm install --no-save firebase-admin  (or: node --version >= 18 with
 *      firebase-admin already in devDeps)
 *
 * Usage:
 *   node scripts/delete-anon-users.mjs          # dry-run by default
 *   node scripts/delete-anon-users.mjs --delete # actually delete
 *   node scripts/delete-anon-users.mjs --delete --project taxbackil
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const DRY_RUN = !process.argv.includes("--delete");
const PROJECT_ID =
  process.argv.find((a) => a.startsWith("--project="))?.split("=")[1] ??
  (process.argv.includes("--project")
    ? process.argv[process.argv.indexOf("--project") + 1]
    : null) ??
  "taxbackil";

if (!getApps().length) {
  initializeApp({ projectId: PROJECT_ID });
}

const auth = getAuth();

async function run() {
  console.log(`Project: ${PROJECT_ID}`);
  console.log(DRY_RUN ? "DRY RUN — pass --delete to actually delete" : "LIVE DELETE — this is irreversible");
  console.log();

  let pageToken;
  let totalAnon = 0;
  let totalDeleted = 0;
  let page = 0;

  do {
    const result = await auth.listUsers(1000, pageToken);
    page++;

    const anonUids = result.users
      .filter((u) => u.providerData.length === 0)  // no providers = anonymous
      .map((u) => u.uid);

    totalAnon += anonUids.length;
    console.log(`Page ${page}: ${result.users.length} users, ${anonUids.length} anonymous`);

    if (anonUids.length > 0 && !DRY_RUN) {
      // deleteUsers accepts up to 1000 uids per call
      const res = await auth.deleteUsers(anonUids);
      totalDeleted += res.successCount;
      if (res.failureCount > 0) {
        console.warn(`  ${res.failureCount} failed:`, res.errors);
      }
    }

    pageToken = result.pageToken;
  } while (pageToken);

  console.log();
  console.log(`Total anonymous users found: ${totalAnon}`);
  if (!DRY_RUN) {
    console.log(`Deleted: ${totalDeleted}`);
    console.log("Rate limit will reset within ~1 hour after deletion.");
  } else {
    console.log("(dry run — nothing deleted)");
    console.log("Re-run with --delete to remove them.");
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
