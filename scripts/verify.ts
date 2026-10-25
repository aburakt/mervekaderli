import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { SITE_ID, startPb } from "./pb-harness"
import { seed } from "./seed"
import { SITE } from "../site.config"
import type { Check } from "./site-types"

// ORTAK (core): template'ten gelir, sitede elle değiştirilmez. Siteye özel sayfa kontrolleri site.config.ts'te.

const ROOT = join(import.meta.dir, "..")
const DIST = join(ROOT, "site", "dist")
const out = (line: string) => process.stdout.write(`${line}\n`)
const report = (ok: boolean, name: string, why = "") => {
  out(ok ? `✅ ${name}` : `❌ ${name}: ${why}`)
  return ok
}
const build = (env: Record<string, string>) =>
  Bun.spawnSync(["bun", "run", "build"], { cwd: ROOT, env: { ...process.env, PB_URL: "", CONTENT_SOURCE: "", ...env }, stdout: "ignore", stderr: "inherit" })

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}
const htmlOf = (dir: string) => Object.fromEntries(walk(dir).filter((f) => f.endsWith(".html")).map((f) => [f.slice(dir.length), readFileSync(f, "utf8")]))
/** Görünen metin: etiketler, betikler, önizleme bandı/notları, formlar (önizlemede kapalı olabilir) ve boşluk farkları atılır. */
const visible = (html: string): string =>
  html.replace(/<(script|style|svg|form)[\s\S]*?<\/\1>/g, "").replace(/<p data-fixture-[\w-]+[\s\S]*?<\/p>/g, "").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ").replace(/\s+/g, " ").trim()

// — Erişilebilirlik ve performans bütçesi (bağımlılıksız; build çıktısındaki her HTML üzerinde) —

type Tag = { name: string; close: boolean; attrs: Record<string, string>; at: number; end: number }
const TAG = /<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g
const ATTR = /([^\s=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g

/** Yorumlar ve script/style/template içleri atılmış HTML'in etiketleri (öznitelikleri küçük harf adlarıyla). */
function tags(html: string): { src: string; list: Tag[] } {
  const src = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style|template)\b([^>]*)>[\s\S]*?<\/\1>/gi, "<$1$2></$1>")
  const list = [...src.matchAll(TAG)].map((m) => {
    const attrs: Record<string, string> = {}
    for (const a of m[3].matchAll(ATTR)) attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? ""
    return { name: m[2].toLowerCase(), close: m[1] === "/", attrs, at: m.index, end: m.index + m[0].length }
  })
  return { src, list }
}

