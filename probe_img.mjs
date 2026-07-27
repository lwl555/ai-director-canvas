// 单图探测：超时 90s，模拟 render13 genImage 的真实超时上限
const AGNES_BASE = 'https://wcnssyiqitugqfmcbdhe.functions.supabase.co/agnes-proxy'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjbnNzeWlxaXR1Z3FmbWNiZGhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0MDEyNzUsImV4cCI6MjA5ODk3NzI3NX0.9EfbEr7BQhZtbOwHJ3IrkOy16kcaxlmzuJuV0A2Z8Eg'
const ctrl = new AbortController()
const id = setTimeout(() => ctrl.abort(), 90_000)
const t0 = Date.now()
fetch(AGNES_BASE + '/v1/images/generations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ANON },
  body: JSON.stringify({ model: 'agnes-image-2.1-flash', prompt: 'a red apple on white table', size: '768x1024', extra_body: { response_format: 'url' } }),
  signal: ctrl.signal
}).then(async r => {
  const t = await r.text()
  console.log('IMG_STATUS', r.status, 'in', Date.now() - t0 + 'ms')
  console.log(t.slice(0, 240))
}).catch(e => console.log('IMG_ERR', e.message, 'after', Date.now() - t0 + 'ms'))
  .finally(() => clearTimeout(id))
