// ORTAK (core): template'ten gelir, sitede elle değiştirilmez (bun run core:sync). Rehber docs/geo-webmcp.md.
//
// WebMCP (W3C Web Machine Learning CG, https://webmachinelearning.github.io/webmcp/): sayfa, tarayıcıdaki yapay zekâ
// ajanına araç (tool) tanıtır. Burada yalnız OKUYAN araçlar var: site künyesi, sayfa listesi, içerikte arama, sayfa metni,
// iletişim bağlantıları. Hiçbir araç ziyaretçi adına form göndermez, kayıt açmaz.
//
// API: spec Document.modelContext (registerTool(tool, { signal })); Chrome'un erken sürümleri navigator.modelContext.
// İkisi de denenir; ikisi de yoksa hiçbir şey yapılmaz. Veri build'de üretilen /webmcp.json'dan gelir (aynı köken, CSP 'self').
// Saf fonksiyonlar: tests/webmcp.test.ts doğrudan çağırır; tarayıcı tarafı scripts/webmcp.ts.
import { allPages, abs, type GeoLink, type GeoSite, plainText } from "./llms"
import { lower } from "./tr"

export const WEBMCP_DATA_PATH = "/webmcp.json"

export type WebmcpPage = { title: string; url: string; path: string; section: string; description?: string; date?: string }
/** /webmcp.json: araçların okuduğu veri (build'de, sayfalarla aynı kaynaktan). */
export type WebmcpData = {
  name: string
  url: string
  summary: string
  facts: Record<string, string>
  pages: WebmcpPage[]
  contact: GeoLink[]
  /** Arama dizini: sayfanın düz metni. */
  index: { path: string; text: string }[]
}

export function webmcpData(g: GeoSite, site: URL | string): WebmcpData {
  const sectionOf = new Map<string, string>()
  for (const s of g.sections) for (const p of s.pages) if (!sectionOf.has(p.path)) sectionOf.set(p.path, s.title)
  const pages = allPages(g)
  return {
    name: g.name,
    url: abs("/", site),
    summary: g.summary,
    facts: Object.fromEntries(Object.entries(g.facts ?? {}).filter((e): e is [string, string] => Boolean(e[1]?.trim())).map(([k, v]) => [k, v.trim()])),
    pages: pages.map((p) => ({
      title: p.title, url: abs(p.path, site), path: p.path, section: sectionOf.get(p.path) ?? "",
      ...(p.description ? { description: p.description } : {}), ...(p.date ? { date: p.date } : {}),
    })),
    contact: (g.contact ?? []).map((c) => ({ ...c, url: abs(c.url, site) })),
    index: pages.map((p) => ({ path: p.path, text: plainText([p.title, p.description ?? "", p.content ?? ""].join("\n")) })),
  }
}

/** Türkçe duyarlı katlama: küçük harf (İ/ı doğru), sonra aksan atılır; "yazı", "YAZI", "yazi" aynı aranır. */
export const fold = (s: string): string =>
  lower(s).replace(/ı/g, "i").normalize("NFD").replace(/[̀-ͯ]/g, "")

export type SearchHit = { title: string; url: string; snippet: string; score: number }

/** Basit puanlı arama: her sorgu kelimesi başlıkta 3, açıklamada 2, metinde 1 puan. Hiç eşleşmeyen sayfa dönmez. */
export function searchContent(data: WebmcpData, query: string, limit = 5): SearchHit[] {
  const words = [...new Set(fold(query).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1))]
  if (!words.length) return []
  const textOf = new Map(data.index.map((e) => [e.path, e.text]))
  const hits: SearchHit[] = []
  for (const p of data.pages) {
    const text = textOf.get(p.path) ?? ""
    const t = fold(p.title), d = fold(p.description ?? ""), x = fold(text)
    let score = 0
    for (const w of words) score += (t.includes(w) ? 3 : 0) + (d.includes(w) ? 2 : 0) + (x.includes(w) ? 1 : 0)
    if (score) hits.push({ title: p.title, url: p.url, snippet: snippet(text, words), score })
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, Math.max(1, Math.min(10, Math.floor(limit))))
}

/** İlk eşleşmenin çevresinden ~200 karakter (katlama uzunluğu değiştirmezse doğru konum; değiştirirse baştan). */
function snippet(text: string, words: string[]): string {
  const f = fold(text)
  const at = f.length === text.length ? Math.min(...words.map((w) => f.indexOf(w)).filter((i) => i >= 0), Number.MAX_SAFE_INTEGER) : 0
  const start = at === Number.MAX_SAFE_INTEGER ? 0 : Math.max(0, at - 60)
  const s = text.slice(start, start + 200).trim()
  return `${start > 0 ? "…" : ""}${s}${start + 200 < text.length ? "…" : ""}`
}

/** Spec ModelContextTool (registerTool'a verilen sözlük). */
export type ToolResult = { content: { type: "text"; text: string }[] }
export type Tool = {
  name: string
  title?: string
  description: string
  inputSchema: Record<string, unknown>
  execute: (input: Record<string, unknown>) => Promise<ToolResult>
  annotations: { readOnlyHint: boolean }
}

/**
 * Araç sonucu: spec execute dönüşünü JSON'a çevirir (Promise<any>); Chrome erken sürümü MCP biçimini
 * ({ content: [{ type: "text", text }] }) bekler. İki tarafta da okunur olsun diye MCP biçimi, metin JSON.
 */
