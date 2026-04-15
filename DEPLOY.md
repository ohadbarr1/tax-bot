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
