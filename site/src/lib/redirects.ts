import type { Redirect } from "./types"

// dist/_redirects (Cloudflare Pages biçimi): site/src/data/redirects.txt'deki sabit satırlar + paneldeki Yönlendirmeler.
// Sorunlu dosya build'i kırar (eski adres / ile başlamıyor, aynı adres iki kez, döngü, Cloudflare sınırı).
// Panel tarafındaki aynı kontrol pb/pb_hooks/lib/redirects.js'te; hatalı kayıt zaten kaydedilemez.

type Line = { from: string; to: string; code: string; source: string }

/** Cloudflare Pages: en çok 2000 sabit + 100 dinamik (* ya da :yer tutucu içeren) yönlendirme. */
const MAX_STATIC = 2000
const MAX_DYNAMIC = 100
const STATIC_CODES = new Set(["200", "301", "302", "303", "307", "308"])

/** "/a/" ile "/a" aynı adres sayılır. */
export const key = (path: string): string => (path.length > 1 ? path.replace(/\/+$/, "") : path)
const dynamic = (from: string): boolean => /[*:]/.test(from)
const internal = (to: string): boolean => to.startsWith("/")

/** Sondaki / olan ve olmayan hâl: /eski -> [/eski, /eski/]. Dosya (nokta içeren), kök ve * kurallar tek satırdır. */
function variants(from: string): string[] {
  const last = from.split("/").pop() ?? ""
  if (from === "/" || dynamic(from) || last.includes(".")) return [from]
  const bare = key(from)
  return [bare, `${bare}/`]
}

/** redirects.txt: boş satır ve # yorumları atlanır; her satır "eski yeni [kod]". */
export function parseStatic(text: string): Line[] {
  return text.split(/\r?\n/).flatMap((raw, i) => {
    const line = raw.trim()
    if (!line || line.startsWith("#")) return []
    const [from = "", to = "", code = "302", ...rest] = line.split(/\s+/)
    const source = `redirects.txt:${i + 1}`
    if (!to || rest.length) throw new Error(`${source}: "eski-adres yeni-adres [kod]" biçiminde olmalı: ${line}`)
    if (!STATIC_CODES.has(code)) throw new Error(`${source}: geçersiz kod ${code}`)
    return [{ from, to, code, source }]
  })
}

/** Satırları doğrular; sorunları Türkçe ileti listesi olarak döndürür (boşsa dosya yazılabilir). */
export function problems(lines: Line[]): string[] {
  const out: string[] = []
  const seen = new Map<string, string>()
  for (const l of lines) {
    if (!l.from.startsWith("/")) out.push(`${l.source}: eski adres / ile başlamalı: ${l.from}`)
    if (!internal(l.to) && !/^https?:\/\//.test(l.to)) out.push(`${l.source}: yeni adres / ya da https:// ile başlamalı: ${l.to}`)
    if (seen.has(l.from)) out.push(`${l.source}: ${l.from} iki kez var (ilki ${seen.get(l.from)})`)
    else seen.set(l.from, l.source)
    if (internal(l.to) && key(l.to) === key(l.from)) out.push(`${l.source}: ${l.from} kendine yönleniyor`)
    if (l.from.endsWith("*") && internal(l.to) && l.to.startsWith(l.from.slice(0, -1))) out.push(`${l.source}: ${l.to} adresi ${l.from} kuralının kapsamında (döngü)`)
  }
  // zincirle başa dönen yönlendirme: /a -> /b -> /a
  const next = new Map(lines.filter((l) => !dynamic(l.from) && internal(l.to) && l.code !== "200").map((l) => [key(l.from), key(l.to)]))
  const reported = new Set<string>()
  for (const start of next.keys()) {
    let cur = next.get(start)!
    for (let i = 0; i < 50 && cur !== start && next.has(cur); i++) cur = next.get(cur)!
    if (cur === start && !reported.has(start)) {
      const chain = [start]
      for (let c = next.get(start)!; c !== start; c = next.get(c)!) chain.push(c)
      chain.forEach((c) => reported.add(c))
      if (chain.length > 1) out.push(`yönlendirme döngüsü: ${[...chain, start].join(" -> ")}`)
    }
  }
  const dyn = lines.filter((l) => dynamic(l.from)).length
  if (dyn > MAX_DYNAMIC) out.push(`Cloudflare en çok ${MAX_DYNAMIC} dinamik (* ya da :) yönlendirme kabul eder; ${dyn} var`)
  if (lines.length - dyn > MAX_STATIC) out.push(`Cloudflare en çok ${MAX_STATIC} sabit yönlendirme kabul eder; ${lines.length - dyn} var`)
  return out
}

/** _redirects dosyasının metni. Önce sabit satırlar, sonra panel kayıtları (sırayla). Sorun varsa hata fırlatır. */
export function buildRedirects(panel: Redirect[], staticText = ""): string {
  const lines = [
    ...parseStatic(staticText),
    ...panel.flatMap((r) => variants(r.from.trim()).map((from) => ({ from, to: r.to.trim(), code: r.code, source: `panel ${r.from}` }))),
  ]
  const bad = problems(lines)
  if (bad.length) throw new Error(`_redirects yazılamadı:\n- ${bad.join("\n- ")}`)
  const body = lines.map((l) => `${l.from} ${l.to} ${l.code}`).join("\n")
  return `# Üretildi: site/src/pages/[redirects].ts (site/src/data/redirects.txt + panel Yönlendirmeler). Elle düzenlemeyin.\n${body}${body ? "\n" : ""}`
}
