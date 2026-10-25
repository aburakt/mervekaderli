import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { startPb, type Pb } from "../scripts/pb-harness"
import { checkLock } from "../scripts/core-sync"

// ORTAK (core): template'ten gelir, sitede elle değiştirilmez. Her sitede aynı standartları ölçer:
// core dosyaları elle değişmemiş, şema kuralları, panelin müşteriye hazır olması, inline stil/betik yok.
const ROOT = join(import.meta.dir, "..")
const site = require(join(ROOT, "pb", "pb_hooks", "site.js")) as { ID: string; CONTENT: string[]; RULES: Record<string, unknown>; FORMS?: string[] }
const FORMS = site.FORMS ?? []
// core'un kendi koleksiyonları (core migration'larıyla gelir): içerik değil, yayın tetiklemez, yalnız superuser okur
const CORE_COLLECTIONS = ["audit_log"]

type Field = { name: string; type: string; help: string; system: boolean; hidden: boolean; presentable: boolean }
type Collection = {
  name: string; system: boolean; fields: Field[]
  listRule: string | null; viewRule: string | null; createRule: string | null; updateRule: string | null; deleteRule: string | null
}

let pb: Pb
let cols: Collection[] = []
beforeAll(async () => {
  pb = await startPb()
  cols = ((await (await pb.admin("/api/collections?perPage=200")).json()) as { items: Collection[] }).items.filter((c) => !c.system)
}, 300_000)
afterAll(async () => {
  await pb?.stop()
})

describe("core", () => {
  test("core dosyaları template sürümüyle aynı (core.lock)", () => {
    const changed = checkLock(ROOT)
    // Değiştirmek gerekiyorsa template'te değiştirin, sonra sitede `bun run core:sync` çalıştırın.
    expect(changed).toEqual([])
  })
})

describe("şema standardı", () => {
  test("site.js CONTENT şemadaki koleksiyonların tamamı (yeni koleksiyon yayın hook'una da eklenir)", () => {
    expect([...site.CONTENT].sort()).toEqual(cols.map((c) => c.name).filter((n) => !FORMS.includes(n) && !CORE_COLLECTIONS.includes(n)).sort())
  })
  test("RULES yalnız var olan koleksiyonları anar", () => {
    expect(Object.keys(site.RULES).filter((n) => !cols.some((c) => c.name === n))).toEqual([])
  })
  test("yazma yalnız superuser; okuma herkese açık ya da published = true ile sınırlı (FORMS: ziyaretçi yalnız gönderir)", () => {
    const bad: string[] = []
    for (const c of cols) {
      if (CORE_COLLECTIONS.includes(c.name)) {
        for (const k of ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"] as const) if (c[k] !== null) bad.push(`${c.name}.${k} = ${JSON.stringify(c[k])}`)
        continue
      }
      if (FORMS.includes(c.name)) {
        // ziyaretçi gönderir (createRule açık), yalnız superuser okur ve yönetir
        for (const k of ["listRule", "viewRule", "updateRule", "deleteRule"] as const) if (c[k] !== null) bad.push(`${c.name}.${k} = ${JSON.stringify(c[k])}`)
        continue
      }
      for (const k of ["createRule", "updateRule", "deleteRule"] as const) if (c[k] !== null) bad.push(`${c.name}.${k} = ${JSON.stringify(c[k])}`)
      for (const k of ["listRule", "viewRule"] as const) {
        const r = c[k]
        if (r === null || (r !== "" && !r.includes("published = true"))) bad.push(`${c.name}.${k} = ${JSON.stringify(r)}`)
      }
      if (c.listRule !== c.viewRule) bad.push(`${c.name}: listRule ile viewRule farklı`)
    }
    expect(bad).toEqual([])
  })
  test("published = true kuralı olan koleksiyonda published alanı var", () => {
    // "summit.published = true" gibi ilişki üzerinden kural kendi alanını gerektirmez
    const own = /(^|[^.\w])published\s*=\s*true/
    const bad = cols.filter((c) => own.test(c.listRule ?? "") && !c.fields.some((f) => f.name === "published" && f.type === "bool"))
    expect(bad.map((c) => c.name)).toEqual([])
  })
})

describe("panel müşteriye hazır", () => {
  test("şema düğmeleri gizli, kullanılmayan users koleksiyonu yok", async () => {
    const s = (await (await pb.admin("/api/settings")).json()) as { meta: { appName: string; hideControls: boolean } }
    expect(s.meta.hideControls).toBe(true)
    expect(s.meta.appName).not.toBe("Acme")
    expect((await pb.admin("/api/collections/users")).status).toBe(404)
  })
  test("her alanda Türkçe yardım metni, her koleksiyonda okunur alan", () => {
    const noHelp = cols.flatMap((c) => c.fields.filter((f) => !f.system && f.type !== "autodate" && !f.help).map((f) => `${c.name}.${f.name}`))
    expect(noHelp).toEqual([])
    expect(cols.filter((c) => !c.fields.some((f) => f.presentable)).map((c) => c.name)).toEqual([])
  })
  test("yedek, rate limit ve güvenilir proxy ayarları migration ile gelir", async () => {
    const s = (await (await pb.admin("/api/settings")).json()) as { backups: { cron: string }; rateLimits: { enabled: boolean; rules: { label: string }[] }; trustedProxy: { headers: string[] } }
    expect(s.backups.cron).toBeTruthy()
    expect(s.rateLimits.enabled).toBe(true)
    expect(s.rateLimits.rules.map((r) => r.label)).toContain("*:file")
    expect(s.trustedProxy.headers).toEqual(["X-Forwarded-For"])
  })
})

describe("CSP: kaynakta inline stil ve betik yok", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]))
  const files = walk(join(ROOT, "site", "src")).filter((f) => f.endsWith(".astro"))
  test("style= özniteliği ve is:inline betik kullanılmaz", () => {
    const bad = files.filter((f) => /\sstyle=["{]|is:inline/.test(readFileSync(f, "utf8"))).map((f) => f.slice(ROOT.length + 1))
    expect(bad).toEqual([])
  })
})
