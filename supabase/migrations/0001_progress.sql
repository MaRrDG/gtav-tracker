-- One row per completed objective. Absence of a row means not done.
create table if not exists public.progress (
  user_id      uuid not null references auth.users on delete cascade,
  objective_id text not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, objective_id)
);

alter table public.progress enable row level security;

-- The only rule the database needs: a user reaches their own rows and no others.
create policy "own rows" on public.progress
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
