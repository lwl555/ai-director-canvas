import { appendFileSync } from 'node:fs'
const log = (m) => appendFileSync('render11_out/_diag.log', m + '\n')
const AGNES_BASE = 'https://wcnssyiqitugqfmcbdhe.functions.supabase.co/agnes-proxy'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjbnNzeWlxaXR1Z3FmbWNiZGhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0MDEyNzUsImV4cCI6MjA5ODk3NzI3NX0.9EfbEr7BQhZtbOwHJ3IrkOy16kcaxlmzuJuV0A2Z8Eg'
log('START ' + new Date().toISOString())
const t0 = Date.now()
const res = await fetch(AGNES_BASE + '/v1/images/generations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ANON },
  body: JSON.stringify({ model: 'agnes-image-2.1-flash', prompt: 'a red apple on white background, photorealistic', size: '768x1024', extra_body: { response_format: 'url' } })
})
log('HTTP ' + res.status + ' in ' + (Date.now() - t0) + 'ms')
const txt = await res.text()
log('BODY ' + txt.slice(0, 300))
