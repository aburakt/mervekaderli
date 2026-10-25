// ORTAK (core): template'ten gelir, sitede elle değiştirilmez (bun run core:sync). Rehber docs/geo-webmcp.md.
//
// Sayfa düzeyi schema.org yardımcıları: WebPage, Article, FAQPage, BreadcrumbList. Kurum (Organization/LocalBusiness)
// verisi burada değil, siteye ait lib/seo.ts'te (Head.astro ana sayfada kendiliğinden ekler); bu yardımcılar ona
// `publisher`/`isPartOf` ile "/#organization" kimliğinden bağlanır. Çıktı Base/Head `jsonLd` özelliğine verilir;
// Head `jsonLdText` ile "<" kaçırarak yazar. Boş alanlar yazılmaz. Tarihler "YYYY-AA-GG" ya da tam ISO.
// Saf fonksiyonlar: tests/geo.test.ts doğrudan çağırır.

type Node = Record<string, unknown>

/** undefined, null, "" ve boş diziler atılır (iç içe nesnelerde de). */
export function compact<T extends Node>(o: T): T {
  const out: Node = {}
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) continue
    out[k] = v && typeof v === "object" && !Array.isArray(v) ? compact(v as Node) : v
  }
  return out as T
}

const date = (d: string | undefined): string | undefined => (d ? d.trim().replace(" ", "T") : undefined)
const abs = (path: string, site: string | URL): string => new URL(path, site).href
/** Head'deki kurum verisinin kimliği (lib/seo.ts organizationJsonLd "@id"). */
export const organizationId = (site: string | URL): string => abs("/#organization", site)

/** Birden çok düğümü tek blokta verir: { "@context", "@graph": [...] }. Tek düğümde @context eklenmiş düğüm. */
export function graph(...nodes: (Node | undefined)[]): Node {
  const list = nodes.filter((n): n is Node => Boolean(n)).map((n) => Object.fromEntries(Object.entries(n).filter(([k]) => k !== "@context")))
  return list.length === 1 ? { "@context": "https://schema.org", ...list[0] } : { "@context": "https://schema.org", "@graph": list }
}

export type PageInfo = {
  site: string | URL
  path: string
  name: string
  description?: string
  datePublished?: string
  /** Son değişiklik: PB kaydının `updated` alanı; yoksa yayın tarihi. */
  dateModified?: string
  image?: string
  inLanguage?: string
  /** WebPage alt türü: "AboutPage", "ContactPage", "CollectionPage", "FAQPage"... */
  type?: string
}

export function webPage(p: PageInfo): Node {
  const url = abs(p.path, p.site)
  return compact({
    "@context": "https://schema.org",
    "@type": p.type ?? "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: p.name,
    description: p.description,
    inLanguage: p.inLanguage ?? "tr-TR",
    datePublished: date(p.datePublished),
    dateModified: date(p.dateModified ?? p.datePublished),
    primaryImageOfPage: p.image ? { "@type": "ImageObject", url: p.image } : undefined,
    isPartOf: { "@type": "WebSite", "@id": abs("/#website", p.site), url: abs("/", p.site) },
    publisher: { "@id": organizationId(p.site) },
  })
}

/** Yazı/haber: Article (ya da "NewsArticle", "BlogPosting"). Yazar verilmezse kurum. */
export function article(p: PageInfo & { author?: string; articleType?: string }): Node {
  const url = abs(p.path, p.site)
  return compact({
    "@context": "https://schema.org",
    "@type": p.articleType ?? "Article",
    "@id": `${url}#article`,
    mainEntityOfPage: url,
    url,
    headline: p.name.slice(0, 110),
    description: p.description,
    inLanguage: p.inLanguage ?? "tr-TR",
    datePublished: date(p.datePublished),
    dateModified: date(p.dateModified ?? p.datePublished),
    image: p.image ? [p.image] : undefined,
    author: p.author ? { "@type": "Person", name: p.author } : { "@id": organizationId(p.site) },
    publisher: { "@id": organizationId(p.site) },
  })
}

/** SSS: soru ve cevap metni (cevap düz metin ya da basit HTML). Boş soru/cevap atılır. */
export function faqPage(items: { question: string; answer: string }[], page?: { site: string | URL; path: string }): Node | undefined {
  const list = items.filter((i) => i.question?.trim() && i.answer?.trim())
  if (!list.length) return undefined
  return compact({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": page ? `${abs(page.path, page.site)}#faq` : undefined,
    mainEntity: list.map((i) => ({ "@type": "Question", name: i.question.trim(), acceptedAnswer: { "@type": "Answer", text: i.answer.trim() } })),
  })
}

/** Gezinti izi: [{ name: "Ana sayfa", path: "/" }, { name: "Yazılar", path: "/#yazilar" }, ...]. Son öğe sayfanın kendisi. */
export function breadcrumbList(items: { name: string; path: string }[], site: string | URL): Node | undefined {
  if (items.length < 2) return undefined
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((i, n) => ({ "@type": "ListItem", position: n + 1, name: i.name, item: abs(i.path, site) })),
  }
}
