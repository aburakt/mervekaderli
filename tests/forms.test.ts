// ORTAK (core): template'ten gelir, sitede elle değiştirilmez (bun run core:sync).
//
// Ziyaretçi formları (site.js FORMS, pb_hooks/forms.pb.js): her form kutusu için spam tuzağı, KVKK onayı,
// personel alanları, yayın tetiklememe, ziyaretçinin okuyamaması, SMTP'siz gönderim, saklama süresi ve
// bildirim e-postasının markalı düzeni (lib/mail.js, site.js BRAND).
// FORMS boşsa testler atlanır. Örnek gönderim şemadan üretilir (zorunlu alanlar); üretilemeyen alan varsa
// site.config.ts'ten `export const formSamples = { <koleksiyon>: { alan: değer } }` ile verilir.
import { Database } from "bun:sqlite"
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { join } from "node:path"
import { SITE_ID, startPb, type Pb } from "../scripts/pb-harness"
import { htmlPart, startSmtpSink } from "../scripts/smtp-sink"
import * as siteConfig from "../site.config"

const ROOT = join(import.meta.dir, "..")
type FormOptions = { retentionDays?: number; honeypot?: string; staffFields?: string[] }
const site = require(join(ROOT, "pb", "pb_hooks", "site.js")) as { FORMS?: string[]; FORM_OPTIONS?: FormOptions; BRAND?: { name?: string } }
const FORMS = site.FORMS ?? []
const OPTS = { retentionDays: 365, honeypot: "website", staffFields: ["notes"], ...site.FORM_OPTIONS }
const overrides = ((siteConfig as { formSamples?: Record<string, Record<string, unknown>> }).formSamples) ?? {}

type Field = { name: string; type: string; required?: boolean; system?: boolean; values?: string[]; min?: number; maxSelect?: number }
type Collection = { name: string; fields: Field[] }
type Rec = { id: string; status?: string; [k: string]: unknown }

const hits: string[] = []
const hookServer = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(req) { hits.push(new URL(req.url).pathname); return new Response("ok") } })
const schema: Record<string, Collection> = {}
let pb: Pb
let lastSubmit = 0

/** Zorunlu alanlardan geçerli bir ziyaretçi gönderimi. */
function sample(c: Collection): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of c.fields) {
    if (f.system || f.type === "autodate" || f.name === "status" || OPTS.staffFields.includes(f.name)) continue
    if (f.name === "kvkk_consent") { out[f.name] = true; continue }
    if (!f.required) continue
    const multi = (f.maxSelect ?? 1) > 1
    switch (f.type) {
      case "text": case "editor": out[f.name] = "Test ziyaretçi mesajı".padEnd(f.min ?? 0, "x"); break
      case "email": out[f.name] = "ziyaretci@example.com"; break
      case "url": out[f.name] = "https://example.com"; break
      case "bool": out[f.name] = true; break
      case "number": out[f.name] = Math.max(1, f.min ?? 1); break
      case "date": out[f.name] = "2026-01-01 00:00:00.000Z"; break
      case "select": out[f.name] = multi ? [f.values?.[0]] : f.values?.[0]; break
      case "json": out[f.name] = {}; break
      default: if (!(f.name in (overrides[c.name] ?? {}))) throw new Error(`${c.name}.${f.name} (${f.type}) için örnek değer üretilemedi: site.config.ts formSamples'a yazın`)
    }
  }
  return { ...out, ...overrides[c.name] }
}

const has = (name: string, field: string) => schema[name].fields.some((f) => f.name === field)

async function submit(name: string, extra: Record<string, unknown> = {}, omit: string[] = []) {
  const body: Record<string, unknown> = { ...sample(schema[name]), ...extra }
  for (const k of omit) delete body[k]
  lastSubmit = Date.now()
  return pb.api(`/api/collections/${name}/records`, { method: "POST", body: JSON.stringify(body) })
}

async function adminGet(name: string, id: string): Promise<Response> {
  return pb.admin(`/api/collections/${name}/records/${id}`)
}

beforeAll(async () => {
  if (!FORMS.length) return
  pb = await startPb({
    CF_PAGES_DEPLOY_HOOK: `http://127.0.0.1:${hookServer.port}/hook`,
    DEPLOY_QUIET_MS: "1000",
    // bildirim yolu çalışsın: SMTP yok, gönderim başarısız olur ama kayıt açılmalı
    FORM_NOTIFY_TO: "bildirim@example.invalid",
  })
  for (const name of FORMS) schema[name] = (await (await pb.admin(`/api/collections/${name}`)).json()) as Collection
  // testte çok sayıda gönderim yapılır: formlara özel hız sınırı (ör. messages:create, dakikada 5) kaldırılır
  type Limits = { rateLimits: { rules: { label: string }[] } }
  const { rateLimits } = (await (await pb.admin("/api/settings")).json()) as Limits
  rateLimits.rules = rateLimits.rules.filter((r) => !FORMS.some((n) => r.label.startsWith(`${n}:`)))
  expect((await pb.admin("/api/settings", { method: "PATCH", body: JSON.stringify({ rateLimits }) })).status).toBe(200)
}, 300_000)
const smtp = startSmtpSink()
afterAll(async () => {
  await pb?.stop()
  hookServer.stop(true)
  smtp.stop()
})

