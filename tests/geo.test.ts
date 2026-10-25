import { describe, expect, test } from "bun:test"
import { GEO_CHECKS } from "../scripts/geo-check"
import { article, breadcrumbList, faqPage, graph, webPage } from "../site/src/lib/jsonld"
import {
  ANSWER_BOTS, type GeoSite, TRAINING_BOTS, absLinks, demote, htmlToMarkdown, llmsFullTxt, llmsTxt, mdParam, mdPath, pageMarkdown, plainText, robotsTxt,
} from "../site/src/lib/llms"
import { webmcpData } from "../site/src/lib/webmcp"

// ORTAK (core): GEO üreticileri (site/src/lib/llms.ts, jsonld.ts) ve verify kontrolleri (scripts/geo-check.ts).
const SITE = "https://www.ornek.com.tr"
const g: GeoSite = {
  name: "Örnek Kurum",
  summary: "Ankara'da   mekanik tesisat\nmüşavirliği.",
  details: "Kurum 1990'dan beri çalışır.",
  facts: { Telefon: "0 312 000 00 00", "E-posta": "", Adres: "Çankaya / Ankara" },
  sections: [
    { title: "Sayfalar", pages: [{ path: "/", title: "Ana sayfa", description: "Giriş", content: "# Başlık\n\nMetin [yazı](/yazilar/a/)." }] },
    { title: "Yazılar", pages: [{ path: "/yazilar/a/", title: "A [taslak]", description: "Özet", date: "2026-10-01", content: "## Alt\n\nGövde." }, { path: "/", title: "Ana sayfa" }] },
    { title: "Boş", pages: [] },
  ],
  contact: [{ label: "WhatsApp", url: "https://wa.me/905000000000", kind: "whatsapp", description: "Yazışma" }],
}

describe("llms.txt", () => {
  const t = llmsTxt(g, SITE)
  test("llmstxt.org biçimi: H1, alıntı özet, künye, bölüm başına bağlantı listesi", () => {
    expect(t.startsWith("# Örnek Kurum\n\n> Ankara'da mekanik tesisat müşavirliği.\n\nKurum 1990'dan beri çalışır.\n\n- Telefon: 0 312 000 00 00\n- Adres: Çankaya / Ankara\n")).toBe(true)
    expect(t).toContain("## Sayfalar\n\n- [Ana sayfa](https://www.ornek.com.tr/): Giriş\n")
    expect(t).toContain("- [A \\[taslak\\]](https://www.ornek.com.tr/yazilar/a/): Özet")
    expect(t).toContain("## İletişim\n\n- [WhatsApp](https://wa.me/905000000000): Yazışma")
  })
  test("boş künye ve boş bölüm yazılmaz", () => {
    expect(t).not.toContain("E-posta")
    expect(t).not.toContain("## Boş")
    expect(t.endsWith("\n") && !t.endsWith("\n\n")).toBe(true)
  })
})

