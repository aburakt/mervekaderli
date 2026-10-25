// ORTAK (core): template'ten gelir, sitede elle değiştirilmez (bun run core:sync).
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ensurePocketBase } from "../scripts/pb-binary"

// İsteğe bağlı çok dillilik (pb_hooks/lib/i18n.js, i18n.pb.js): tek dilde hiçbir şey yapmaz, açılınca dil korumaları çalışır.
// Sitenin şemasından bağımsızdır: hook'lar geçici dizine kopyalanır, site.js LANG test ayarıyla değiştirilir,
// sitenin migration'larına iki test koleksiyonu eklenir.
const ROOT = join(import.meta.dir, "..")
const HOOKS = join(ROOT, "pb", "pb_hooks")
const req = createRequire(import.meta.url)
type Rec = { id: string; lang: string; slug: string; group: string; published: boolean }
type Lang = { langs: string[]; default: string; reserved: string[]; rules: Record<string, Record<string, unknown>> }
const lib = req(join(HOOKS, "lib", "i18n.js")) as {
  active(l: unknown): unknown
  collections(l: unknown): string[]
  check(op: string, name: string, rec: Rec, prev: Rec | null, count: (where: Record<string, string>, except: string) => number, l: unknown): string
}
const site = req(join(HOOKS, "site.js")) as Record<string, unknown> & { LANG?: Lang }

const TWO: Lang = {
  langs: ["tr", "en"],
  default: "tr",
  reserved: ["tr", "en", "api", "_astro"],
  rules: {
    i18n_settings: { label: "Ayarlar", perLang: true },
    i18n_pages: { label: "Sayfalar", grouped: true, fixed: ["home"], alwaysPublished: ["home"] },
  },
}
const ONE: Lang = { ...TWO, langs: ["tr"] }

describe("lib/i18n.js kararları (PB'siz)", () => {
  const rec = (o: Partial<Rec> = {}): Rec => ({ id: "a", lang: "tr", slug: "x", group: "g", published: true, ...o })
  const none = () => 0
  const some = () => 1

  test("tek dilde ya da LANG yokken etkisiz: hook kaydedilmez, her şey geçer", () => {
    for (const l of [undefined, null, {}, ONE]) {
      expect(lib.active(l)).toBeNull()
      expect(lib.collections(l)).toEqual([])
      expect(lib.check("delete", "i18n_settings", rec(), null, some, l)).toBe("")
      expect(lib.check("create", "i18n_pages", rec({ slug: "api" }), null, some, l)).toBe("")
    }
  })
  test("sitenin kendi LANG ayarı tek dilliyse hiçbir koleksiyona hook bağlanmaz", () => {
    if ((site.LANG?.langs.length ?? 1) < 2) expect(lib.collections(site.LANG)).toEqual([])
    else expect(lib.collections(site.LANG).length).toBeGreaterThan(0)
  })
  test("site.js: dil başına tek kayıtlı (perLang) koleksiyon RULES'ta singleton değil (ikinci dil açılamazdı)", () => {
    const rules = (site.RULES ?? {}) as Record<string, { singleton?: boolean }>
    const perLang = Object.entries(site.LANG?.rules ?? {}).filter(([, r]) => r.perLang).map(([n]) => n)
    expect(perLang.filter((n) => rules[n]?.singleton)).toEqual([])
  })
  test("iki dilde yalnız kuralı olan koleksiyonlar", () => {
    expect(lib.collections(TWO).sort()).toEqual(["i18n_pages", "i18n_settings"])
    expect(lib.check("delete", "posts", rec(), null, some, TWO)).toBe("")
  })
  test("perLang: dil başına tek kayıt, silinemez, dili değişmez", () => {
    expect(lib.check("create", "i18n_settings", rec({ slug: "" }), null, none, TWO)).toBe("")
    expect(lib.check("create", "i18n_settings", rec({ slug: "" }), null, some, TWO)).toContain("zaten var")
    expect(lib.check("update", "i18n_settings", rec({ lang: "en", slug: "" }), rec({ slug: "" }), none, TWO)).toContain('"lang"')
    expect(lib.check("delete", "i18n_settings", rec(), null, none, TWO)).toContain("silinemez")
  })
  test("dil listede olmalı, adres ayrılmış olamaz", () => {
    expect(lib.check("create", "i18n_pages", rec({ lang: "de" }), null, none, TWO)).toContain("geçersiz")
    for (const s of TWO.reserved) expect(lib.check("create", "i18n_pages", rec({ slug: s }), null, none, TWO)).toContain("ayrılmış")
  })
  test("grouped: aynı grupta aynı dil iki kez olamaz; grup boş kalamaz", () => {
    const seen: Record<string, string>[] = []
    const count = (w: Record<string, string>) => (seen.push(w), 1)
    expect(lib.check("create", "i18n_pages", rec(), null, count, TWO)).toContain("adresli kayıt")
    expect(seen[0]).toEqual({ slug: "x", lang: "tr" })
    const groupOnly = (w: Record<string, string>) => ("translation_group" in w ? 1 : 0)
    expect(lib.check("create", "i18n_pages", rec(), null, groupOnly, TWO)).toContain("grubunda")
    expect(lib.check("create", "i18n_pages", rec({ group: "" }), null, none, TWO)).toContain("boş")
    expect(lib.check("create", "i18n_pages", rec(), null, none, TWO)).toBe("")
  })
  test("hazır grup: silinemez, dil/adres/grup kilitli, yayından kaldırılamaz; metin serbest", () => {
    const home = rec({ group: "home", slug: "anasayfa" })
    expect(lib.check("delete", "i18n_pages", home, null, none, TWO)).toContain("silinemez")
    expect(lib.check("update", "i18n_pages", { ...home, slug: "baska" }, home, none, TWO)).toContain('"slug"')
    expect(lib.check("update", "i18n_pages", { ...home, group: "x" }, home, none, TWO)).toContain('"translation_group"')
    expect(lib.check("update", "i18n_pages", { ...home, published: false }, home, none, TWO)).toContain("yayından")
    expect(lib.check("update", "i18n_pages", home, home, none, TWO)).toBe("")
    const other = rec({ group: "g2" })
    expect(lib.check("update", "i18n_pages", { ...other, slug: "y", published: false }, other, none, TWO)).toBe("")
    expect(lib.check("delete", "i18n_pages", other, null, none, TWO)).toBe("")
  })
})

