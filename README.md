# Flamingods · Midburn Camp Task Manager

A shared, live task manager for the Flamingods camp. Projects live in the left
rail (the LED Bracelet build is the first one, pre-loaded); each project holds
tasks with an **owner, status, start date, and deadline**. A **Camp Members**
tab manages the real people, who become the owner options on every task.

Anyone with the link can view and edit; changes sync live across everyone's
screens.

**Stack:** React (Vite) + Supabase (database + realtime). Both free-tier.

---

## Deploy in 3 steps (~15 min)

### 1 — Supabase
1. **supabase.com** → New project → wait for it to provision.
2. Sidebar → **SQL Editor → New query**. Open **`supabase-schema.sql`** from this
   package, paste the whole thing, **Run**.
   - This one script creates the tables, **grants access to the `anon` role,
     sets the RLS policies, enables realtime, and seeds the bracelet project** —
     all in a single pass. (The grants are what prevent the earlier 401 /
     "permission denied" error; they're baked in now.)
3. Sidebar → **Project Settings → API**. Copy the **Project URL** and the
   **anon public** key.

### 2 — GitHub
```bash
git init
git add .
git commit -m "Flamingods camp task manager"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/flamingods-camp-tasks.git
git push -u origin main
```

### 3 — Vercel
1. **vercel.com** → Add New → Project → import the repo (Vite auto-detected).
2. Expand **Environment Variables**, add:
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon public key
3. **Deploy**. Share the resulting URL with the camp.

> If you change env vars after the first deploy, you must **redeploy**
> (Deployments → ⋯ → Redeploy) for them to take effect.

---

## Using it

- **Left rail** — switch between projects; "+ new project" adds another camp
  workstream (kitchen, power, structure, etc.). Click a project name or emoji at
  the top to rename it.
- **Tasks** — each row has a done checkbox, title, owner, status, **start date**,
  and **deadline**. Deadlines turn **gold** when within a week and **pink/red**
  when overdue. Tasks are grouped into phases; rename a phase by editing it, or
  add a task into a brand-new phase with the bottom button.
- **Filter by owner** at the top to see just one person's tasks.
- **Camp Members** (bottom-left, 🦩) — add the real people and their role. They
  populate the owner dropdown everywhere.

Everything autosaves and syncs live. No save button.

---

## Local dev (optional)
```bash
cp .env.example .env     # paste your two Supabase values
npm install
npm run dev              # http://localhost:5173
```

---

## Notes
- **Access is link-based and open** by design — anyone with the URL can edit.
  Keep the link within the camp. Want a password gate or real logins later? It's
  a small follow-up.
- **Re-running the SQL is safe** — it only seeds when tables are empty and won't
  duplicate.
- **Realtime "already a member" notice** on re-run is harmless; the script
  swallows it.