describe.skipIf(!FORMS.length)("ziyaretçi formları (FORMS)", () => {
  for (const name of FORMS) {
    test(`${name}: geçerli gönderim SMTP olmadan da kaydedilir, status new olur`, async () => {
      const res = await submit(name, { status: "closed" })
      expect(res.status).toBe(200)
      const rec = (await res.json()) as Rec
      if (has(name, "status")) expect(rec.status).toBe("new")
    }, 30_000)

    test(`${name}: spam tuzağı (${OPTS.honeypot}) doluysa status spam olur`, async () => {
      if (!has(name, "status")) return
      const res = await submit(name, { [OPTS.honeypot]: "http://spam.example" })
      expect(res.status).toBe(200)
      expect(((await res.json()) as Rec).status).toBe("spam")
    }, 30_000)

    test(`${name}: superuser status'u serbestçe yazar`, async () => {
      if (!has(name, "status")) return
      const res = await pb.admin(`/api/collections/${name}/records`, { method: "POST", body: JSON.stringify({ ...sample(schema[name]), status: "closed", [OPTS.honeypot]: "x" }) })
      expect(res.status).toBe(200)
      expect(((await res.json()) as Rec).status).toBe("closed")
    }, 30_000)

    test(`${name}: KVKK onayı olmadan ziyaretçi gönderemez (Türkçe 400)`, async () => {
      if (!has(name, "kvkk_consent")) return
      for (const res of [await submit(name, {}, ["kvkk_consent"]), await submit(name, { kvkk_consent: false })]) {
        expect(res.status).toBe(400)
        expect(((await res.json()) as { message: string }).message).toContain("onaylamanız gerekir")
      }
    }, 30_000)

    test(`${name}: personel alanlarını (${OPTS.staffFields.join(", ")}) ziyaretçi yazamaz`, async () => {
      const staff = OPTS.staffFields.filter((f) => has(name, f))
      if (!staff.length) return
      const res = await submit(name, Object.fromEntries(staff.map((f) => [f, "ziyaretçi yazdı"])))
      expect(res.status).toBe(200)
      const rec = (await (await adminGet(name, ((await res.json()) as Rec).id)).json()) as Rec
      for (const f of staff) expect(rec[f] || "").toBe("")
    }, 30_000)

    test(`${name}: ziyaretçi gönderimleri listeleyemez ve göremez`, async () => {
      const res = await submit(name)
      expect(res.status).toBe(200)
      const id = ((await res.json()) as Rec).id
      const list = await pb.api(`/api/collections/${name}/records`)
      expect(list.status).toBe(403)
      expect((await pb.api(`/api/collections/${name}/records/${id}`)).status).toBeGreaterThanOrEqual(403)
      expect((await pb.api(`/api/collections/${name}/records/${id}`, { method: "PATCH", body: "{}" })).status).toBeGreaterThanOrEqual(403)
      expect((await pb.api(`/api/collections/${name}/records/${id}`, { method: "DELETE" })).status).toBeGreaterThanOrEqual(403)
      expect((await adminGet(name, id)).status).toBe(200)
    }, 30_000)

    test(`${name}: saklama süresini (${OPTS.retentionDays} gün) aşan gönderim gece silinir`, async () => {
      const oldId = ((await (await submit(name)).json()) as Rec).id
      const newId = ((await (await submit(name)).json()) as Rec).id
      const db = new Database(join(pb.dir, "pb_data", "data.db"))
      db.exec("PRAGMA busy_timeout = 5000")
      const old = new Date(Date.now() - (OPTS.retentionDays + 1) * 86_400_000).toISOString().replace("T", " ")
      db.query(`UPDATE "${name}" SET created = ? WHERE id = ?`).run(old, oldId)
      db.close()
      expect((await pb.admin(`/api/crons/${SITE_ID}_forms_retention`, { method: "POST" })).status).toBe(204)
      // cron arka planda çalışır: silinmesini bekle
      let status = 200
      for (let i = 0; i < 20 && status !== 404; i++) {
        await Bun.sleep(250)
        status = (await adminGet(name, oldId)).status
      }
      expect(status).toBe(404)
      expect((await adminGet(name, newId)).status).toBe(200)
    }, 30_000)
  }

  test("bildirim e-postası markalı düzende: alanlar, site adı, panel bağlantısı", async () => {
    const name = FORMS[0]!
    const settings = { meta: { appURL: "https://cms.example.test", senderAddress: "noreply@example.test" }, smtp: { enabled: true, host: "127.0.0.1", port: smtp.port, tls: false } }
    expect((await pb.admin("/api/settings", { method: "PATCH", body: JSON.stringify(settings) })).status).toBe(200)
    const res = await submit(name, has(name, "name") ? { name: "Ayşe <b>Yılmaz</b>" } : {})
    expect(res.status).toBe(200)
    const id = ((await res.json()) as Rec).id
    for (let i = 0; i < 40 && !smtp.messages.length; i++) await Bun.sleep(250)
    const html = htmlPart(smtp.messages.at(-1) ?? "")
    expect(html).toContain("max-width:560px")
    expect(html).toContain("Yeni form gönderimi")
    if (site.BRAND?.name) expect(html).toContain(site.BRAND.name.replace(/&/g, "&amp;"))
    expect(html).toContain(`https://cms.example.test/_/#/collections?collection=${name}&amp;record=${id}`)
    if (has(name, "name")) {
      expect(html).toContain("Ayşe &lt;b&gt;Yılmaz&lt;/b&gt;")
      expect(html).not.toContain("<b>Yılmaz")
    }
  }, 30_000)

  test("form gönderimi siteyi yeniden yayınlatmaz", async () => {
    // yayın cron'u her dakikanın başında çalışır: son gönderimden sonra bir tur geçmesini bekle
    // (bekleme süresi DEPLOY_QUIET_MS = 1 sn; işaret konmuş olsaydı o turda tetiklenirdi)
    expect(lastSubmit).toBeGreaterThan(0)
    let wait = 60_000 - (Date.now() % 60_000)
    if (wait < 2_000) wait += 60_000
    await Bun.sleep(wait + 4_000)
    expect(hits).toEqual([])
  }, 150_000)
})
