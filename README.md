# Bracelet Project Cockpit — Deploy Guide

A shared, live project tracker for the Crowd LED Bracelets build. Anyone with the
link can view and edit; changes sync in real time across everyone's screens.

**Stack:** React (Vite) frontend + Supabase (database + realtime). Both have free
tiers that easily cover a small team. Total setup time: ~15–20 minutes.

---

## What you'll end up with

- A URL like `bracelet-cockpit.vercel.app` you share with your team
- Four tabs — Tasks, Budget, Decisions, Risks — all editable inline
- Edits save to a shared database and appear live for everyone
- Pre-loaded with the whole project plan

---

## Step 1 — Create the Supabase project (~5 min)

1. Go to **supabase.com**, sign up, and click **New project**.
2. Give it a name and a database password (save the password somewhere; you
   won't need it for this app, but Supabase wants one).
3. Wait ~2 minutes for it to provision.
4. In the left sidebar open **SQL Editor → New query**.
5. Open the file **`supabase-schema.sql`** from this package, copy its entire
   contents, paste into the editor, and click **Run**. This creates the four
   tables, opens them for link-based editing, enables realtime, and seeds them
   with the plan data.
6. In the sidebar open **Project Settings → API** and copy two values:
   - **Project URL** (looks like `https://abcd1234.supabase.co`)
   - **anon public** key (a long string under "Project API keys")

> The `anon` key is safe to expose in a frontend — that's its purpose. Access is
> controlled by the table policies, which here are intentionally open so anyone
> with your link can edit. Keep the link within your team and don't store
> sensitive data here. (See "Locking it down later" below.)

---

## Step 2 — Put the code on GitHub (~3 min)

1. Create a new repository on **github.com** (e.g. `bracelet-cockpit`), empty.
2. From this folder, push the code:

   ```bash
   git init
   git add .
   git commit -m "Bracelet project cockpit"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/bracelet-cockpit.git
   git push -u origin main
   ```

   (`.env` is gitignored, so your keys never get committed — you'll set them in
   Vercel instead.)

---

## Step 3 — Deploy on Vercel (~5 min)

1. Go to **vercel.com**, sign up (use "Continue with GitHub"), and click
   **Add New → Project**.
2. Import your `bracelet-cockpit` repo. Vercel auto-detects Vite — leave the
   build settings as they are.
3. Before deploying, expand **Environment Variables** and add the two from
   Step 1:

   | Name | Value |
   |------|-------|
   | `VITE_SUPABASE_URL` | your Project URL |
   | `VITE_SUPABASE_ANON_KEY` | your anon public key |

4. Click **Deploy**. After ~1 minute you get your live URL.
5. Open it, confirm the plan data loads, then **share the link with your team**.
   Open it in two windows and edit one — the other updates live.

---

## Running it locally first (optional)

```bash
cp .env.example .env      # then paste your two Supabase values into .env
npm install
npm run dev               # opens at http://localhost:5173
```

---

## Everyday use

- **Tasks** — check the box to mark done; set owner, status, due date; filter by
  owner; add/delete tasks per phase.
- **Budget** — edit per-unit, qty, or one-time cost; totals recompute live. Drop
  in real quotes as they arrive.
- **Decisions** — the running log of what was decided and why.
- **Risks** — severity, mitigation, and owner for each.

Everything autosaves and syncs. No save button.

---

## Locking it down later (optional)

The board is open to anyone with the link, by design. If you later want it
private, two easy upgrades:

- **Quick gate:** add a shared password prompt in the app (ask me and I'll wire
  it in — it's a small change).
- **Proper auth:** turn on Supabase Auth (email magic links) and tighten the
  table policies so only signed-in users can read/write. More robust; a bit more
  setup.

Either is a follow-up — the current version is the simplest thing that works for
a trusted small team.

---

## Troubleshooting

- **Blank board / "connecting…" never turns green:** the env vars are missing or
  wrong in Vercel. Re-check `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`,
  then redeploy (Vercel → Deployments → ⋯ → Redeploy).
- **Data loads but edits don't sync between people:** confirm the
  `alter publication supabase_realtime add table ...` lines ran (they're in the
  SQL). You can re-run just those lines safely.
- **"permission denied" errors:** the RLS policies didn't get created — re-run
  the policy section of `supabase-schema.sql`.
# bracelet-manager
