// ORTAK (core): template'ten gelir, sitede elle değiştirilmez (bun run core:sync). Rehber docs/geo-webmcp.md.
//
// GEO (yapay zekâ arama/asistanlarının siteyi doğru okuması ve kaynak göstermesi) çıktılarını üretir:
// /llms.txt (llmstxt.org biçimi), /llms-full.txt, sayfaların markdown eşleri (/<yol>/index.md) ve robots.txt.
// Hangi sayfaların gireceğini site söyler (site/src/lib/geo.ts, siteye ait); bu dosya yalnız biçimlendirir.
// Saf fonksiyonlar: Astro'ya bağlı değildir, tests/geo.test.ts doğrudan çağırır.

/** llms.txt'te bir bağlantı, llms-full.txt'te bir bölüm, isteğe bağlı olarak /<yol>/index.md. */
export type GeoPage = {
  /** Site içi yol, sonda "/" ile ("/", "/yazilar/ornek/"). */
  path: string
  title: string
  /** llms.txt'teki tek satırlık açıklama (meta description ile aynı olabilir). */
  description?: string
  /** Sayfanın görünen içeriği, markdown. Yoksa sayfa yalnız bağlantı olarak listelenir (markdown eşi üretilmez). */
  content?: string
  /** Yayın tarihi (YYYY-AA-GG); llms-full.txt ve markdown eşinde yazılır. */
  date?: string
}

/** llms.txt'te "## Başlık" altındaki bağlantı listesi. llmstxt.org: "Optional" adlı bölüm kısa bağlamda atlanabilir. */
export type GeoSection = { title: string; pages: GeoPage[] }

/** İletişim yolu (form, WhatsApp, Google Forms, telefon). WebMCP yalnız bağlantıyı verir, ziyaretçi adına göndermez. */
export type GeoLink = { label: string; url: string; kind: "form" | "whatsapp" | "phone" | "email" | "map" | "other"; description?: string }

/** Sitenin GEO/WebMCP tanımı: site/src/lib/geo.ts `geo()` bunu döndürür (PB ya da fixture, sayfalarla aynı veri). */
export type GeoSite = {
  /** Kurum adı (llms.txt H1). */
  name: string
  /** Bir iki cümlelik özet (llms.txt alıntı satırı). */
  summary: string
  /** Özetten sonra gelen serbest markdown (kim, ne yapar, nerede); başlık (#) içermez. */
  details?: string
  /** Künye: telefon, e-posta, adres, çalışma saatleri... (llms.txt listesi ve WebMCP site_info). Boş değerler atılır. */
  facts?: Record<string, string | undefined>
  sections: GeoSection[]
  contact?: GeoLink[]
  /** Yapay zekâ eğitim tarayıcıları (GPTBot, ClaudeBot, Google-Extended, CCBot...) izinli mi. Varsayılan true. */
  aiTraining?: boolean
  /** robots.txt'i core üretsin mi. false: site kendi robots.txt'ini tutar (verify yine AI bölümünü arar). Varsayılan true. */
  robots?: boolean
  /** Sayfaların markdown eşleri (/<yol>/index.md). Varsayılan true. */
  markdown?: boolean
  /** Robots'a eklenecek yasak yollar (ör. "/k/"). */
  disallow?: string[]
}

