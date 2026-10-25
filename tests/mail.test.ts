// ORTAK (core): template'ten gelir, sitede elle değiştirilmez (bun run core:sync).
//
// Marka (site.js BRAND): e-posta düzeni (pb_hooks/lib/mail.js), renk hesapları (lib/brand.js), sistem e-postaları
// (brand.pb.js: _superusers şablonları, gerçek SMTP gönderimi), panel logosu (/_/extensions.js) ve e-posta logosu PNG'si.
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createRequire } from "node:module"
import { join } from "node:path"
import { startPb, SITE_ID, type Pb } from "../scripts/pb-harness"
import { htmlPart, startSmtpSink, subject } from "../scripts/smtp-sink"
import { iconPng, MAIL_LOGO, mailLogoPng, PANEL_ICON, PANEL_LOGO, panelLogoPng } from "../site/src/lib/mail-logo"

const ROOT = join(import.meta.dir, "..")
// sharp sitenin (workspace) bağımlılığı
const sharp = createRequire(join(ROOT, "site", "package.json"))("sharp") as typeof import("sharp")
const HOOKS = join(ROOT, "pb", "pb_hooks")
// hook kütüphaneleri PB dışında da yüklenir: __hooks dışında PB global'i kullanmazlar (brand verildiğinde)
;(globalThis as { __hooks?: string }).__hooks = HOOKS

type Brand = { name: string; color: string; ink: string; paper: string; url: string; logo: string; icon: string }
type Tpl = { subject: string; body: string }
type BrandLib = {
  brand(app?: unknown, raw?: Partial<Brand>): Brand
  contrast(a: string, b: string): number
  onColor(bg: string, ink: string): string
  readable(fg: string, bg: string, min: number, toward: string): string
  initials(name: string): string
  sources(b: Brand, kind: "logo" | "icon"): string[]
  panel(b: Brand, base: string): { name: string; accent: string; wordmark: string; wordmarkLight: string; favicon: string; logo: string; icon: string }
}
type MailLib = {
  esc(v: unknown): string
  layout(o: { title?: string; intro?: string; bodyHtml?: string; afterHtml?: string; action?: { label: string; url: string } | null; footer?: string; brand?: Brand }): string
  templates(b: Brand, col?: unknown): Record<"resetPassword" | "otp" | "confirmEmailChange" | "verification" | "authAlert", Tpl>
}
const lib = require(join(HOOKS, "lib", "brand.js")) as BrandLib
const mail = require(join(HOOKS, "lib", "mail.js")) as MailLib
const site = require(join(HOOKS, "site.js")) as { BRAND?: Partial<Brand> }

const HEX = /^#[0-9a-f]{6}$/i
const b = (raw: Partial<Brand>) => lib.brand(undefined, { name: "Deneme & Ortak", ...raw })

describe("site.js BRAND", () => {
  test("var; ad dolu, renkler #rrggbb, adres ve logo geçerli", () => {
    const raw = site.BRAND
    expect(raw).toBeDefined()
    expect(String(raw!.name ?? "").trim()).not.toBe("")
    expect(raw!.color).toMatch(HEX)
    if (raw!.ink) expect(raw!.ink).toMatch(HEX)
    if (raw!.paper) expect(raw!.paper).toMatch(HEX)
    expect(raw!.url ?? "").toMatch(/^(https:\/\/[^\s/]+[^\s]*)?$/)
    expect(raw!.url ?? "").not.toMatch(/\/$/)
    // logo: build'in ürettiği PNG (Gmail/Outlook SVG göstermez)
    expect(raw!.logo ?? "").toMatch(/^(https:\/\/\S+\.png)?$/)
    expect(raw!.icon ?? "").toMatch(/^(https:\/\/\S+\.png)?$/)
  })

  test("logo varsa sitenin kendi /brand/logo-mail.png adresi ve site/public/logo.svg var", async () => {
    const logo = site.BRAND?.logo ?? ""
    if (!logo) return
    expect(logo).toBe(`${site.BRAND!.url}/brand/logo-mail.png`)
    expect(await Bun.file(join(ROOT, "site", "public", "logo.svg")).exists()).toBe(true)
  })

  test("sitenin favicon'u varsa BRAND.icon onun /brand/icon.png adresi (panel sekme simgesi), yoksa boş", async () => {
    const pub = (f: string) => Bun.file(join(ROOT, "site", "public", f)).exists()
    const has = (await pub("favicon.svg")) || (await pub("favicon.png"))
    expect(site.BRAND?.icon ?? "").toBe(has && site.BRAND?.url ? `${site.BRAND.url}/brand/icon.png` : "")
  })
})

