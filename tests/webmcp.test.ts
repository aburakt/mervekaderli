import { afterEach, describe, expect, test } from "bun:test"
import type { GeoSite } from "../site/src/lib/llms"
import { findPage, fold, modelContextOf, registerTools, searchContent, type Tool, webmcpData, webmcpTools } from "../site/src/lib/webmcp"

// ORTAK (core): WebMCP araçları (site/src/lib/webmcp.ts) ve tarayıcı betiği (site/src/scripts/webmcp.ts).
const SITE = "https://www.ornek.com.tr"
const g: GeoSite = {
  name: "Örnek Kurum",
  summary: "Isıtma ve soğutma tesisatı müşavirliği.",
  facts: { Telefon: "0 312 000 00 00", "E-posta": " ", Adres: "Çankaya / Ankara" },
  sections: [
    { title: "Sayfalar", pages: [{ path: "/", title: "Ana sayfa", description: "Giriş", content: "Kurum ANKARA'da çalışır." }] },
    {
      title: "Yazılar",
      pages: [
        { path: "/yazilar/isi-pompasi/", title: "Isı pompası nedir?", description: "Kısa rehber", date: "2026-10-01", content: "## Giriş\n\nIsı pompası [verimli](/x/) bir ISITMA yöntemidir." },
        { path: "/yazilar/iklim/", title: "İklimlendirme", content: "Soğutma ve havalandırma." },
      ],
    },
  ],
  contact: [{ label: "Teklif formu", url: "https://forms.gle/abc", kind: "form" }],
}
const data = webmcpData(g, SITE)
const tools = webmcpTools(data)
const tool = (name: string) => tools.find((t) => t.name === name)!
const run = async (name: string, input: Record<string, unknown> = {}) => JSON.parse((await tool(name).execute(input)).content[0]!.text) as unknown

describe("webmcp.json verisi", () => {
  test("mutlak adresler, bölüm adları, boş künye atılır, dizin düz metin", () => {
    expect(data.url).toBe(`${SITE}/`)
    expect(data.facts).toEqual({ Telefon: "0 312 000 00 00", Adres: "Çankaya / Ankara" })
    expect(data.pages.map((p) => [p.url, p.section])).toEqual([[`${SITE}/`, "Sayfalar"], [`${SITE}/yazilar/isi-pompasi/`, "Yazılar"], [`${SITE}/yazilar/iklim/`, "Yazılar"]])
    expect(data.index[1]!.text).toBe("Isı pompası nedir? Kısa rehber Giriş Isı pompası verimli bir ISITMA yöntemidir.")
    expect(data.contact[0]!.url).toBe("https://forms.gle/abc")
  })
})

describe("arama", () => {
  test("Türkçe katlama: İ/ı ve aksan farkı aramayı bozmaz", () => {
    expect(fold("İKLİMLENDİRME Isı Şişe")).toBe("iklimlendirme isi sise")
    expect(searchContent(data, "iklimlendirme")[0]!.url).toBe(`${SITE}/yazilar/iklim/`)
    expect(searchContent(data, "ISI POMPASI")[0]!.url).toBe(`${SITE}/yazilar/isi-pompasi/`)
    expect(searchContent(data, "isi pompasi")[0]!.title).toBe("Isı pompası nedir?")
  })
  test("başlık eşleşmesi önce, eşleşmeyen dönmez, limit 1-10, boş sorgu boş", () => {
    const hits = searchContent(data, "ankara ısıtma")
    expect(hits.map((h) => h.url)).toEqual([`${SITE}/`, `${SITE}/yazilar/isi-pompasi/`])
    expect(searchContent(data, "pompa", 0).length).toBe(1)
    expect(searchContent(data, "  ")).toEqual([])
    expect(searchContent(data, "olmayankelime")).toEqual([])
  })
  test("parça eşleşmenin çevresinden", () => {
    expect(searchContent(data, "verimli")[0]!.snippet).toContain("verimli")
  })
})

