-- 无登录云同步表：按匿名 device_id 隔离存储平台数据（对话/智能体/API Key/快应用）。
-- 由 sync-proxy Edge Function 用 service_role 直写（绕过 RLS），仅触达 device_id = 入参 的行。
-- 部署步骤：
--   1. 在 Supabase Dashboard → SQL Editor 执行本文件建表。
--   2. 在 Edge Functions 新建函数 `sync-proxy`，粘贴 supabase/functions/sync-proxy/index.ts，Deploy。
--   3. 前端 .env 配置 VITE_SUPABASE_URL / VITE_SUPABASE_ANON（已配），重新构建部署即可云同步。

create table if not exists public.device_sync (
  device_id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 仅函数端 service_role 访问；这里关闭匿名直接访问，隔离靠 device_id 入参精度（128 位 UUID 不可猜）。
alter table public.device_sync enable row level security;

-- 匿名角色不可直接读写（所有访问经 sync-proxy 的 service_role）
create policy "anon_no_access" on public.device_sync
  for all to anon
  using (false) with check (false);
