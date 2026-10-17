-- Schema for app/scripts/build-map-region.ts. Run once in the Supabase SQL editor.

-- Prominence signals. `prominence` (0-100) is computed by the script from
-- Wikidata sitelinks + English Wikipedia pageviews; `prominence_override`
-- is for manual promotion/demotion and is never written by the script.
alter table public.map_locations
  add column if not exists sitelinks integer,
  add column if not exists pageviews integer, -- avg monthly enwiki views, last 12 months
  add column if not exists prominence real,
  add column if not exists prominence_override real;

create index if not exists map_locations_prominence_idx
  on public.map_locations (prominence desc);

-- Wikidata items that must never be (re)added by the script: places deleted
-- by hand because they're closed, never built, or duplicates.
create table if not exists public.map_location_exclusions (
  wikidata_qid text primary key,
  name text,
  reason text,
  created_at timestamptz not null default now()
);

alter table public.map_location_exclusions enable row level security;

insert into public.map_location_exclusions (wikidata_qid, name, reason) values
  ('Q808531', 'Barnum''s American Museum', 'closed'),
  ('Q7579760', 'Sports Museum of America', 'closed'),
  ('Q15032075', 'Guggenheim Museum SoHo', 'closed'),
  ('Q2425363', 'Eden Musée', 'closed'),
  ('Q48744138', 'Chase Manhattan Bank Money Museum', 'closed'),
  ('Q5171466', 'Cornelius Vanderbilt II House', 'closed'),
  ('Q108584685', 'Vanderbilt Triple Palace', 'closed'),
  ('Q4801292', 'Artists'' Choice Museum', 'closed'),
  ('Q6940999', 'Museum of Primitive Art', 'closed'),
  ('Q7013654', 'New York Jazz Museum', 'closed'),
  ('Q5454820', 'Fisher Landau Center', 'closed'),
  ('Q64777431', 'Dongan Oak', 'closed'),
  ('Q112136378', 'Columbia University sundial', 'closed'),
  ('Q3476665', 'Sea Lion Park', 'closed'),
  ('Q3651640', 'Parachute Jump', 'closed'),
  ('Q134174264', 'Dreamland Park', 'closed'),
  ('Q30646742', 'Cannon Coaster', 'closed'),
  ('Q30716992', 'Dreamland', 'closed'),
  ('Q39052990', 'Drop the Dip', 'closed'),
  ('Q3361454', 'Palisades Amusement Park', 'closed'),
  ('Q5500854', 'Freedomland U.S.A.', 'closed'),
  ('Q112150893', 'American LGBTQ+ Museum', 'never built'),
  ('Q16982729', 'New York Wheel', 'never built'),
  ('Q18154623', 'Morbid Anatomy Museum', 'closed'),
  ('Q28206317', 'New York Museum', 'closed'),
  ('Q106391156', 'Museum of Broken Windows', 'closed'),
  ('Q18158896', 'Toy Museum of NY', 'closed'),
  ('Q57733503', 'Museum of Pizza', 'closed'),
  ('Q29832374', 'A Subtlety', 'closed'),
  ('Q924944', 'Luna Park', 'closed'),
  ('Q3039284', 'Dreamland', 'closed'),
  ('Q87729769', 'Nickelodeon Slime Streak', 'duplicate of Q105095530'),
  ('Q66722774', 'Top of the Rock', 'duplicate of Q23899574'),
  ('Q106940680', 'Universal Hip Hop Museum', 'duplicate of Q108739779')
on conflict (wikidata_qid) do nothing;