describe("renkler (lib/brand.js)", () => {
  test("kontrast WCAG oranı", () => {
    expect(lib.contrast("#ffffff", "#000000")).toBeCloseTo(21, 5)
    expect(lib.contrast("#777777", "#777777")).toBeCloseTo(1, 5)
  })
  test("düğme yazısı: koyu zeminde beyaz, açık zeminde mürekkep", () => {
    expect(lib.onColor("#2f5d50", "#1f2124")).toBe("#ffffff")
    expect(lib.onColor("#efc40f", "#130f2d")).toBe("#130f2d")
    expect(lib.onColor("#b08a52", "#26291f")).toBe("#26291f")
  })
  test("readable istenen kontrasta ulaşır", () => {
    for (const c of ["#efc40f", "#b08a52", "#e3000f", "#d4ff3a"]) expect(lib.contrast(lib.readable(c, "#ffffff", 4.5, "#000000"), "#ffffff")).toBeGreaterThanOrEqual(4.5)
  })
  test("geçersiz değerler varsayılana düşer; logo yalnız https", () => {
    const x = b({ color: "kırmızı", ink: "#12", paper: "", url: "javascript:alert(1)", logo: "http://x.test/l.png" })
    expect(x.color).toMatch(HEX)
    expect(x.ink).toMatch(HEX)
    expect(x.paper).toMatch(HEX)
    expect(x.url).toBe("")
    expect(x.logo).toBe("")
    expect(b({ color: "#ABC", url: "https://ornek.test/" })).toMatchObject({ color: "#aabbcc", url: "https://ornek.test" })
  })
  test("baş harfler Türkçe büyür; ad kısaltmayla başlıyorsa kısaltma", () => {
    expect(lib.initials("idealist mühendislik")).toBe("İM")
    expect(lib.initials("ılık Su")).toBe("IS")
    expect(lib.initials("EBS")).toBe("EBS")
    expect(lib.initials("EBS Bilgisayar")).toBe("EBS")
    expect(lib.initials("JCI Ankara")).toBe("JCI")
    expect(lib.initials("Keyfince Wedding Garden")).toBe("KW")
    expect(lib.initials("A Grubu")).toBe("AG")
  })
})

