-- =====================================================================
-- Crowd LED Bracelets — Project Cockpit · Supabase schema + seed
-- Run this in your Supabase project: SQL Editor → New query → paste → Run
-- =====================================================================

-- ---- Tables ----------------------------------------------------------
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  phase text not null,
  title text not null default 'New task',
  owner text not null default 'Unassigned',
  status text not null default 'Not started',
  due date,
  sort int default 0,
  created_at timestamptz default now()
);

create table if not exists budget (
  id uuid primary key default gen_random_uuid(),
  item text not null default 'New line item',
  per_unit numeric default 0,
  qty int default 500,
  one_time numeric default 0,
  sort int default 0,
  created_at timestamptz default now()
);

create table if not exists decisions (
  id uuid primary key default gen_random_uuid(),
  topic text not null default 'New decision',
  choice text default '',
  why text default '',
  sort int default 0,
  created_at timestamptz default now()
);

create table if not exists risks (
  id uuid primary key default gen_random_uuid(),
  risk text not null default 'New risk',
  sev text not null default 'Med',
  mit text default '',
  owner text not null default 'Unassigned',
  sort int default 0,
  created_at timestamptz default now()
);

-- ---- Row Level Security: link-based, anyone-can-edit -----------------
-- NOTE: This makes the board fully open to anyone with your anon key.
-- That's intended for a private link shared with a trusted small team.
-- Do not put sensitive data here, and don't publish the URL publicly.
alter table tasks     enable row level security;
alter table budget    enable row level security;
alter table decisions enable row level security;
alter table risks     enable row level security;

create policy "open tasks"     on tasks     for all using (true) with check (true);
create policy "open budget"    on budget    for all using (true) with check (true);
create policy "open decisions" on decisions for all using (true) with check (true);
create policy "open risks"     on risks     for all using (true) with check (true);

-- ---- Realtime --------------------------------------------------------
alter publication supabase_realtime add table tasks;
alter publication supabase_realtime add table budget;
alter publication supabase_realtime add table decisions;
alter publication supabase_realtime add table risks;

-- ---- Seed data (only inserts if the table is empty) ------------------
insert into tasks (phase, title, owner, status, sort)
select * from (values
  ('P1 · Breadboard proof','Build transmitter: ESP32 + nRF24 +PA+LNA','Eng','Not started',1),
  ('P1 · Breadboard proof','Build 3 receivers: nRF24 + MCU + RTC + WS2812','Eng','Not started',2),
  ('P1 · Breadboard proof','Prove broadcast color/pattern control across a room','Firmware','Not started',3),
  ('P1 · Breadboard proof','Prove deep-sleep -> RTC alarm wake -> radio takeover','Firmware','Not started',4),
  ('P1 · Breadboard proof','Measure deep-sleep current; project dormant-wait time','Hardware','Not started',5),
  ('P2 · PCB design','Draft schematic in ProtoFlow/Flux from finalized BOM','Hardware','Not started',6),
  ('P2 · PCB design','Refine in KiCad; verify RF/antenna section by hand','Hardware','Not started',7),
  ('P2 · PCB design','Lay out inverted-F antenna per radio datasheet geometry','Hardware','Not started',8),
  ('P2 · PCB design','Place RTC on I2C; route alarm line to MCU wake pin','Hardware','Not started',9),
  ('P2 · PCB design','Confirm antenna/battery/NFC not stacked; clean keep-out','Hardware','Not started',10),
  ('P2 · PCB design','Export Gerber + BOM + CPL','Hardware','Not started',11),
  ('P3 · Prototype + firmware','Order ~5 assembled prototype boards','Sourcing','Not started',12),
  ('P3 · Prototype + firmware','Bring up firmware; fix board bugs','Firmware','Not started',13),
  ('P3 · Prototype + firmware','Broadcast protocol + group/zone addressing + clock-set cmd','Firmware','Not started',14),
  ('P3 · Prototype + firmware','State machine: sleep -> RTC wake -> summons -> live mode','Firmware','Not started',15),
  ('P3 · Prototype + firmware','Verify battery life + dormant time on real board','Hardware','Not started',16),
  ('P3 · Prototype + firmware','Board revision spin (budget 2-3)','Hardware','Not started',17),
  ('P4 · Production run','Place 100-500 unit PCBA order','Sourcing','Not started',18),
  ('P4 · Production run','Source silicone bands','Sourcing','Not started',19),
  ('P4 · Production run','Source LiPo cells (plan lithium air-shipping)','Sourcing','Not started',20),
  ('P4 · Production run','Source NTAG213 NFC inlays','Sourcing','Not started',21),
  ('P4 · Production run','Pre-program NFC IDs (phone or USB encoder)','PM','Not started',22),
  ('P5 · Assembly + software','Hand-assemble: board + cell into band, seal, label','PM','Not started',23),
  ('P5 · Assembly + software','Functional test each unit: radio, LED, charge, NFC, RTC','PM','Not started',24),
  ('P5 · Assembly + software','Build setup tool: broadcast clock-set / schedule','Firmware','Not started',25),
  ('P5 · Assembly + software','Build live cue sequencer -> DMX / MIDI / timecode','Firmware','Not started',26)
) as v(phase,title,owner,status,sort)
where not exists (select 1 from tasks);