/** Kullanıcının sorusuna cevap verirken siteyi okuyan ve kaynak gösteren botlar: her zaman izinli. */
export const ANSWER_BOTS = ["OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "Perplexity-User", "Claude-SearchBot", "Claude-User"] as const
/** Model eğitimi için toplayan tarayıcılar: site ayarı (GeoSite.aiTraining). Arama sıralamasını etkilemezler. */
export const TRAINING_BOTS = ["GPTBot", "ClaudeBot", "Google-Extended", "Applebot-Extended", "CCBot", "meta-externalagent"] as const

export const abs = (path: string, site: URL | string): string => new URL(path, site).href

/** Sayfanın markdown eşinin yolu: "/" -> "/index.md", "/yazilar/x/" -> "/yazilar/x/index.md". */
export const mdPath = (path: string): string => `${path.endsWith("/") ? path : `${path}/`}index.md`
/** [...geo].md.ts rota parametresi (".md" uzantısız, baştaki "/" olmadan). */
export const mdParam = (path: string): string => mdPath(path).slice(1, -3)

const oneLine = (s: string | undefined): string => (s ?? "").replace(/\s+/g, " ").trim()
const factLines = (facts: GeoSite["facts"]): string[] =>
  Object.entries(facts ?? {}).filter(([, v]) => oneLine(v)).map(([k, v]) => `- ${k}: ${oneLine(v)}`)
/** Markdown bağlantı metninde köşeli parantez kaçışı. */
const label = (s: string): string => oneLine(s).replace(/([[\]])/g, "\\$1")

export const allPages = (g: GeoSite): GeoPage[] => {
  const seen = new Set<string>()
  return g.sections.flatMap((s) => s.pages).filter((p) => (seen.has(p.path) ? false : (seen.add(p.path), true)))
}
export const contentPages = (g: GeoSite): GeoPage[] => allPages(g).filter((p) => p.content?.trim())

function head(g: GeoSite): string[] {
  const out = [`# ${oneLine(g.name)}`, "", `> ${oneLine(g.summary)}`, ""]
  if (g.details?.trim()) out.push(g.details.trim(), "")
  const facts = factLines(g.facts)
  if (facts.length) out.push(...facts, "")
  return out
}

/** /llms.txt (https://llmstxt.org): H1 ad, alıntı özet, künye, "## Bölüm" altında "- [Başlık](adres): açıklama". */
export function llmsTxt(g: GeoSite, site: URL | string): string {
  const out = head(g)
  for (const s of g.sections) {
    if (!s.pages.length) continue
    out.push(`## ${oneLine(s.title)}`, "")
    for (const p of s.pages) out.push(`- [${label(p.title)}](${abs(p.path, site)})${p.description ? `: ${oneLine(p.description)}` : ""}`)
    out.push("")
  }
  const contact = g.contact ?? []
  if (contact.length) {
    out.push("## İletişim", "")
    for (const c of contact) out.push(`- [${label(c.label)}](${abs(c.url, site)})${c.description ? `: ${oneLine(c.description)}` : ""}`)
    out.push("")
  }
  return `${out.join("\n").trimEnd()}\n`
}

/** Markdown içindeki göreli bağlantıları ("](/yazilar/x/)") mutlak adrese çevirir; dış bağlantılar ve #çapa olduğu gibi kalır. */
export const absLinks = (md: string, site: URL | string): string =>
  md.replace(/\]\((\/[^)\s]*)\)/g, (_, u: string) => `](${abs(u, site)})`)