describe("llms-full.txt ve markdown eşi", () => {
  test("içeriği olan her sayfa bir kez, kaynak adresi ve tarihle; başlıklar bölümün altına iner, göreli bağlantı mutlak olur", () => {
    const f = llmsFullTxt(g, SITE)
    expect(f.match(/^## Ana sayfa$/gm)?.length).toBe(1)
    expect(f).toContain("Kaynak: https://www.ornek.com.tr/yazilar/a/\nTarih: 2026-10-01")
    expect(f).toContain("### Başlık")
    expect(f).toContain("#### Alt")
    expect(f).toContain("](https://www.ornek.com.tr/yazilar/a/)")
  })
  test("sayfa markdown'ı ve yolu", () => {
    const md = pageMarkdown(g.sections[1]!.pages[0]!, SITE)
    expect(md).toStartWith("# A [taslak]\n\n> Özet\n\nKaynak: https://www.ornek.com.tr/yazilar/a/\nTarih: 2026-10-01\n\n### Alt")
    expect(mdPath("/")).toBe("/index.md")
    expect(mdPath("/yazilar/a/")).toBe("/yazilar/a/index.md")
    expect(mdParam("/yazilar/a/")).toBe("yazilar/a/index")
    expect(mdParam("/")).toBe("index")
  })
  test("demote ve absLinks", () => {
    expect(demote("# a\n###### b\n#c", 2)).toBe("### a\n###### b\n#c")
    expect(absLinks("[x](/a/) [y](https://d.com/) [z](#c)", SITE)).toBe("[x](https://www.ornek.com.tr/a/) [y](https://d.com/) [z](#c)")
  })
})

describe("htmlToMarkdown", () => {
  test("panel HTML'i: başlık, paragraf, liste, bağlantı, vurgu, varlıklar; betik ve görsel atılır", () => {
    const html = '<h2>Hizmet &amp; Destek</h2><p>Metin <strong>kalın</strong> ve <em>eğik</em> <a href="/iletisim/">iletişim</a>.<br>Yeni satır</p><ul><li><p>Bir</p></li><li>İki</li></ul><script>alert(1)</script><img src="x.webp"><blockquote><p>Alıntı</p></blockquote><p>&#304;stanbul&nbsp;&#x131;</p>'
    expect(htmlToMarkdown(html, SITE)).toBe(
      "## Hizmet & Destek\n\nMetin **kalın** ve *eğik* [iletişim](https://www.ornek.com.tr/iletisim/).\nYeni satır\n\n- Bir\n- İki\n\n> Alıntı\n\nİstanbul ı",
    )
  })
  test("site verilmezse bağlantı olduğu gibi; boş bağlantı atılır", () => {
    expect(htmlToMarkdown('<p><a href="/a/">a</a><a href="/b/"></a></p>')).toBe("[a](/a/)")
  })
  test("plainText", () => {
    expect(plainText("## Başlık\n\n- [bağ](/x/) **kalın**\n> alıntı")).toBe("Başlık bağ kalın alıntı")
  })
})

describe("robots.txt", () => {
  test("cevap botları açıkça izinli, eğitim botları varsayılan izinli; sitemap ve llms.txt", () => {
    const r = robotsTxt({}, SITE)
    for (const b of [...ANSWER_BOTS, ...TRAINING_BOTS]) expect(r).toContain(`User-agent: ${b}\n`)
    expect(r).not.toContain("Disallow")
    expect(r).toContain("Sitemap: https://www.ornek.com.tr/sitemap-index.xml")
    expect(r).toContain("https://www.ornek.com.tr/llms.txt")
  })
  test("aiTraining: false eğitim grubunu kapatır, cevap botları ve diğerleri açık kalır; disallow her grupta", () => {
    const r = robotsTxt({ aiTraining: false, disallow: ["/k/"] }, SITE)
    const training = r.slice(r.indexOf("User-agent: GPTBot"))
    expect(training).toContain("Disallow: /\n")
    expect(training).not.toContain("Allow: /\n")
    const answer = r.slice(r.indexOf("User-agent: OAI-SearchBot"), r.indexOf("User-agent: GPTBot"))
    expect(answer).toContain("Allow: /\nDisallow: /k/\n")
    expect(r.slice(0, r.indexOf("User-agent: OAI-SearchBot"))).toContain("Disallow: /k/")
  })
})

describe("sayfa düzeyi JSON-LD", () => {
  test("Article: tarih, yayıncı kurum kimliği, boş alan yok", () => {
    const a = article({ site: SITE, path: "/yazilar/a/", name: "A", datePublished: "2026-10-01", dateModified: "2026-10-05 10:00:00.000Z" })
    expect(a).toMatchObject({ "@type": "Article", url: `${SITE}/yazilar/a/`, datePublished: "2026-10-01", dateModified: "2026-10-05T10:00:00.000Z", publisher: { "@id": `${SITE}/#organization` } })
    expect("description" in a).toBe(false)
    expect("image" in a).toBe(false)
  })
  test("WebPage: dateModified yoksa yayın tarihi", () => {
    expect(webPage({ site: SITE, path: "/hakkimizda/", name: "Hakkımızda", datePublished: "2026-01-01", type: "AboutPage" })).toMatchObject({ "@type": "AboutPage", dateModified: "2026-01-01", inLanguage: "tr-TR" })
  })
  test("FAQPage boş soruları atar, hiç yoksa undefined; BreadcrumbList sırası", () => {
    expect(faqPage([{ question: " ", answer: "x" }])).toBeUndefined()
    const f = faqPage([{ question: "Soru?", answer: "Cevap." }, { question: "Boş", answer: "" }])!
    expect((f.mainEntity as unknown[]).length).toBe(1)
    const b = breadcrumbList([{ name: "Ana sayfa", path: "/" }, { name: "A", path: "/a/" }], SITE)!
    expect(b.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Ana sayfa", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "A", item: `${SITE}/a/` },
    ])
    expect(breadcrumbList([{ name: "Ana sayfa", path: "/" }], SITE)).toBeUndefined()
  })
  test("graph: tek düğüm düz, çok düğüm @graph; undefined atılır", () => {
    const one = graph(webPage({ site: SITE, path: "/", name: "x" }), undefined)
    expect(one["@type"]).toBe("WebPage")
    const two = graph(webPage({ site: SITE, path: "/", name: "x" }), faqPage([{ question: "a", answer: "b" }]))
    expect((two["@graph"] as Record<string, unknown>[]).map((n) => n["@type"])).toEqual(["WebPage", "FAQPage"])
    expect((two["@graph"] as Record<string, unknown>[]).some((n) => "@context" in n)).toBe(false)
  })
})

describe("verify GEO kontrolleri (scripts/geo-check.ts) üreticilerle uyumlu", () => {
  const home = g.sections[0]!.pages[0]!
  const body: Record<string, string> = {
    "/llms.txt": llmsTxt(g, SITE),
    "/llms-full.txt": llmsFullTxt(g, SITE),
    "/robots.txt": robotsTxt({ aiTraining: false }, SITE),
    "/webmcp.json": JSON.stringify(webmcpData(g, SITE)),
    "/index.md": pageMarkdown(home, SITE),
  }
  test("üretilen her dosya kendi kontrolünü geçer", () => {
    for (const c of GEO_CHECKS.filter((c) => c.path in body)) {
      expect({ check: c.name, missing: (c.has ?? []).filter((s) => !body[c.path]!.includes(s)) }).toEqual({ check: c.name, missing: [] })
    }
  })
  test("sayfa kontrolü dış dosya betiği ve markdown eşi ister", () => {
    const page = GEO_CHECKS.find((c) => c.path === "/")!
    expect(page.has).toContain('<link rel="alternate" type="text/markdown" href="/index.md">')
    expect(page.has!.some((s) => s.startsWith('<script type="module" src="/_astro/'))).toBe(true)
  })
})