describe("araçlar", () => {
  test("hepsi salt okunur, adları spec sınırında, şema nesne", () => {
    expect(tools.map((t) => t.name)).toEqual(["site_info", "list_pages", "search_content", "get_page", "contact_links"])
    for (const t of tools) {
      expect(t.annotations.readOnlyHint).toBe(true)
      expect(t.name).toMatch(/^[a-z_]{1,128}$/)
      expect(t.inputSchema.type).toBe("object")
      expect(t.description.length).toBeGreaterThan(10)
    }
  })
  test("site_info, list_pages (bölüm süzgeci), search_content, get_page", async () => {
    expect(await run("site_info")).toEqual({ name: "Örnek Kurum", url: `${SITE}/`, summary: g.summary, Telefon: "0 312 000 00 00", Adres: "Çankaya / Ankara" })
    expect((await run("list_pages", { section: "Yazılar" }) as unknown[]).length).toBe(2)
    expect((await run("list_pages") as unknown[]).length).toBe(3)
    expect((await run("search_content", { query: "soğutma", limit: 3 }) as { url: string }[])[0]!.url).toBe(`${SITE}/yazilar/iklim/`)
    expect(await run("get_page", { url: "/yazilar/iklim" })).toMatchObject({ title: "İklimlendirme", text: "İklimlendirme Soğutma ve havalandırma." })
    expect(await run("get_page", { url: `${SITE}/yazilar/isi-pompasi/index.md` })).toMatchObject({ title: "Isı pompası nedir?", date: "2026-10-01" })
    expect(await run("get_page", { url: "/yok/" })).toHaveProperty("error")
    expect(await run("get_page", { url: 42 })).toHaveProperty("error")
  })
  test("iletişim aracı yalnız bağlantı döndürür ve yalnız bağlantı varsa vardır", async () => {
    expect(await run("contact_links")).toEqual([{ label: "Teklif formu", url: "https://forms.gle/abc", kind: "form" }])
    expect(tool("contact_links").description).toContain("göndermez")
    expect(webmcpTools(webmcpData({ ...g, contact: [] }, SITE)).map((t) => t.name)).not.toContain("contact_links")
  })
  test("findPage farklı yazımları çözer", () => {
    expect(findPage(data, "yazilar/iklim/")?.path).toBe("/yazilar/iklim/")
    expect(findPage(data, "")).toBeUndefined()
  })
})

describe("API algılama ve kayıt", () => {
  const fake = (fail = new Set<string>(), sync = false) => {
    const got: { tool: Tool; signal?: AbortSignal }[] = []
    return {
      got,
      registerTool: (tool: Tool, opts?: { signal?: AbortSignal }) => {
        if (fail.has(tool.name)) {
          if (sync) throw new Error("InvalidStateError")
          return Promise.reject(new Error("InvalidStateError"))
        }
        got.push({ tool, signal: opts?.signal })
        return sync ? undefined : Promise.resolve()
      },
    }
  }
  test("document.modelContext (spec) önce, navigator.modelContext (erken Chrome) yedek, yoksa undefined", () => {
    const a = fake(), b = fake()
    expect(modelContextOf({ modelContext: a }, { modelContext: b })).toBe(a)
    expect(modelContextOf({}, { modelContext: b })).toBe(b)
    expect(modelContextOf({}, {})).toBeUndefined()
    expect(modelContextOf({ modelContext: {} }, undefined)).toBeUndefined()
    expect(modelContextOf(undefined, undefined)).toBeUndefined()
  })
  test("hata veren araç atlanır (sync ve async), diğerleri kaydedilir, signal iletilir", async () => {
    const ctl = new AbortController()
    for (const sync of [false, true]) {
      const mc = fake(new Set(["get_page"]), sync)
      const done = await registerTools(mc, tools, ctl.signal)
      expect(done).toEqual(["site_info", "list_pages", "search_content", "contact_links"])
      expect(mc.got.every((r) => r.signal === ctl.signal)).toBe(true)
    }
  })
})

describe("tarayıcı betiği", () => {
  const saved = { document: globalThis.document, navigator: globalThis.navigator, fetch: globalThis.fetch }
  afterEach(() => {
    Object.assign(globalThis, saved)
  })
  test("API yoksa veri indirmez, hiçbir şey kaydetmez", async () => {
    let fetched = 0
    Object.assign(globalThis, { document: {}, fetch: async () => (fetched++, new Response("{}")) })
    await import("../site/src/scripts/webmcp.ts?yok")
    await Bun.sleep(5)
    expect(fetched).toBe(0)
  })
  test("API varsa /webmcp.json'u aynı kökenden okur ve araçları kaydeder", async () => {
    const names: string[] = []
    const urls: string[] = []
    Object.assign(globalThis, {
      document: { modelContext: { registerTool: async (t: Tool) => void names.push(t.name) } },
      fetch: async (u: string) => (urls.push(u), new Response(JSON.stringify(data))),
    })
    await import("../site/src/scripts/webmcp.ts?var")
    await Bun.sleep(20)
    expect(urls).toEqual(["/webmcp.json"])
    expect(names).toEqual(tools.map((t) => t.name))
  })
  test("veri gelmezse sessizce vazgeçer (reddedilen söz yok)", async () => {
    const names: string[] = []
    Object.assign(globalThis, {
      document: { modelContext: { registerTool: async (t: Tool) => void names.push(t.name) } },
      fetch: async () => { throw new TypeError("ağ yok") },
    })
    await import("../site/src/scripts/webmcp.ts?hata")
    await Bun.sleep(20)
    expect(names).toEqual([])
  })
})
