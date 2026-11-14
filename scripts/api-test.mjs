const API = 'http://localhost:8787'
const results = []
const check = (name, cond, extra = '') => {
  results.push({ name, ok: Boolean(cond), extra })
  if (!cond) console.log('FAIL:', name, extra)
}

async function req(path, { method = 'GET', body, cookie, raw, headers = {} } = {}) {
  const h = { ...headers }
  if (body !== undefined) h['content-type'] = 'application/json'
  if (cookie) h.cookie = cookie
  const res = await fetch(`${API}${path}`, {
    method,
    headers: h,
    body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
  })
  const setCookie = res.headers.getSetCookie?.()[0]
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  return { status: res.status, data, cookie: setCookie ? setCookie.split(';')[0] : undefined }
}

const stamp = Date.now().toString(36)
const userA = `testa_${stamp}`.slice(0, 32)
const userB = `testb_${stamp}`.slice(0, 32)

// register
const regA = await req('/api/auth/register', { method: 'POST', body: { username: userA, password: 'test1234' } })
check('register A', regA.status === 201 && regA.cookie)
const cookieA = regA.cookie
const poolA = regA.data.pools[0].id

// items
const titles = ['A1', 'A2', 'A3', 'A4', 'A5']
const save = await req(`/api/pools/${poolA}/items`, {
  method: 'PUT', cookie: cookieA,
  body: { items: titles.map((title, i) => ({ title, imageUrl: '', weight: 1, category: '测试', tags: [], isFavorite: false })) },
})
check('save items', save.status === 200 && save.data.items.length === 5)
check('items order', save.data.items.map((i) => i.title).join(',') === 'A1,A2,A3,A4,A5')

// draw 2, no repeats
const d1 = await req(`/api/pools/${poolA}/draw`, { method: 'POST', cookie: cookieA, body: { resultCount: 2 } })
check('draw 2', d1.status === 201 && d1.data.results.length === 2)
check('no duplicate in round', new Set(d1.data.results.map((r) => r.itemId)).size === 2)
check('eligible list present', d1.data.eligibleItemIds?.length >= 2)

// complete twice -> idempotent
const c1 = await req(`/api/draws/${d1.data.drawId}/complete`, { method: 'POST', cookie: cookieA })
const c2 = await req(`/api/draws/${d1.data.drawId}/complete`, { method: 'POST', cookie: cookieA })
check('complete once', c1.status === 201 && c1.data.history)
check('complete idempotent', c2.data?.alreadySaved === true && c2.data.history.id === c1.data.history.id)
const hist1 = await req('/api/history?limit=10', { cookie: cookieA })
check('history one row', hist1.data.total === 1)

const previousRoundIds = new Set(c1.data.history.results.map((r) => r.itemId))

// exclusion on, 1 round
await req(`/api/pools/${poolA}/settings`, { method: 'PUT', cookie: cookieA, body: { exclusionEnabled: true, exclusionRounds: 1 } })
const d2 = await req(`/api/pools/${poolA}/draw`, { method: 'POST', cookie: cookieA, body: { resultCount: 2 } })
check('exclusion draw', d2.status === 201)
check('excluded previous round', d2.data.results.every((r) => !previousRoundIds.has(r.itemId)))
await req(`/api/draws/${d2.data.drawId}/complete`, { method: 'POST', cookie: cookieA })

// exclusion too strict
const d3 = await req(`/api/pools/${poolA}/draw`, { method: 'POST', cookie: cookieA, body: { resultCount: 4 } })
check('exclusion insufficient', d3.status === 400 && d3.data.error.code === 'INSUFFICIENT_ITEMS', JSON.stringify(d3.data))

// redraw rules
const d4 = await req(`/api/pools/${poolA}/draw`, { method: 'POST', cookie: cookieA, body: { resultCount: 2 } })
check('draw for redraw', d4.status === 201)
const old = d4.data.results[0]
const otherIds = new Set([d4.data.results[1].itemId])
let redrawOk = true
let redrawDetails = ''
for (let i = 0; i < 8; i++) {
  const r = await req(`/api/draws/${d4.data.drawId}/redraw`, { method: 'POST', cookie: cookieA, body: { index: 0 } })
  if (r.status !== 200) { redrawOk = false; redrawDetails = JSON.stringify(r.data); break }
  if (otherIds.has(r.data.item.itemId)) { redrawOk = false; redrawDetails = 'duplicate other result'; break }
}
check('redraw keeps other result', redrawOk, redrawDetails)
const completed4 = await req(`/api/draws/${d4.data.drawId}/complete`, { method: 'POST', cookie: cookieA })
check('redraw snapshots consistent', completed4.status === 201 && completed4.data.history.results.length === 2)

