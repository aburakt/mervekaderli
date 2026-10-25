import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { compare, localHooks, localMigrations, type Snapshot } from "../scripts/drift-check"
import { SITE_ID, startPb, type Pb } from "../scripts/pb-harness"
import { SITE } from "../site.config"

// ORTAK (core): template'ten gelir, sitede elle değiştirilmez. Değişiklik kaydı, sürüm ucu ve GlitchTip bildirimi.
type Hit = { path: string; auth: string; body: { message?: string; tags?: Record<string, string> } }
const hits: Hit[] = []
const glitchtip = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(req) {
    hits.push({ path: new URL(req.url).pathname, auth: req.headers.get("x-sentry-auth") ?? "", body: await req.json() })
    return Response.json({ id: "x" })
  },
})
const { collection, create, update } = SITE.hookSample
let pb: Pb

beforeAll(async () => {
  pb = await startPb({
    CF_PAGES_DEPLOY_HOOK: "http://127.0.0.1:1/hook",
    GLITCHTIP_DSN: `http://testkey@127.0.0.1:${glitchtip.port}/7`,
  })
}, 120_000)
afterAll(async () => {
  await pb?.stop()
  glitchtip.stop(true)
})

const auditRows = async (recordId: string) => {
  const res = await pb.admin(`/api/collections/audit_log/records?filter=${encodeURIComponent(`record_id="${recordId}"`)}&sort=created`)
  expect(res.status).toBe(200)
  return ((await res.json()) as { items: { action: string; actor: string; collection_name: string; fields: string[] | null }[] }).items
}

describe("değişiklik kaydı (audit_log)", () => {
  test("ekleme, değiştirme ve silme kim tarafından yapıldıysa kaydedilir", async () => {
    const res = await pb.admin(`/api/collections/${collection}/records`, { method: "POST", body: JSON.stringify(create) })
    expect(res.status).toBe(200)
    const id = ((await res.json()) as { id: string }).id
    const patch = update(1)
    expect((await pb.admin(`/api/collections/${collection}/records/${id}`, { method: "PATCH", body: JSON.stringify(patch) })).status).toBe(200)
    expect((await pb.admin(`/api/collections/${collection}/records/${id}`, { method: "DELETE" })).status).toBe(204)

    const rows = await auditRows(id)
    expect(rows.map((r) => r.action)).toEqual(["create", "update", "delete"])
    expect(rows.every((r) => r.collection_name === collection && r.actor.includes("@"))).toBe(true)
    expect(rows[1]?.fields).toEqual(expect.arrayContaining(Object.keys(patch)))
  }, 60_000)

  test("kayıt ziyaretçiye kapalıdır", async () => {
    expect((await pb.api("/api/collections/audit_log/records")).status).toBe(403)
  })
})

describe("sürüm ucu", () => {
  test("hook sha256'ları ve uygulanan migration'lar herkese açık okunur", async () => {
    const res = await pb.api(`/api/${SITE_ID}/core-version`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { hooks: Record<string, string>; migrations: string[] }
    const local = createHash("sha256").update(readFileSync(join(import.meta.dir, "..", "pb", "pb_hooks", "ops.pb.js"))).digest("hex")
    expect(body.hooks["ops.pb.js"]).toBe(local)
    expect(body.migrations).toContain("1792000000_core_audit_log.js")
  })

  test("drift-check: aynı dosyalarla çalışan PB'de fark yok, değişen dosya raporlanır", async () => {
    const remote = (await (await pb.api(`/api/${SITE_ID}/core-version`)).json()) as Snapshot
    const local = { hooks: localHooks(), migrations: localMigrations() }
    expect(compare(local, remote)).toEqual([])
    const changed = { ...remote, hooks: { ...remote.hooks, "ops.pb.js": "eski" } }
    expect(compare(local, changed)).toEqual(["- `pb_hooks/ops.pb.js` sunucuda farklı"])
  })
})

describe("GlitchTip", () => {
  test("yayın hatası DSN'deki projeye gönderilir, gizli bağlantı sızmaz", async () => {
    expect((await pb.admin(`/api/${SITE_ID}/deploy`, { method: "POST" })).status).toBe(500)
    const hit = hits.find((h) => h.path === "/api/7/store/")
    expect(hit).toBeDefined()
    expect(hit?.auth).toContain("sentry_key=testkey")
    expect(hit?.body.tags?.site).toBe(SITE_ID)
    expect(JSON.stringify(hit?.body)).not.toContain("127.0.0.1:1/hook")
  }, 30_000)
})