describe("e-posta düzeni (lib/mail.js)", () => {
  const base = b({ color: "#2f5d50", url: "https://ornek.test" })

  test("metinler kaçışlanır", () => {
    const html = mail.layout({ brand: base, title: "<script>x</script>", intro: "a & b", footer: "\"q\"", action: { label: "Git <", url: "https://x.test/?a=1&b=\"2\"" } })
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;")
    expect(html).toContain("a &amp; b")
    expect(html).toContain("&quot;q&quot;")
    expect(html).toContain('href="https://x.test/?a=1&amp;b=&quot;2&quot;"')
    expect(html).toContain("Deneme &amp; Ortak")
  })

  test("logo yoksa ad marka renginde yazı (wordmark), img yok", () => {
    const html = mail.layout({ brand: base, title: "T" })
    expect(html).not.toContain("<img")
    expect(html).toMatch(/<span style="[^"]*color:#2f5d50;[^"]*">Deneme &amp; Ortak<\/span>/)
    expect(html).toContain("max-width:560px")
    expect(html).toContain('lang="tr"')
  })

  test("logo varsa 200x40 PNG, alt site adı", () => {
    const html = mail.layout({ brand: { ...base, logo: "https://ornek.test/brand/logo-mail.png" }, title: "T" })
    expect(html).toContain('<img src="https://ornek.test/brand/logo-mail.png" width="200" height="40" alt="Deneme &amp; Ortak"')
  })

  test("düğme marka renginde; açık renkte yazı mürekkep, wordmark okunur koyulukta", () => {
    const gold = b({ color: "#efc40f", ink: "#130f2d" })
    const html = mail.layout({ brand: gold, title: "T", action: { label: "Git", url: "https://x.test" } })
    expect(html).toContain('bgcolor="#efc40f"')
    expect(html).toMatch(/color:#130f2d;text-decoration:none;border-radius:8px;">Git<\/a>/)
    const word = /<span style="[^"]*color:(#[0-9a-f]{6});[^"]*">/.exec(html)![1]!
    expect(lib.contrast(word, gold.paper)).toBeGreaterThanOrEqual(3)
  })

  test("sistem e-postası şablonları Türkçe, PocketBase yer tutucuları yerinde", () => {
    const t = mail.templates(base)
    for (const k of Object.keys(t) as (keyof typeof t)[]) {
      expect(t[k].subject).toStartWith("{APP_NAME}: ")
      expect(t[k].body).toContain("Deneme &amp; Ortak")
    }
    expect(t.resetPassword.body).toContain('href="{APP_URL}/_/#/auth/confirm-password-reset/{TOKEN}"')
    expect(t.confirmEmailChange.body).toContain("{APP_URL}/_/#/auth/confirm-email-change/{TOKEN}")
    expect(t.verification.body).toContain("{APP_URL}/_/#/auth/confirm-verification/{TOKEN}")
    expect(t.otp.body).toContain("{OTP}")
    expect(t.authAlert.body).toContain("{ALERT_INFO}")
    expect(mail.templates(base, { passwordResetToken: { duration: 1800 } }).resetPassword.body).toContain("30 dakika")
  })
})

describe("panel markası (lib/brand.js panel)", () => {
  test("vurgu rengi beyaz yazıyla okunur; logo yoksa rozet + ad", () => {
    const p = lib.panel(b({ color: "#efc40f" }), "/api/x/brand")
    expect(lib.contrast(p.accent, "#ffffff")).toBeGreaterThanOrEqual(4.5)
    expect(p.logo).toBe("")
    expect(p.icon).toBe("")
    expect(p.wordmark).toStartWith("data:image/svg+xml")
    expect(decodeURIComponent(p.wordmark)).toContain(">Deneme &amp; Ortak</text>")
    expect(decodeURIComponent(p.favicon)).toContain(">DO</text>")
  })
  test("logo ve simge varsa PB'nin kendi adresi (panel CSP'si dış görsele kapalı)", () => {
    const p = lib.panel(b({ logo: "https://ornek.test/brand/logo-mail.png", icon: "https://ornek.test/brand/icon.png" }), "/api/x/brand")
    expect(p.logo).toBe("/api/x/brand/logo")
    expect(p.icon).toBe("/api/x/brand/icon")
  })
  test("panel logosu önce kırpılmış logo-panel.png, olmazsa e-posta logosu; simge yalnız BRAND.icon", () => {
    const x = b({ logo: "https://ornek.test/brand/logo-mail.png", icon: "https://ornek.test/brand/icon.png" })
    expect(lib.sources(x, "logo")).toEqual(["https://ornek.test/brand/logo-panel.png", "https://ornek.test/brand/logo-mail.png"])
    expect(lib.sources(x, "icon")).toEqual(["https://ornek.test/brand/icon.png"])
    expect(lib.sources(b({ logo: "https://cdn.test/marka.png" }), "logo")).toEqual(["https://cdn.test/marka.png"])
    expect(lib.sources(b({}), "logo")).toEqual([])
    expect(lib.sources(b({ icon: "http://x.test/i.png" }), "icon")).toEqual([])
  })
})

describe("e-posta logosu PNG (site/src/lib/mail-logo.ts)", () => {
  test("SVG'den 400x80 şeffaf PNG, logo ortada", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#c00"/></svg>'
    const png = await mailLogoPng(svg)
    const img = sharp(png)
    expect(await img.metadata()).toMatchObject({ format: "png", width: MAIL_LOGO.width, height: MAIL_LOGO.height, hasAlpha: true })
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true })
    const px = (x: number, y: number) => Array.from(data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4))
    expect(px(0, 40)[3]).toBe(0) // kenar şeffaf
    expect(px(200, 40)).toEqual([204, 0, 0, 255]) // kare 80x80, ortada
  })
})

