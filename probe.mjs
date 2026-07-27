const AGNES_BASE = 'https://wcnssyiqitugqfmcbdhe.functions.supabase.co/agnes-proxy'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjbnNzeWlxaXR1Z3FmbWNiZGhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0MDEyNzUsImV4cCI6MjA5ODk3NzI3NX0.9EfbEr7BQhZtbOwHJ3IrkOy16kcaxlmzuJuV0A2Z8Eg'
const url = AGNES_BASE + '/v1/images/generations'
const body = JSON.stringify({ model: 'agnes-image-2.1-flash', prompt: 'a red apple', size: '768x1024', extra_body: { response_format: 'url' } })
console.log('POST', url)
const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ANON }, body })
console.log('STATUS', res.status)
const t = await res.text()
console.log('BODY', t.slice(0, 500))
