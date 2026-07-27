// 无登录云同步代理 Edge Function
// 以匿名 device_id（UUID）为主键，按设备隔离读写 device_sync 表的 payload。
// deviceId 即凭证：128 位随机 UUID 不可猜，故无需登录即可安全隔离。
// 使用 service_role 直写（绕过 RLS），但只触达 device_id = 入参 的行，逻辑上完成隔离。
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.200.0/http/server.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_BYTES = 1_000_000

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' }
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { deviceId, payload } = await req.json()
    if (!UUID.test(deviceId)) return json({ error: 'invalid deviceId' }, 400)

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // payload === null 视为「拉取」
    if (payload === null || payload === undefined) {
      const { data } = await sb
        .from('device_sync')
        .select('payload')
        .eq('device_id', deviceId)
        .single()
      return json({ payload: data?.payload ?? {} })
    }

    const raw = JSON.stringify(payload)
    if (raw.length > MAX_BYTES) return json({ error: 'payload too large' }, 413)

    const { data, error } = await sb
      .from('device_sync')
      .upsert({ device_id: deviceId, payload, updated_at: new Date().toISOString() })
      .select('payload')
      .single()
    if (error) return json({ error: error.message }, 500)
    return json({ payload: data.payload })
  } catch (e: any) {
    return json({ error: e?.message ?? 'sync error' }, 500)
  }
})