// ---------- gerçek PocketBase: hook'lar LANG'a göre kaydolur ----------

const MIGRATION = `/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const lang = { name: "lang", type: "select", required: true, maxSelect: 1, values: ["tr", "en"], help: "Dil." }
  const mk = (name, fields, list) => app.save(new Collection({ type: "base", name, listRule: list, viewRule: list, createRule: null, updateRule: null, deleteRule: null, fields }))
  mk("i18n_settings", [{ name: "title", type: "text", presentable: true, help: "x" }, lang], "")
  mk("i18n_pages", [
    { name: "title", type: "text", presentable: true, help: "x" }, lang,
    { name: "translation_group", type: "text", help: "x" }, { name: "slug", type: "text", help: "x" },
    { name: "published", type: "bool", help: "x" },
  ], "published = true")
}, (app) => {})
`

type Pb = { admin(path: string, init?: RequestInit): Promise<Response>; stop(): Promise<void> }

async function startWith(lang: Lang): Promise<Pb> {
  const bin = await ensurePocketBase()
  const dir = mkdtempSync(join(tmpdir(), "i18n-pb-"))
  const hooks = join(dir, "pb_hooks")
  const migrations = join(dir, "pb_migrations")
  cpSync(HOOKS, hooks, { recursive: true })
  cpSync(join(ROOT, "pb", "pb_migrations"), migrations, { recursive: true })
  // i18n_pages adresi core protect.js ile başlıktan üretilir (hook dosyaları sırasız yüklenir; sıra fark etmemeli)
  const RULES = { ...(site.RULES as object), i18n_pages: { slugFrom: "title", locked: ["slug"] } }
  writeFileSync(join(hooks, "site.js"), `module.exports = ${JSON.stringify({ ...site, RULES, LANG: lang })}\n`)
  writeFileSync(join(migrations, "1999999999_i18n_test.js"), MIGRATION)
  const common = ["--dir", join(dir, "pb_data"), "--migrationsDir", migrations, "--hooksDir", hooks]
  const email = "i18n@test.test"
  const password = `I18n-${crypto.randomUUID()}`
  const up = Bun.spawnSync([bin, "superuser", "upsert", email, password, ...common])
  if (up.exitCode !== 0) throw new Error(`superuser upsert başarısız: ${up.stderr.toString()}`)
  const s = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } })
  const port = s.port
  s.stop(true)
  const url = `http://127.0.0.1:${port}`
  const proc = Bun.spawn([bin, "serve", `--http=127.0.0.1:${port}`, "--automigrate=false", ...common], {
    env: { ...process.env, PB_AGENCY_EMAILS: email }, stdout: "pipe", stderr: "pipe",
  })
  let ready = false
  for (let i = 0; i < 100 && !ready; i++) {
    try { ready = (await fetch(`${url}/api/health`)).ok } catch {}
    if (!ready) await Bun.sleep(200)
  }
  if (!ready) { proc.kill(); throw new Error("PocketBase açılmadı") }
  const auth = await fetch(`${url}/api/collections/_superusers/auth-with-password`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identity: email, password }),
  })
  const token = ((await auth.json()) as { token: string }).token
  return {
    admin: (path, init = {}) => fetch(`${url}${path}`, { ...init, headers: { "content-type": "application/json", authorization: token } }),
    async stop() { proc.kill(); await proc.exited; rmSync(dir, { recursive: true, force: true }) },
  }
}

