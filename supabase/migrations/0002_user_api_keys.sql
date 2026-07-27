-- 用户模型 API Key 存储表（多模型接入）
-- key 仅本人可读写（RLS），前端永不接触明文 key。
create table if not exists public.user_api_keys (
  user_id   uuid    not null references auth.users(id) on delete cascade,
  provider  text    not null,
  api_key   text    not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

alter table public.user_api_keys enable row level security;

drop policy if exists "user_api_keys_owner_rw" on public.user_api_keys;
create policy "user_api_keys_owner_rw"
  on public.user_api_keys
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
