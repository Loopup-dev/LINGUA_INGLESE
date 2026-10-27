-- Schema del database. Da incollare una volta nell'editor SQL di Supabase (SQL Editor > New query > Run).
-- Ogni tabella ha user_id e regole RLS: ognuno vede e modifica solo le proprie righe.

create table if not exists impostazioni (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  dati jsonb not null default '{}',
  aggiornato timestamptz not null default now()
);

create table if not exists video (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  youtube_id text not null,
  titolo text not null default '',
  canale text not null default '',
  durata_sec integer,
  livello text,
  registro text,
  gruppo text,
  fonte text not null,                      -- locale | gemini | manuale
  tempi_approssimativi boolean not null default false,
  sfasamento real not null default 0,       -- correzione generale dei tempi, in secondi
  glossario jsonb not null default '[]',
  ultimo_segmento integer not null default 0,
  creato timestamptz not null default now(),
  unique (user_id, youtube_id)
);

create table if not exists segmenti (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  video_id uuid not null references video on delete cascade,
  idx integer not null,
  inizio real not null,
  fine real not null,
  testo text not null,
  unique (video_id, idx)
);

-- Le carte copiano i dati della clip: sopravvivono anche se il video viene eliminato.
create table if not exists carte (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  video_id uuid references video on delete set null,
  segmento_id uuid references segmenti on delete set null,
  youtube_id text not null,
  tipo text not null check (tipo in ('segmento', 'espressione')),
  testo text not null,
  inizio real not null,
  fine real not null,
  primo_tentativo text not null default '',
  errori jsonb not null default '[]',
  espressione text not null default '',
  spiegazione jsonb,
  registro text,
  origine text not null,                    -- dettato | buchi | visione | espressione
  fsrs jsonb not null,
  scadenza timestamptz not null default now(),
  sospesa boolean not null default false,
  creato timestamptz not null default now(),
  unique (user_id, segmento_id, tipo, espressione)
);

create table if not exists tentativi (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  video_id uuid references video on delete set null,
  segmento_id uuid references segmenti on delete set null,
  modalita text not null,
  accuratezza real not null,
  scritto text not null default '',
  errori jsonb not null default '[]',
  creato timestamptz not null default now()
);

create table if not exists ripassi (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  carta_id uuid not null references carte on delete cascade,
  voto integer not null,
  accuratezza real,
  creato timestamptz not null default now()
);

create table if not exists spiegazioni (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  chiave text not null,
  dati jsonb not null,
  creato timestamptz not null default now(),
  primary key (user_id, chiave)
);

create table if not exists sessioni (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  tipo text not null,
  inizio timestamptz not null,
  secondi integer not null
);

create index if not exists carte_scadenza on carte (user_id, scadenza);
create index if not exists segmenti_video on segmenti (video_id, idx);
create index if not exists tentativi_creato on tentativi (user_id, creato);

do $$
declare t text;
begin
  foreach t in array array['impostazioni','video','segmenti','carte','tentativi','ripassi','spiegazioni','sessioni'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "solo le proprie righe" on %I', t);
    execute format('create policy "solo le proprie righe" on %I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