export const result = (value: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(value) }] })

const str = (v: unknown, max = 200): string => (typeof v === "string" ? v.slice(0, max) : "")
const readOnly = { readOnlyHint: true }
const noInput = { type: "object", properties: {} }

/** Siteye göre araç listesi. İletişim aracı yalnız bağlantı varsa eklenir. */
export function webmcpTools(data: WebmcpData): Tool[] {
  const sections = [...new Set(data.pages.map((p) => p.section).filter(Boolean))]
  const tools: Tool[] = [
    {
      name: "site_info",
      title: "Kurum bilgileri",
      description: `${data.name} hakkında özet ve iletişim künyesi (telefon, e-posta, adres gibi). Kaynak: ${data.url}`,
      inputSchema: noInput,
      annotations: readOnly,
      execute: async () => result({ name: data.name, url: data.url, summary: data.summary, ...data.facts }),
    },
    {
      name: "list_pages",
      title: "Sayfa listesi",
      description: `${data.name} sitesindeki önemli sayfalar: başlık, adres, kısa açıklama.`,
      inputSchema: {
        type: "object",
        properties: { section: { type: "string", description: "Yalnız bu bölümdeki sayfalar", ...(sections.length ? { enum: sections } : {}) } },
      },
      annotations: readOnly,
      execute: async (input) => {
        const section = str(input?.section)
        return result(data.pages.filter((p) => !section || p.section === section).map(({ title, url, section: s, description, date }) => ({ title, url, section: s, description, date })))
      },
    },
    {
      name: "search_content",
      title: "Sitede ara",
      description: `${data.name} sitesinin içeriğinde arama yapar; eşleşen sayfaların başlığını, adresini ve metinden bir parçayı döndürür.`,
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Aranacak kelimeler (Türkçe)", maxLength: 200 },
          limit: { type: "integer", description: "En çok kaç sonuç (1-10)", minimum: 1, maximum: 10 },
        },
        required: ["query"],
      },
      annotations: readOnly,
      execute: async (input) => result(searchContent(data, str(input?.query), typeof input?.limit === "number" ? input.limit : 5)),
    },
    {
      name: "get_page",
      title: "Sayfa metni",
      description: "Sitedeki bir sayfanın düz metnini döndürür (list_pages ya da search_content adresiyle).",
      inputSchema: {
        type: "object",
        properties: { url: { type: "string", description: "Sayfa adresi ya da yolu (ör. /yazilar/ornek/)", maxLength: 500 } },
        required: ["url"],
      },
      annotations: readOnly,
      execute: async (input) => {
        const page = findPage(data, str(input?.url, 500))
        if (!page) return result({ error: "Sayfa bulunamadı. Adresleri list_pages verir." })
        return result({ title: page.title, url: page.url, date: page.date, text: data.index.find((e) => e.path === page.path)?.text ?? "" })
      },
    },
  ]
  if (data.contact.length) {
    tools.push({
      name: "contact_links",
      title: "İletişim bağlantıları",
      description: `${data.name} ile iletişim yolları (form, WhatsApp, telefon bağlantısı). Yalnız bağlantı verir; hiçbir şeyi ziyaretçi adına göndermez. Formu ziyaretçi kendisi doldurup gönderir.`,
      inputSchema: noInput,
      annotations: readOnly,
      execute: async () => result(data.contact),
    })
  }
  return tools
}

/** "/yazilar/x/", "yazilar/x", tam adres -> sayfa. */
export function findPage(data: WebmcpData, url: string): WebmcpPage | undefined {
  if (!url.trim()) return undefined
  let path: string
  try {
    path = new URL(url.trim(), data.url).pathname
  } catch {
    return undefined
  }
  const norm = (p: string) => (p.endsWith("/") ? p : `${p}/`).replace(/\/index\.(?:html|md)\/$/, "/")
  return data.pages.find((p) => norm(p.path) === norm(path))
}

/** Spec ModelContext'in kullandığımız kısmı. Erken Chrome registerTool senkron (undefined), spec Promise döndürür. */
export type ModelContextLike = { registerTool: (tool: Tool, options?: { signal?: AbortSignal }) => unknown }

/** document.modelContext (spec), yoksa navigator.modelContext (erken Chrome). API yoksa undefined. */
export function modelContextOf(doc: unknown, nav: unknown): ModelContextLike | undefined {
  for (const host of [doc, nav]) {
    const mc = (host as { modelContext?: unknown } | undefined)?.modelContext as Partial<ModelContextLike> | undefined
    if (mc && typeof mc.registerTool === "function") return mc as ModelContextLike
  }
  return undefined
}

/** Araçları kaydeder; hata (aynı ad, izin politikası, eski API) sessizce yutulur: konsola hata düşmez. Kaydedilen adlar döner. */
export async function registerTools(mc: ModelContextLike, tools: Tool[], signal?: AbortSignal): Promise<string[]> {
  const done: string[] = []
  for (const tool of tools) {
    try {
      await mc.registerTool(tool, signal ? { signal } : undefined)
      done.push(tool.name)
    } catch {
      // Araç kaydedilemedi (ör. Permissions-Policy tools=() ya da aynı adla kayıt); sayfa etkilenmez.
    }
  }
  return done
}
