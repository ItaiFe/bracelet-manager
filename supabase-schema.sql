-- =====================================================================
-- Flamingods · Midburn Camp Task Manager — Supabase schema + seed
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Idempotent and self-contained: creates tables, grants, RLS, realtime,
-- and seed data in a single clean pass. Safe to re-run.
-- =====================================================================

-- ---- Tables ----------------------------------------------------------
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'New project',
  emoji text default '',
  sort int default 0,
  created_at timestamptz default now()
);

create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'New member',
  role text default '',
  sort int default 0,
  created_at timestamptz default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  phase text default '',
  title text not null default 'New task',
  owner text default 'Unassigned',
  status text not null default 'Not started',
  start_date date,
  deadline date,
  sort int default 0,
  created_at timestamptz default now()
);

-- ---- Grants (prevents the 42501 / 401 permission errors) -------------
grant usage on schema public to anon, authenticated;
grant all on table public.projects to anon, authenticated;
grant all on table public.people   to anon, authenticated;
grant all on table public.tasks    to anon, authenticated;

-- ---- Row Level Security: link-based, anyone-with-link can edit -------
alter table public.projects enable row level security;
alter table public.people   enable row level security;
alter table public.tasks    enable row level security;

drop policy if exists "open projects" on public.projects;
drop policy if exists "open people"   on public.people;
drop policy if exists "open tasks"    on public.tasks;

create policy "open projects" on public.projects for all using (true) with check (true);
create policy "open people"   on public.people   for all using (true) with check (true);
create policy "open tasks"    on public.tasks    for all using (true) with check (true);

-- ---- Realtime (ignore "already member" notices on re-run) ------------
do $$
begin
  begin alter publication supabase_realtime add table public.projects; exception when others then null; end;
  begin alter publication supabase_realtime add table public.people;   exception when others then null; end;
  begin alter publication supabase_realtime add table public.tasks;    exception when others then null; end;
end $$;

-- ---- Seed: the bracelet project + its tasks --------------------------
-- People: starter roles you can rename to real members in-app.
insert into people (name, role, sort)
select * from (values
  ('Unassigned','', 0)
) as v(name,role,sort)
where not exists (select 1 from people);

-- Bracelet project
insert into projects (name, emoji, sort)
select 'LED Bracelets', '💡', 1
where not exists (select 1 from projects where name = 'LED Bracelets');

-- Bracelet tasks (linked to the project by name lookup)
insert into tasks (project_id, phase, title, owner, status, sort)
select p.id, v.phase, v.title, 'Unassigned', 'Not started', v.sort
from projects p
cross join (values
  ('P1 · Breadboard proof','Build transmitter: ESP32 + nRF24 +PA+LNA',1),
  ('P1 · Breadboard proof','Build 3 receivers: nRF24 + MCU + RTC + WS2812',2),
  ('P1 · Breadboard proof','Prove broadcast color/pattern control across a room',3),
  ('P1 · Breadboard proof','Prove deep-sleep -> RTC alarm wake -> radio takeover',4),
  ('P1 · Breadboard proof','Measure deep-sleep current; project dormant-wait time',5),
  ('P2 · PCB design','Draft schematic in ProtoFlow/Flux from finalized BOM',6),
  ('P2 · PCB design','Refine in KiCad; verify RF/antenna section by hand',7),
  ('P2 · PCB design','Lay out inverted-F antenna per radio datasheet geometry',8),
  ('P2 · PCB design','Place RTC on I2C; route alarm line to MCU wake pin',9),
  ('P2 · PCB design','Confirm antenna/battery/NFC not stacked; clean keep-out',10),
  ('P2 · PCB design','Export Gerber + BOM + CPL',11),
  ('P3 · Prototype + firmware','Order ~5 assembled prototype boards',12),
  ('P3 · Prototype + firmware','Bring up firmware; fix board bugs',13),
  ('P3 · Prototype + firmware','Broadcast protocol + group/zone addressing + clock-set cmd',14),
  ('P3 · Prototype + firmware','State machine: sleep -> RTC wake -> summons -> live mode',15),
  ('P3 · Prototype + firmware','Verify battery life + dormant time on real board',16),
  ('P3 · Prototype + firmware','Board revision spin (budget 2-3)',17),
  ('P4 · Production run','Place 100-500 unit PCBA order',18),
  ('P4 · Production run','Source silicone bands',19),
  ('P4 · Production run','Source LiPo cells (plan lithium air-shipping)',20),
  ('P4 · Production run','Source NTAG213 NFC inlays',21),
  ('P4 · Production run','Pre-program NFC IDs (phone or USB encoder)',22),
  ('P5 · Assembly + software','Hand-assemble: board + cell into band, seal, label',23),
  ('P5 · Assembly + software','Functional test each unit: radio, LED, charge, NFC, RTC',24),
  ('P5 · Assembly + software','Build setup tool: broadcast clock-set / schedule',25),
  ('P5 · Assembly + software','Build live cue sequencer -> DMX / MIDI / timecode',26)
) as v(phase,title,sort)
where p.name = 'LED Bracelets'
  and not exists (select 1 from tasks t where t.project_id = p.id);