describe("panel logosu ve simgesi PNG (site/src/lib/mail-logo.ts)", () => {
  // 100x20 SVG'nin ortasında 50x10 kırmızı dikdörtgen: kenar boşluğu kırpılır
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 20" width="100" height="20"><rect x="25" y="5" width="50" height="10" fill="#c00"/></svg>'
  test("panel logosu kenarı kırpılmış, 112 px yükseklik ya da 640 px genişliğe sığar, oran korunur", async () => {
    const meta = await sharp(await panelLogoPng(svg)).metadata()
    expect(meta.format).toBe("png")
    expect(meta.height).toBeLessThanOrEqual(PANEL_LOGO.height)
    expect(meta.width).toBeLessThanOrEqual(PANEL_LOGO.width)
    expect(Math.max(meta.width / PANEL_LOGO.width, meta.height! / PANEL_LOGO.height)).toBeGreaterThan(0.98)
    expect(meta.width / meta.height!).toBeCloseTo(5, 1)
  })
  test("simge 128x128 şeffaf kare; SVG ve PNG kaynaktan", async () => {
    for (const src of [svg, await sharp(Buffer.from(svg)).png().toBuffer()]) {
      const img = sharp(await iconPng(src))
      expect(await img.metadata()).toMatchObject({ format: "png", width: PANEL_ICON, height: PANEL_ICON, hasAlpha: true })
      const { data } = await img.raw().toBuffer({ resolveWithObject: true })
      expect(data[3]).toBe(0) // köşe şeffaf
    }
  })
})

describe("PocketBase: sistem e-postaları ve panel", () => {
  const smtp = startSmtpSink()
  let pb: Pb
  const name = String(site.BRAND?.name ?? "")
  beforeAll(async () => {
    pb = await startPb()
    const settings = { meta: { appURL: "https://cms.example.test", senderAddress: "noreply@example.test", senderName: "Test" }, smtp: { enabled: true, host: "127.0.0.1", port: smtp.port, tls: false } }
    expect((await pb.admin("/api/settings", { method: "PATCH", body: JSON.stringify(settings) })).status).toBe(200)
  }, 120_000)
  afterAll(async () => {
    await pb?.stop()
    smtp.stop()
  })

  test("_superusers şablonları açılışta markaya eşitlenir", async () => {
    type Col = { resetPasswordTemplate: Tpl; confirmEmailChangeTemplate: Tpl; verificationTemplate: Tpl; otp: { emailTemplate: Tpl }; authAlert: { emailTemplate: Tpl } }
    const col = (await (await pb.admin("/api/collections/_superusers")).json()) as Col
    const color = String(site.BRAND?.color ?? "").toLowerCase()
    for (const t of [col.resetPasswordTemplate, col.confirmEmailChangeTemplate, col.verificationTemplate, col.otp.emailTemplate, col.authAlert.emailTemplate]) {
      expect(t.subject).toStartWith("{APP_NAME}: ")
      expect(t.body).toContain(mail.esc(name))
      expect(t.body).toContain(color)
    }
    expect(col.resetPasswordTemplate.body).toContain("Parolayı sıfırla")
  })

  test("parola sıfırlama e-postası markalı gider, yer tutucular dolar", async () => {
    const res = await pb.api("/api/collections/_superusers/request-password-reset", { method: "POST", body: JSON.stringify({ email: pb.email }) })
    expect(res.status).toBe(204)
    for (let i = 0; i < 40 && !smtp.messages.length; i++) await Bun.sleep(250)
    const raw = smtp.messages.at(-1) ?? ""
    expect(subject(raw)).toEndWith(": parola sıfırlama")
    const html = htmlPart(raw)
    expect(html).toContain(mail.esc(name))
    expect(html).toMatch(/href="https:\/\/cms\.example\.test\/_\/#\/auth\/confirm-password-reset\/[\w-]+\.[\w-]+\.[\w-]+"/)
    expect(html).not.toMatch(/\{(APP_URL|APP_NAME|TOKEN)\}/)
  }, 30_000)

  test("panel (/_/extensions.js) markayı taşır: ad, vurgu rengi, logo/rozet", async () => {
    const js = await (await pb.api("/_/extensions.js")).text()
    expect(js.startsWith("window.PB_TR_LABELS = {")).toBe(true)
    const m = /window\.PB_BRAND = (\{.*\});/.exec(js)
    expect(m).not.toBeNull()
    const data = JSON.parse(m![1]!) as { name: string; accent: string; wordmark: string; logo: string; icon: string }
    expect(data.name).toBe(name)
    expect(data.accent).toMatch(HEX)
    expect(data.wordmark).toStartWith("data:image/svg+xml")
    expect(js).toContain('set("mainLogo"')
    expect(data.logo).toBe(site.BRAND?.logo ? `/api/${SITE_ID}/brand/logo` : "")
    expect(data.icon).toBe(site.BRAND?.icon ? `/api/${SITE_ID}/brand/icon` : "")
  })

  test("logo adresi: logo yoksa 404", async () => {
    if (site.BRAND?.logo) return
    expect((await pb.api(`/api/${SITE_ID}/brand/logo`)).status).toBe(404)
  })
})