let one: Pb
let two: Pb
beforeAll(async () => {
  ;[one, two] = await Promise.all([startWith(ONE), startWith(TWO)])
}, 120_000)
afterAll(async () => {
  await one?.stop()
  await two?.stop()
})

const create = (pb: Pb, c: string, body: object) => pb.admin(`/api/collections/${c}/records`, { method: "POST", body: JSON.stringify(body) })
const patch = (pb: Pb, c: string, id: string, body: object) => pb.admin(`/api/collections/${c}/records/${id}`, { method: "PATCH", body: JSON.stringify(body) })
const del = (pb: Pb, c: string, id: string) => pb.admin(`/api/collections/${c}/records/${id}`, { method: "DELETE" })
const idOf = async (res: Response) => ((await res.json()) as { id: string }).id

describe("tek dil: aynı şemada hiçbir dil kuralı çalışmaz", () => {
  test("aynı dilde iki ayar kaydı, ayrılmış adres ve silme serbest", async () => {
    expect((await create(one, "i18n_settings", { title: "a", lang: "tr" })).status).toBe(200)
    const b = await create(one, "i18n_settings", { title: "b", lang: "tr" })
    expect(b.status).toBe(200)
    expect((await del(one, "i18n_settings", await idOf(b))).status).toBe(204)
    expect((await create(one, "i18n_pages", { title: "x", lang: "tr", slug: "api", published: true })).status).toBe(200)
  })
})

describe("iki dil: dil korumaları panelde ve API'de", () => {
  test("ayarlar dil başına tek kayıt, silinemez, dili değişmez", async () => {
    const tr = await idOf(await create(two, "i18n_settings", { title: "tr", lang: "tr" }))
    expect((await create(two, "i18n_settings", { title: "en", lang: "en" })).status).toBe(200)
    expect((await create(two, "i18n_settings", { title: "tr2", lang: "tr" })).status).toBe(400)
    expect((await patch(two, "i18n_settings", tr, { lang: "en" })).status).toBe(400)
    expect((await patch(two, "i18n_settings", tr, { title: "yeni" })).status).toBe(200)
    expect((await del(two, "i18n_settings", tr)).status).toBe(400)
  })
  test("çeviri grubu: boşsa adresten dolar, eşi aynı grupla açılır, aynı dilde ikinci eş reddedilir", async () => {
    const res = await create(two, "i18n_pages", { title: "Hakkımızda", lang: "tr", slug: "hakkimizda", published: true })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { translation_group: string }).translation_group).toBe("hakkimizda")
    expect((await create(two, "i18n_pages", { title: "About", lang: "en", slug: "about", translation_group: "hakkimizda", published: true })).status).toBe(200)
    expect((await create(two, "i18n_pages", { title: "About 2", lang: "en", slug: "about-2", translation_group: "hakkimizda", published: true })).status).toBe(400)
  })
  test("adres başlıktan, grup adresten üretilir; başlıktan ayrılmış adres çıkarsa reddedilir", async () => {
    const res = await create(two, "i18n_pages", { title: "Şubat Gezisi", lang: "tr", published: true })
    expect(res.status).toBe(200)
    const rec = (await res.json()) as { slug: string; translation_group: string }
    expect([rec.slug, rec.translation_group]).toEqual(["subat-gezisi", "subat-gezisi"])
    expect((await create(two, "i18n_pages", { title: "API", lang: "tr", published: true })).status).toBe(400)
  })
  test("ayrılmış adres reddedilir", async () => {
    for (const slug of ["en", "api"]) expect((await create(two, "i18n_pages", { title: "x", lang: "tr", slug, published: true })).status).toBe(400)
  })
  test("hazır sayfa: adresi ve yayını kilitli, silinemez; metni düzenlenir", async () => {
    const home = await idOf(await create(two, "i18n_pages", { title: "Ana sayfa", lang: "tr", slug: "anasayfa", translation_group: "home", published: true }))
    expect((await patch(two, "i18n_pages", home, { slug: "baska" })).status).toBe(400)
    expect((await patch(two, "i18n_pages", home, { published: false })).status).toBe(400)
    expect((await patch(two, "i18n_pages", home, { title: "Hoş geldiniz" })).status).toBe(200)
    expect((await del(two, "i18n_pages", home)).status).toBe(400)
  })
})
