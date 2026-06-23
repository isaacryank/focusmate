create extension if not exists pgcrypto;

create table if not exists public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_id text not null,
  task_id uuid null,
  task_local_id text null,
  task_title_snapshot text null,
  task_type_snapshot text null check (
    task_type_snapshot is null
    or task_type_snapshot in ('task', 'meeting', 'date', 'focus_without_task')
  ),
  started_at timestamptz null,
  ended_at timestamptz null,
  duration_minutes integer not null default 0 check (duration_minutes >= 0),
  focus_minutes integer null check (focus_minutes is null or focus_minutes >= 0),
  break_minutes integer null check (break_minutes is null or break_minutes >= 0),
  preset text null,
  status text not null default 'completed' check (
    status in ('completed', 'stopped', 'skipped')
  ),
  quality text null check (quality is null or quality in ('clean', 'distracted')),
  score integer null check (score is null or (score >= 0 and score <= 100)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_id)
);

create index if not exists focus_sessions_user_ended_at_idx
  on public.focus_sessions (user_id, ended_at desc);

alter table public.focus_sessions enable row level security;

drop policy if exists "Users can read own focus sessions" on public.focus_sessions;
create policy "Users can read own focus sessions"
  on public.focus_sessions
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own focus sessions" on public.focus_sessions;
create policy "Users can insert own focus sessions"
  on public.focus_sessions
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own focus sessions" on public.focus_sessions;
create policy "Users can update own focus sessions"
  on public.focus_sessions
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own focus sessions" on public.focus_sessions;
create policy "Users can delete own focus sessions"
  on public.focus_sessions
  for delete
  using (auth.uid() = user_id);

create table if not exists public.milo_resources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_id text not null,
  task_id uuid null,
  task_local_id text null,
  task_title_snapshot text null,
  task_type_snapshot text null check (
    task_type_snapshot is null
    or task_type_snapshot in ('task', 'meeting', 'date')
  ),
  title text not null,
  description text null,
  category text null,
  source_type text null check (
    source_type is null
    or source_type in (
      'Website',
      'Search',
      'YouTube',
      'Docs',
      'Map',
      'Checklist',
      'Scholar'
    )
  ),
  url text not null,
  reason text null,
  saved boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_id)
);

create index if not exists milo_resources_user_created_at_idx
  on public.milo_resources (user_id, created_at desc);

alter table public.milo_resources enable row level security;

drop policy if exists "Users can read own Milo resources" on public.milo_resources;
create policy "Users can read own Milo resources"
  on public.milo_resources
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own Milo resources" on public.milo_resources;
create policy "Users can insert own Milo resources"
  on public.milo_resources
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own Milo resources" on public.milo_resources;
create policy "Users can update own Milo resources"
  on public.milo_resources
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own Milo resources" on public.milo_resources;
create policy "Users can delete own Milo resources"
  on public.milo_resources
  for delete
  using (auth.uid() = user_id);

create table if not exists public.online_meeting_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_id text not null,
  task_id uuid null,
  task_local_id text not null,
  task_title_snapshot text null,
  provider text null,
  url text not null,
  label text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_id),
  unique (user_id, task_local_id)
);

create index if not exists online_meeting_links_user_updated_at_idx
  on public.online_meeting_links (user_id, updated_at desc);

alter table public.online_meeting_links enable row level security;

drop policy if exists "Users can read own online meeting links" on public.online_meeting_links;
create policy "Users can read own online meeting links"
  on public.online_meeting_links
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own online meeting links" on public.online_meeting_links;
create policy "Users can insert own online meeting links"
  on public.online_meeting_links
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own online meeting links" on public.online_meeting_links;
create policy "Users can update own online meeting links"
  on public.online_meeting_links
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own online meeting links" on public.online_meeting_links;
create policy "Users can delete own online meeting links"
  on public.online_meeting_links
  for delete
  using (auth.uid() = user_id);

create table if not exists public.user_app_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  recent_sessions_cleared_at timestamptz null,
  ai_online_enabled boolean null,
  local_only_mode boolean null,
  updated_at timestamptz not null default now()
);

alter table public.user_app_preferences enable row level security;

drop policy if exists "Users can read own app preferences" on public.user_app_preferences;
create policy "Users can read own app preferences"
  on public.user_app_preferences
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own app preferences" on public.user_app_preferences;
create policy "Users can insert own app preferences"
  on public.user_app_preferences
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own app preferences" on public.user_app_preferences;
create policy "Users can update own app preferences"
  on public.user_app_preferences
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