/** Sayfadaki erişilebilirlik sorunları: [kural, ayrıntı]. */
export function a11yProblems(html: string): [string, string][] {
  const { src, list } = tags(html)
  const bad: [string, string][] = []
  const opens = list.filter((t) => !t.close)
  const html0 = opens.find((t) => t.name === "html")
  if (!html0?.attrs.lang) bad.push(["<html lang>", "lang yok"])
  for (const t of opens) if (t.name === "img" && !("alt" in t.attrs)) bad.push(["img alt", t.attrs.src ?? "?"])
  const heads = opens.filter((t) => /^h[1-6]$/.test(t.name)).map((t) => Number(t.name[1]))
  const h1 = heads.filter((h) => h === 1).length
  if (h1 !== 1) bad.push(["tek h1", `${h1} adet`])
  heads.forEach((h, i) => { if (i > 0 && h > heads[i - 1] + 1) bad.push(["başlık sırası", `h${heads[i - 1]}→h${h}`]) })
  // a ve button: içerik metni, aria-label/aria-labelledby/title ya da içteki görselin alt'ı
  for (const t of opens.filter((x) => x.name === "a" || x.name === "button")) {
    const close = list.find((x) => x.close && x.name === t.name && x.at > t.at)
    const inner = src.slice(t.end, close?.at ?? t.end)
    const named = (a: Record<string, string>) => !!(a["aria-label"]?.trim() || a["aria-labelledby"]?.trim() || a.title?.trim())
    const text = inner.replace(/<[^>]*>/g, "").replace(/&nbsp;|&#160;/g, "").trim()
    const kids = tags(inner).list.filter((x) => !x.close)
    const ok = named(t.attrs) || text !== "" || kids.some((k) => named(k.attrs) || (k.name === "img" && k.attrs.alt?.trim()))
    if (!ok) bad.push([`${t.name} adı`, t.attrs.href ?? t.attrs.class ?? "?"])
  }
  // Form denetimleri: saran <label>, <label for>, aria-label ya da aria-labelledby
  const fors = new Set(opens.filter((t) => t.name === "label" && t.attrs.for).map((t) => t.attrs.for))
  let inLabel = 0
  for (const t of list) {
    if (t.name === "label") inLabel += t.close ? -1 : 1
    if (t.close || !["input", "select", "textarea"].includes(t.name)) continue
    if (t.name === "input" && ["hidden", "submit", "button", "reset", "image"].includes(t.attrs.type ?? "")) continue
    const a = t.attrs
    if (inLabel > 0 || (a.id && fors.has(a.id)) || a["aria-label"]?.trim() || a["aria-labelledby"]?.trim()) continue
    bad.push(["form etiketi", `${t.name}${a.name ? ` name=${a.name}` : ""}`])
  }
  const seen = new Set<string>()
  for (const t of opens) {
    const id = t.attrs.id
    if (id === undefined) continue
    if (seen.has(id)) bad.push(["tekrarlanan id", id])
    seen.add(id)
  }
  return bad
}

const kb = (n: number) => Math.round(n / 102.4) / 10
/** Aynı kaynaktan yerel dosya yolu (dış adres ve data: atlanır). */
function local(ref: string, page: string): string | null {
  if (!ref || /^(?:[a-z]+:|\/\/|#)/i.test(ref)) return null
  const p = decodeURI(ref.split(/[?#]/)[0])
  const f = p.startsWith("/") ? join(DIST, p) : join(dirname(page), p)
  return existsSync(f) && statSync(f).isFile() ? f : null
}
/** JS modülünün statik import'ları (Astro parçaları) da sayfanın yüküdür. */
function withImports(file: string, acc: Set<string>) {
  if (acc.has(file)) return
  acc.add(file)
  if (!file.endsWith(".js")) return
  for (const m of readFileSync(file, "utf8").matchAll(/\bimport\s*(?:[\w*{}\s,$]+from\s*)?["']([^"']+\.js)["']/g)) {
    const f = local(m[1], file)
    if (f) withImports(f, acc)
  }
}

/** Sayfa başına gzip'li HTML + CSS + JS toplamı ve en büyük yerel görsel. */
export function pageWeight(page: string): { kb: number; image: { kb: number; file: string } } {
  const html = readFileSync(page, "utf8")
  const assets = new Set<string>()
  let image = { kb: 0, file: "" }
  for (const t of tags(html).list) {
    if (t.close) continue
    const a = t.attrs
    const rel = (a.rel ?? "").toLowerCase()
    const code = t.name === "script" ? a.src : t.name === "link" && /\b(stylesheet|modulepreload)\b/.test(rel) ? a.href : undefined
    const f = code ? local(code, page) : null
    if (f) withImports(f, assets)
    const imgs = [a.src && (t.name === "img" || t.name === "source") ? a.src : "", ...(a.srcset ?? "").split(",").map((s) => s.trim().split(/\s+/)[0]), t.name === "link" && a.as === "image" ? a.href : ""]
    if (t.name === "img" || t.name === "source" || t.name === "link") for (const ref of imgs) {
      const img = ref ? local(ref, page) : null
      if (img && kb(statSync(img).size) > image.kb) image = { kb: kb(statSync(img).size), file: img.replace(DIST, "") }
    }
  }
  const total = [...assets].reduce((n, f) => n + Bun.gzipSync(readFileSync(f)).length, Bun.gzipSync(html).length)
  return { kb: kb(total), image }
}

function qualityChecks(pages: string[]): boolean {
  const rel = (f: string) => f.replace(DIST, "")
  const byRule = new Map<string, string[]>()
  for (const f of pages) for (const [rule, why] of a11yProblems(readFileSync(f, "utf8"))) byRule.set(rule, [...(byRule.get(rule) ?? []), `${rel(f)} (${why})`])
  let all = true
  for (const rule of ["<html lang>", "img alt", "tek h1", "başlık sırası", "a adı", "button adı", "form etiketi", "tekrarlanan id"]) {
    const hits = byRule.get(rule) ?? []
    all = report(hits.length === 0, `Erişilebilirlik: ${rule}`, `${hits.length} sorun: ${hits.slice(0, 4).join(", ")}`) && all
  }
  const pageKb = SITE.budget?.pageKb ?? 150, imageKb = SITE.budget?.imageKb ?? 400
  const w = pages.map((f) => ({ f: rel(f), ...pageWeight(f) }))
  const heavy = w.filter((x) => x.kb > pageKb).map((x) => `${x.f} ${x.kb} KB`)
  all = report(heavy.length === 0, `Sayfa bütçesi: gzip HTML+CSS+JS ≤ ${pageKb} KB (en büyük ${Math.max(0, ...w.map((x) => x.kb))} KB)`, heavy.slice(0, 4).join(", ")) && all
  const big = w.filter((x) => x.image.kb > imageKb).map((x) => `${x.f}: ${x.image.file} ${x.image.kb} KB`)
  return report(big.length === 0, `Görsel bütçesi: sayfadaki en büyük yerel görsel ≤ ${imageKb} KB`, [...new Set(big)].slice(0, 4).join(", ")) && all
}

async function serveAndCheck(checks: Check[]): Promise<boolean> {
  const server = serve()
  try {
    const pages = await runChecks(`http://127.0.0.1:${server.port}`, checks)
    return distChecks() && pages
  } finally {
    server.stop(true)
  }
}

async function runChecks(base: string, checks: Check[] = SITE.checks): Promise<boolean> {
  let all = true
  for (const c of checks) {
    const res = await fetch(base + c.path)
    const body = await res.text()
    const want = c.status ?? 200
    let why = ""
    if (res.status !== want) why = `${res.status} döndü, ${want} bekleniyordu`
    for (const s of c.has ?? []) if (!why && !body.includes(s)) why = `içerikte "${s}" yok`
    for (const s of c.hasNot ?? []) if (!why && body.includes(s)) why = `içerikte olmaması gereken "${s}" var`
    all = report(!why, c.name, why) && all
  }
  return all
}

export function distChecks(): boolean {
  let all = true
  const headers = existsSync(join(DIST, "_headers")) ? readFileSync(join(DIST, "_headers"), "utf8") : ""
  const missing = ["frame-ancestors 'none'", "Strict-Transport-Security"].filter((s) => !headers.includes(s))
  all = report(missing.length === 0, "Güvenlik başlıkları", `_headers'ta eksik: ${missing.join(", ")}`) && all
  const inline: string[] = []
  const pages = walk(DIST).filter((p) => p.endsWith(".html"))
  for (const f of pages) {
    for (const m of readFileSync(f, "utf8").matchAll(/<script\b([^>]*)>/g)) if (!/\bsrc=/.test(m[1]) && !/type="application\/ld\+json"/.test(m[1])) inline.push(f.replace(DIST, ""))
  }
  all = report(inline.length === 0, "Inline script yok", [...new Set(inline)].join(", ")) && all
  const styled = pages.filter((f) => /<style[\s>]|\sstyle="/.test(readFileSync(f, "utf8")))
  all = report(styled.length === 0, "Inline stil yok (CSP style-src 'self')", styled.map((f) => f.replace(DIST, "")).join(", ")) && all
  all = qualityChecks(pages) && all
  // CSP img-src 'self': panel görselleri build'de indirilmiş olmalı, sayfada PB adresi kalmamalı
  if (SITE.externalImages) return all
  const leaked = pages.filter((f) => /<img[^>]+src="https?:\/\//.test(readFileSync(f, "utf8"))).map((f) => f.replace(DIST, ""))
  return report(leaked.length === 0, "Görseller siteden servis edilir (dış adres yok)", leaked.slice(0, 4).join(", ")) && all
}

function serve() {
  return Bun.serve({
    hostname: "127.0.0.1", port: 0,
    async fetch(req) {
      let p = decodeURIComponent(new URL(req.url).pathname)
      if (p.endsWith("/")) p += "index.html"
      const f = Bun.file(join(DIST, p))
      if (await f.exists()) return new Response(f)
      const nf = Bun.file(join(DIST, "404.html"))
      return new Response((await nf.exists()) ? nf : "not found", { status: 404 })
    },
  })
}

async function main(): Promise<number> {
  const external = process.env.BASE_URL
  if (external) return (await runChecks(external.replace(/\/$/, ""))) ? 0 : 1

  out("— Standart ve API kuralları (bun test)")
  const suites = ["tests/core.test.ts", "tests/rules.test.ts"].filter((f) => existsSync(join(ROOT, f)))
  const rules = Bun.spawnSync(["bun", "test", ...suites], { cwd: ROOT, stdout: "inherit", stderr: "inherit" })
  if (!report(rules.exitCode === 0, "Standart ve API kuralları", `${suites.join(", ")} kırmızı`)) return 1

  out("— Fixture build (referans)")
  if (!report(build({ CONTENT_SOURCE: "fixture" }).exitCode === 0, "Fixture build", "çıkış kodu ≠ 0")) return 1
  const fixtureDir = mkdtempSync(join(tmpdir(), `${SITE_ID}-fixture-`))
  cpSync(DIST, fixtureDir, { recursive: true })

  out("— PB build (geçici PB'ye karşı, gerçek içerikle)")
  const pb = await startPb()
  try {
    await seed(pb)
    if (!report(build({ PB_URL: pb.url }).exitCode === 0, "PB build", "çıkış kodu ≠ 0")) return 1
  } finally {
    await pb.stop()
  }

  // PB modu ile fixture modu aynı sayfaları ve aynı görünen metni üretmeli (yükleyici hatalarını yakalar)
  const a = htmlOf(fixtureDir), b = htmlOf(DIST)
  const onlyA = Object.keys(a).filter((k) => !(k in b)), onlyB = Object.keys(b).filter((k) => !(k in a))
  let all = report(onlyA.length === 0 && onlyB.length === 0, "PB ve fixture aynı sayfa kümesini üretir", `yalnız fixture: ${onlyA.slice(0, 3)} | yalnız PB: ${onlyB.slice(0, 3)}`)
  const diff = Object.keys(a).filter((k) => k in b && visible(a[k]) !== visible(b[k]))
  all = report(diff.length === 0, "PB ve fixture aynı metni üretir", `${diff.length} sayfa farklı: ${diff.slice(0, 4).join(", ")}`) && all
  rmSync(fixtureDir, { recursive: true, force: true })

  all = (await serveAndCheck(SITE.checks)) && all
  if (!SITE.testSeed || !SITE.testChecks?.length) return all ? 0 : 1

  out("— Test verisiyle PB build (taslak, çevirisiz kayıt, panel görseli gibi durumlar)")
  const test = await startPb()
  try {
    await SITE.testSeed(test)
    if (!report(build({ PB_URL: test.url }).exitCode === 0, "Test verisiyle PB build", "çıkış kodu ≠ 0")) return 1
  } finally {
    await test.stop()
  }
  all = (await serveAndCheck(SITE.testChecks)) && all
  return all ? 0 : 1
}

if (import.meta.main) process.exit(await main())