// weight distribution: new pool with weight 9 vs 1
const poolW = await req('/api/pools', { method: 'POST', cookie: cookieA, body: { name: '权重测试' } })
const wp = poolW.data.pool.id
await req(`/api/pools/${wp}/items`, {
  method: 'PUT', cookie: cookieA,
  body: { items: [
    { title: '轻', imageUrl: '', weight: 1, category: '', tags: [], isFavorite: false },
    { title: '重', imageUrl: '', weight: 9, category: '', tags: [], isFavorite: false },
  ] },
})
await req(`/api/pools/${wp}/settings`, { method: 'PUT', cookie: cookieA, body: { exclusionEnabled: false, resultCount: 1 } })
let heavy = 0
const N = 60
for (let i = 0; i < N; i++) {
  const d = await req(`/api/pools/${wp}/draw`, { method: 'POST', cookie: cookieA })
  if (d.data.results[0]?.title === '重') heavy++
}
check('weighted distribution', heavy >= N * 0.72 && heavy <= N * 0.99, `${heavy}/${N}`)

// weight zero rejected
const badWeight = await req(`/api/pools/${wp}/items`, {
  method: 'PUT', cookie: cookieA,
  body: { items: [{ title: '坏', imageUrl: '', weight: 0, category: '', tags: [], isFavorite: false }] },
})
check('weight <= 0 rejected', badWeight.status === 400)

// image upload + isolation
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
const form = new FormData()
form.append('image', new Blob([png], { type: 'image/png' }), 'dot.png')
const upRes = await fetch(`${API}/api/uploads`, { method: 'POST', headers: { cookie: cookieA }, body: form })
const upData = await upRes.json()
check('upload', upRes.status === 201 && upData.url?.startsWith(`/uploads/`), JSON.stringify(upData))
const imgA = await fetch(`${API}${upData.url}`, { headers: { cookie: cookieA } })
check('image owner access', imgA.status === 200)

// register B, isolation
const regB = await req('/api/auth/register', { method: 'POST', body: { username: userB, password: 'test1234' } })
const cookieB = regB.cookie
const poolReadB = await req(`/api/pools/${poolA}`, { cookie: cookieB })
check('pool isolation', poolReadB.status === 404)
const histReadB = await req(`/api/history/${c1.data.history.id}`, { cookie: cookieB })
check('history isolation', histReadB.status === 404)
const imgB = await fetch(`${API}${upData.url}`, { headers: { cookie: cookieB } })
check('image isolation', imgB.status === 403)
const delB = await req(`/api/pools/${poolA}`, { method: 'DELETE', cookie: cookieB })
check('pool delete isolation', delB.status === 404)

// templates import + dedupe
const imp1 = await req('/api/templates/what-to-eat/import', { method: 'POST', cookie: cookieA, body: { name: '模板测试', dedupe: true } })
check('template import', imp1.status === 201 && imp1.data.added === 16 && imp1.data.created)
const imp2 = await req('/api/templates/what-to-eat/import', { method: 'POST', cookie: cookieA, body: { poolId: imp1.data.poolId, dedupe: true } })
check('template dedupe', imp2.status === 200 && imp2.data.added === 0 && imp2.data.skipped === 16, JSON.stringify(imp2.data))

// pool delete keeps history snapshot
const delPool = await req(`/api/pools/${poolA}`, { method: 'DELETE', cookie: cookieA })
check('pool delete', delPool.status === 200)
const histAfterDelete = await req(`/api/history/${c1.data.history.id}`, { cookie: cookieA })
check('history survives pool delete', histAfterDelete.status === 200 && histAfterDelete.data.record.results.length === 2)

// pagination / clear
const clear = await req('/api/history', { method: 'DELETE', cookie: cookieA })
check('clear history', clear.status === 200 && clear.data.deleted >= 1)

// logout
const logout = await req('/api/auth/logout', { method: 'POST', cookie: cookieA })
const meAfter = await req('/api/auth/me', { cookie: cookieA })
check('logout invalidates session', logout.status === 204 && meAfter.status === 401)

// bad login
const badLogin = await req('/api/auth/login', { method: 'POST', body: { username: userA, password: 'nope' } })
check('bad login rejected', badLogin.status === 401)

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) console.log(JSON.stringify(failed, null, 2))
