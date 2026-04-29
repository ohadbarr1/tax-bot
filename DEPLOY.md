# Deploy — Firebase App Hosting

One-time setup to get a live URL. Everything lives in Firebase: hosting, auth,
Firestore (persistent state), Cloud Storage (uploaded PDFs), and secrets.

## 1. Install the Firebase CLI

```bash
npm install -g firebase-tools
firebase login
```

## 2. Create the Firebase project

1. Go to https://console.firebase.google.com and click **Add project**.
2. Name it (e.g. `taxback-il-prod`). Disable Analytics unless you want it.
3. Inside the project, enable these products:
   - **Authentication** → Sign-in method → enable **Anonymous** and **Google**.
   - **Firestore Database** → Create database → production mode → any location.
   - **Cloud Storage** → Get started → production mode → same location.
   - **App Hosting** → Get started.
4. Project Settings → **General** → *Your apps* → Web (`</>`) → register app
   → copy the config values into the `env:` block of `apphosting.yaml`:

   ```yaml
   env:
     - variable: NEXT_PUBLIC_FIREBASE_API_KEY
       value: "AIza…"
       availability: [BUILD, RUNTIME]
     # …one per field from the SDK snippet
   ```

## 3. Push security rules

From the repo root:

```bash
firebase use <your-project-id>
firebase deploy --only firestore:rules,storage
```

This uploads `firestore.rules` and `storage.rules` — every user only reads and
writes their own `users/{uid}/…` path.

## 4. Store the Anthropic API key as a secret

The advisor chat needs `ANTHROPIC_API_KEY`. Don't put it in `apphosting.yaml`
as plaintext; use Secret Manager:

```bash
firebase apphosting:secrets:set ANTHROPIC_API_KEY
# paste your sk-ant-... when prompted
```

Then uncomment the secret block at the bottom of `apphosting.yaml`:

```yaml
  - variable: ANTHROPIC_API_KEY
    secret: ANTHROPIC_API_KEY
    availability: [RUNTIME]
```

## 4b. Provision Upstash Redis for rate limiting (closes audit F-2 / F1.2.1)

Every authenticated API route (`/api/advisor*`, `/api/parse/*`, `/api/generate/*`,
`/api/mine/document`) is rate-limited per `uid + ip` via Upstash Redis. Without
the env vars below, `lib/api/withRateLimit.ts` falls back to a no-op + warning
(so dev/test still work). **Production must provision both.**