insert into budget (item, per_unit, qty, one_time, sort)
select * from (values
  ('Assembled PCB (turnkey PCBA)',5.5,500,0,1),
  ('LiPo cell + protection',2.25,500,0,2),
  ('USB-C charge circuit',0.97,500,0,3),
  ('RTC (PCF85063 + cap)',0.6,500,0,4),
  ('NTAG213 NFC inlay',0.17,500,0,5),
  ('Silicone band + enclosure',1.0,500,0,6),
  ('Transmitter hardware (one-time)',0,0,100,7),
  ('Prototype spins (2-3)',0,0,550,8)
) as v(item,per_unit,qty,one_time,sort)
where not exists (select 1 from budget);

insert into decisions (topic, choice, why, sort)
select * from (values
  ('Battery type','Rechargeable LiPo + USB-C','Reusable across events; each wearer charges their own. Amortizes higher unit cost.',1),
  ('Control method','One-way 2.4 GHz RF (nRF24)','Live operator cues during show; broadcast-only keeps bands cheap and simple.',2),
  ('Pre-show behavior','RTC scheduled wake (PCF85063)','Bands light up unattended at showtime to call the crowd in.',3),
  ('Antenna','On-board inverted-F (PCB trace)','Zero part cost; copy datasheet geometry, keep metal/battery clear.',4),
  ('NFC','Passive NTAG213 inlay','Tap-to-assign group/zone ID; no wiring, no firmware, no power.',5),
  ('Volume','100-500 units','Turnkey PCBA in China is the sweet spot for this run.',6)
) as v(topic,choice,why,sort)
where not exists (select 1 from decisions);

insert into risks (risk, sev, mit, owner, sort)
select * from (values
  ('Clock sync across bands','High','Lock down broadcast clock-set at setup; account for drift to showtime','Firmware',1),
  ('Deep-sleep current too high','High','Clean always-on rail for RTC; verify real sleep current on hardware','Hardware',2),
  ('Antenna layout detuned','High','Follow datasheet geometry exactly; keep battery/metal out of keep-out','Hardware',3),
  ('RF absorbed by crowd','Med','Test transmitter in packed room; 1-2 transmitters; antenna faces out','Eng',4),
  ('Lithium shipping/safety','Med','Quality cells; never cut protection; plan air-freight rules','Sourcing',5),
  ('RF regulatory compliance','Med','Confirm spectrum/power limits for operating region','PM',6)
) as v(risk,sev,mit,owner,sort)
where not exists (select 1 from risks);