/** Markdown başlıklarını n düzey aşağı indirir (sayfa içeriği llms-full.txt'te "##" bölümünün altına girer). */
export const demote = (md: string, n: number): string =>
  md.replace(/^(#{1,6})(?=\s)/gm, (h) => "#".repeat(Math.min(6, h.length + n)))

/** /llms-full.txt: içeriği olan bütün sayfaların metni tek dosyada (kaynak adresleriyle). */
export function llmsFullTxt(g: GeoSite, site: URL | string): string {
  const out = head(g)
  for (const p of contentPages(g)) {
    out.push("---", "", `## ${oneLine(p.title)}`, "", `Kaynak: ${abs(p.path, site)}`)
    if (p.date) out.push(`Tarih: ${p.date}`)
    out.push("")
    if (p.description) out.push(`> ${oneLine(p.description)}`, "")
    out.push(demote(absLinks(p.content!.trim(), site), 2), "")
  }
  return `${out.join("\n").trimEnd()}\n`
}

/** Tek sayfanın markdown eşi. */
export function pageMarkdown(p: GeoPage, site: URL | string): string {
  const out = [`# ${oneLine(p.title)}`, ""]
  if (p.description) out.push(`> ${oneLine(p.description)}`, "")
  out.push(`Kaynak: ${abs(p.path, site)}`)
  if (p.date) out.push(`Tarih: ${p.date}`)
  out.push("", demote(absLinks(p.content?.trim() ?? "", site), 1))
  return `${out.join("\n").trimEnd()}\n`
}

/**
 * robots.txt: herkes izinli; yapay zekâ cevap botları açıkça izinli; eğitim tarayıcıları site ayarına göre.
 * Bir botun kendi grubu varsa "*" grubunu okumaz; bu yüzden disallow her gruba yazılır.
 */
export function robotsTxt(g: Pick<GeoSite, "aiTraining" | "disallow">, site: URL | string): string {
  const disallow = (g.disallow ?? []).map((p) => `Disallow: ${p}`)
  const training = g.aiTraining ?? true
  return [
    "# Arama motorları ve diğer tarayıcılar",
    "User-agent: *",
    "Allow: /",
    ...disallow,
    "",
    "# Yapay zekâ arama ve cevap botları: ziyaretçinin sorusunu cevaplarken sayfayı okur ve kaynak gösterir (izinli)",
    ...ANSWER_BOTS.map((b) => `User-agent: ${b}`),
    "Allow: /",
    ...disallow,
    "",
    `# Yapay zekâ eğitim tarayıcıları: ${training ? "izinli" : "kapalı"} (site/src/lib/geo.ts aiTraining)`,
    ...TRAINING_BOTS.map((b) => `User-agent: ${b}`),
    ...(training ? ["Allow: /", ...disallow] : ["Disallow: /"]),
    "",
    `# Yapay zekâ için site özeti: ${abs("/llms.txt", site)} (tam metin: ${abs("/llms-full.txt", site)})`,
    `Sitemap: ${abs("/sitemap-index.xml", site)}`,
    "",
  ].join("\n")
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" }
const decode = (s: string): string =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (all, e: string) => {
    if (e[0] === "#") {
      const n = e[1]?.toLowerCase() === "x" ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : all
    }
    return ENTITIES[e.toLowerCase()] ?? all
  })

/**
 * Panel editörü HTML'i -> sade markdown (başlık, paragraf, liste, bağlantı, kalın/italik, alıntı).
 * Görseller, betikler ve tanınmayan etiketler atılır, metinleri kalır. Göreli bağlantılar `site` verilirse mutlak olur.
 */
export function htmlToMarkdown(html: string, site?: URL | string): string {
  const href = (u: string): string => {
    const d = decode(u).trim()
    if (!site || /^(?:[a-z]+:|#)/i.test(d)) return d
    return abs(d, site)
  }
  let s = html
    .replace(/<(script|style|iframe|object|embed|svg|form)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n: string, t: string) => `\n\n${"#".repeat(Number(n))} ${t.replace(/\s+/g, " ").trim()}\n\n`)
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, _t, t: string) => (t.trim() ? `**${t.trim()}**` : ""))
    .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, _t, t: string) => (t.trim() ? `*${t.trim()}*` : ""))
    .replace(/<a\b[^>]*?href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi, (_, _q, u: string, t: string) => {
      const text = t.replace(/<[^>]+>/g, "").trim()
      return text ? `[${text}](${href(u)})` : ""
    })
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_, t: string) => `\n- ${t.replace(/<\/?p\b[^>]*>/gi, " ").replace(/\s+/g, " ").trim()}\n`)
    .replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, t: string) =>
      `\n\n${t.replace(/<[^>]+>/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => `> ${l}`).join("\n")}\n\n`)
    .replace(/<\/(p|div|ul|ol|section|article|table|tr|figure)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
  s = decode(s)
  return s
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^(- .*)\n\n(?=- )/gm, "$1\n")
    .trim()
}

/** Markdown -> düz metin (arama dizini için): bağlantı adresleri, başlık/liste işaretleri ve vurgu atılır. */
export const plainText = (md: string): string =>
  md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/(\*\*|__|\*|_|`)/g, "")
    .replace(/\s+/g, " ")
    .trim()
