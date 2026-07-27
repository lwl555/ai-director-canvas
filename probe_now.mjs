const AGNES_BASE = 'https://wcnssyiqitugqfmcbdhe.functions.supabase.co/agnes-proxy'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjbnNzeWlxaXR1Z3FmbWNiZGhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0MDEyNzUsImV4cCI6MjA5ODk3NzI3NX0.9EfbEr7BQhZtbOwHJ3IrkOy16kcaxlmzuJuV0A2Z8Eg'
async function probe(name, path, body, ms = 30000) {
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), ms)
  const t0 = Date.now()
  try {
    const res = await fetch(AGNES_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ANON },
      body: JSON.stringify(body),
      signal: ctrl.signal
    })
    const txt = await res.text()
    console.log(name, 'OK', res.status, 'in', Date.now() - t0 + 'ms', '::', txt.slice(0, 200))
  } catch (e) {
    console.log(name, 'ERR', e.message, 'after', Date.now() - t0 + 'ms')
  } finally {
    clearTimeout(id)
  }
}
console.log('probe start', new Date().toISOString())
await probe('IMG', '/v1/images/generations', { model: 'agnes-image-2.1-flash', prompt: 'a red apple', size: '768x1024', extra_body: { response_format: 'url' } })
await probe('CHAT', '/v1/chat/completions', { model: 'agnes-2.0-flash', messages: [{ role: 'user', content: 'reply with exactly: ok' }] })
console.log('probe done', new Date().toISOString())