1. Create a database at [console.upstash.com/redis](https://console.upstash.com/redis)
   (the free tier covers tens of thousands of requests / day).
2. Copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from the
   "REST API" tab.
3. Store both as Firebase App Hosting secrets:

   ```bash
   firebase apphosting:secrets:set UPSTASH_REDIS_REST_URL
   firebase apphosting:secrets:set UPSTASH_REDIS_REST_TOKEN
   ```

The secret block is already wired up in `apphosting.yaml` (RUNTIME-only).

## 4c. Provision Sentry + UptimeRobot (closes performance §1.6)

Phase 0 / 0.F adds end-to-end observability: Sentry for browser + server
error tracking, a pino structured logger that flows into Cloud Logging, a
Web Vitals reporter that beacons to `/api/metrics`, and a public health
endpoint `/api/health` for uptime probes.

### Sentry

1. Create a project at [sentry.io](https://sentry.io) → "Next.js" platform.
   Copy the DSN.
2. Generate a build-time auth token at
   [sentry.io/settings/account/api/auth-tokens/](https://sentry.io/settings/account/api/auth-tokens/)
   with `project:releases` scope. This is only needed if you want
   symbolicated client stack traces (source-map upload at build time);
   the build itself succeeds without it.
3. Store all three as App Hosting secrets:

   ```bash
   firebase apphosting:secrets:set SENTRY_DSN
   firebase apphosting:secrets:set SENTRY_AUTH_TOKEN
   ```

   The secret block is wired in `apphosting.yaml`. `SENTRY_DSN` is
   referenced twice — once as `SENTRY_DSN` (RUNTIME, server-side) and once
   as `NEXT_PUBLIC_SENTRY_DSN` (BUILD + RUNTIME, browser bundle); both
   point to the same secret. `SENTRY_AUTH_TOKEN` is BUILD-only.

4. Tag events with the deployed git SHA. Set `GIT_SHA` (and
   `NEXT_PUBLIC_GIT_SHA` for the client bundle) at deploy time — Firebase
   App Hosting injects the commit SHA automatically; if not, set it from
   your CI step. `lib/sentry.server.ts` falls back to `release: "dev"`
   when unset.

Without `SENTRY_DSN`, `lib/sentry.server.ts` and `lib/sentry.client.ts`
are no-ops — the local-dev / CI build is unaffected.

### UptimeRobot (or Better Uptime / Cloud Monitoring uptime check)

1. Create a free account at [uptimerobot.com](https://uptimerobot.com).
2. Add an HTTP(s) monitor:
   - URL: `https://<your-app-hosting-host>/api/health`
   - Interval: 5 minutes
   - Expect: HTTP 200 + body containing `"status":"ok"`
3. Wire alerts:
   - PagerDuty / Opsgenie if you have an on-call rotation.
   - Slack webhook (`Channels` → channel → integrations → incoming webhook)
     as a Phase-0 fallback.

The `/api/health` route is public (no Bearer required), returns a
no-store JSON `{ status, commit, ts }`, and never reads Firestore or
Anthropic — so a probe failure means the Next.js server itself is down,
which is exactly the signal you want.

### Cloud Logging (no setup needed)

Firebase App Hosting's Cloud Run runtime auto-captures stdout. The pino
logger emits structured JSON in production (`severity` + every key
indexed). Filter in Cloud Logging UI by `severity=ERROR event=form135_*`,
etc. No agent, no config — it just works.

### Web Vitals beacons

`<WebVitals />` (mounted in the root layout) reports CLS / FCP / INP /
LCP / TTFB to `/api/metrics`, which logs them via pino. Filter by
`event=web_vital name=LCP` to graph p75 over time. Phase 1 will pipe
these into Sentry / Firebase Performance Monitoring with proper
percentile dashboards.

## 4d. Enable Firebase App Check (closes security-F1.1.4 / F1.3.2)

App Check attests every Firebase backend call (Auth, Firestore, Storage)
as coming from a real instance of the live web app, not a `curl` from a
random IP. Without it, the public Firebase API key + Firestore rules are
the only thing standing between the world and the project's quota.

We use the **reCAPTCHA v3** provider (free tier; the Enterprise variant
is paid).

### 4d.1 Register a reCAPTCHA v3 site

1. Sign in to [reCAPTCHA admin](https://www.google.com/recaptcha/admin/create)
   with the same Google account that owns the Firebase project.
2. **Label**: `tax-bot prod` (or similar).
3. **reCAPTCHA type**: choose **reCAPTCHA v3** (NOT v2 / Enterprise).
4. **Domains**: add every host the live app runs on:
   - `<project>.web.app`
   - `<project>--<region>.hosted.app` (the Firebase App Hosting URL)
   - the production custom domain (if/when you add one)
   - `localhost` (for `npm run dev`)
5. Accept terms and submit. Copy the **site key** (public-by-design — it
   ships in the page bundle) and the **secret** (Firebase needs the secret
   to verify tokens server-side).

### 4d.2 Register the same key in Firebase Console

1. Firebase Console → **Build** → **App Check** → **Get started** if you
   haven't yet.
2. In the **Apps** tab, find the web app and click **reCAPTCHA v3**.
3. Paste the **site key** and the **secret** from step 4d.1. Set TTL to
   1 day (default).
4. In the **APIs** tab on the left, click **Cloud Firestore**, **Identity
   Toolkit**, and **Cloud Storage** in turn — switch each from
   "unenforced" to **enforced** ONLY after the live deploy carries the
   App Check token (verified at step 4d.5). Switching too early bricks
   the app for everyone until the next deploy lands.

### 4d.3 Wire the site key into the build

`apphosting.yaml` already declares `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` —
just edit the value:

```yaml
- variable: NEXT_PUBLIC_RECAPTCHA_SITE_KEY
  value: "6Lc..."
  availability: [BUILD, RUNTIME]
```

For local dev copy the same key into `.env.local`. Without the env var,
`lib/firebase/client.ts` skips App Check init and emits a single
`console.warn` — so dev keeps working without provisioning reCAPTCHA,
but production MUST set it before flipping the App Check enforcement
switch.

### 4d.4 Local dev — debug tokens

reCAPTCHA v3 doesn't run on `localhost` reliably (no public domain). For
local dev:

1. In DevTools console, BEFORE the app loads, run:
   ```js
   self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
   ```
   Reload. Firebase prints a debug token to the console once.
2. Copy that token to Firebase Console → **App Check** → **Apps** → your
   web app → **⋮** menu → **Manage debug tokens** → **Add debug token**.
   Paste and label.
3. Now `npm run dev` works against the real Firebase backend without
   hitting reCAPTCHA.

### 4d.5 Deploy + verify

After `git push`:

1. Firebase App Hosting rebuilds with the new env var. Visit the live
   URL.
2. DevTools → Network → filter by `firebaseappcheck.googleapis.com`. You
   should see a `POST` to
   `/v1beta/projects/<id>/apps/<id>:exchangeRecaptchaV3Token` on first
   load.
3. After confirming live traffic carries the token, return to App Check
   → **APIs** and flip each Firebase product to **enforced**.

## 5. Link GitHub and deploy

In the Firebase Console → **App Hosting** → **Create backend**:

1. Connect your GitHub account and pick `ohadbarr1/tax-bot`.
2. **Root directory**: `/app`
3. **Live branch**: `main`
4. Confirm. Firebase clones, runs `npm ci && npm run build`, and boots the
   Next.js server. First deploy takes ~5 min.
5. Future `git push origin main` triggers automatic rebuilds.

Alternatively, deploy directly from the CLI without GitHub integration:

```bash
cd app
firebase apphosting:backends:create
```

## 6. Add the production domain to Auth

Firebase Console → **Authentication** → Settings → **Authorized domains** →
add the `<project>.web.app` and any custom domain you wire up.

## 7. Local development

Copy `.env.local.example` → `.env.local` and fill in the same values you used
in `apphosting.yaml`. For server-side Admin SDK operations:

```bash
gcloud auth application-default login
```

Then:

```bash
npm run dev          # http://localhost:3000
```

Without the env vars the app still runs — it just skips Firestore/Storage
calls (`isFirebaseConfigured()` returns `false`) so you can iterate offline.

### Admin bootstrap

There is no self-serve admin sign-up. The admin portal at `/admin` is gated
by a document at `admins/{uid}` in Firestore — both on the server (every
`/api/admin/*` route calls `requireAdmin`) and in the UI shell.

To create the first admin:

1. Open the Firebase Console → Firestore Database.
2. Add a top-level collection called `admins` (if it doesn't exist).
3. For the new document, set the **Document ID** to the user's Firebase UID
   (find it in Authentication → Users → copy UID).
4. Set fields:
   - `role: "owner"` (string)
   - `createdAt: <server timestamp>` (timestamp, choose "set to server time")
   - `note: "<free text>"` (string, optional)
5. Save. The user can now hit `/admin` and will see the dashboard after a
   reload of their session. In-portal admin management is out of scope for
   v1 — create additional admins the same way.

The `admins/{uid}` collection has `allow read, write: if false` in
`firestore.rules`, so no client can read or mutate it — only the Firebase
Console + Admin SDK (used by `lib/admin/isAdmin.ts`) can touch it.

## Notes

- **Anonymous auth**: every visitor is signed in automatically on first load.
  The `uid` stays stable for that browser, so state persists across sessions
  without any login screen. Users can click **התחבר עם Google** in the navbar
  to upgrade the anonymous account to a real Google identity without losing
  data (`linkWithPopup`).
- **Max upload size**: 20 MB, enforced in both `lib/uploadLimits.ts` and
  `storage.rules`.
- **Max request duration**: 300 s, set in `apphosting.yaml` for OCR-heavy
  Form-106 parsing.
