import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { SITE_ID, startPb, type Pb } from "../scripts/pb-harness"
import { SITE } from "../site.config"

// ORTAK (core): template'ten gelir, sitede elle değiştirilmez. Test kaydı site.config.ts hookSample'dan.
const hits: string[] = []
const hookServer = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(req) { hits.push(new URL(req.url).pathname); return new Response("ok") } })
const { collection, create, update } = SITE.hookSample
const deployPath = `/api/${SITE_ID}/deploy`
let pb: Pb
let bad: Pb
let recordId = ""

const waitFor = async (cond: () => boolean, ms: number) => {
  const end = Date.now() + ms
  while (Date.now() < end) { if (cond()) return true; await Bun.sleep(500) }
  return cond()
}

beforeAll(async () => {
  pb = await startPb({ CF_PAGES_DEPLOY_HOOK: `http://127.0.0.1:${hookServer.port}/hook`, DEPLOY_QUIET_MS: "3000" })
  const res = await pb.admin(`/api/collections/${collection}/records`, { method: "POST", body: JSON.stringify(create) })
  if (!res.ok) throw new Error(`hookSample kaydı açılamadı: ${res.status} ${await res.text()}`)
  recordId = ((await res.json()) as { id: string }).id
  expect((await pb.admin(deployPath, { method: "POST" })).status).toBe(200) // kirli işareti temizler: 1 çağrı
  bad = await startPb({ CF_PAGES_DEPLOY_HOOK: "http://127.0.0.1:1/hooks/SECRET-TOKEN-XYZ" })
}, 120_000)
afterAll(async () => {
  await pb?.stop()
  await bad?.stop()
  hookServer.stop(true)
})

describe("yayın hook'u", () => {
  test("elle yayın: anonim 401, superuser deploy hook'unu bir kez çağırır", async () => {
    expect((await pb.api(deployPath, { method: "POST" })).status).toBe(401)
    expect(hits.length).toBe(1)
  })

  test("art arda 3 kayıt değişikliği tek deploy üretir (debounce)", async () => {
    for (const n of [1, 2, 3]) {
      const res = await pb.admin(`/api/collections/${collection}/records/${recordId}`, { method: "PATCH", body: JSON.stringify(update(n)) })
      expect(res.status).toBe(200)
    }
    expect(await waitFor(() => hits.length === 2, 130_000)).toBe(true)
    await Bun.sleep(5_000)
    expect(hits.length).toBe(2)
  }, 150_000)

  test("yayından kaldırma da yeniden build tetikler", async () => {
    const before = hits.length
    const res = await pb.admin(`/api/collections/${collection}/records/${recordId}`, { method: "PATCH", body: JSON.stringify({ published: false }) })
    expect(res.status).toBe(200)
    expect(await waitFor(() => hits.length === before + 1, 130_000)).toBe(true)
  }, 150_000)

  test("deploy bağlantısı (gizli anahtar) hata cevabında sızmaz", async () => {
    const res = await bad.admin(deployPath, { method: "POST" })
    expect(res.status).toBe(500)
    const body = await res.text()
    expect(body).not.toContain("SECRET-TOKEN-XYZ")
    expect(body).toContain("<deploy-hook>")
  })
})
