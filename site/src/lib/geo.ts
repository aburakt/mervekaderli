// SİTEYE ÖZEL: GEO ve WebMCP için sitenin tanımı. Rehber docs/geo-webmcp.md.
// Core çıktılar (/llms.txt, /llms-full.txt, /robots.txt, /<yol>/index.md, /webmcp.json, WebMCP araçları) yalnız bunu okur.
// Veri sayfalarla aynı yerden gelir (loadSite: PB ya da fixture); PB/fixture paritesi bu dosyaları da karşılaştırır.
import { isUpcoming, isWorkshop, price, workshopDate } from "./catalog"
import { loadSite } from "./content"
import { lines, telHref } from "./format"
import { type GeoSite, htmlToMarkdown } from "./llms"

export async function geo(): Promise<GeoSite> {
  const { settings: s, posts, pages, products } = await loadSite()
  const items = products.filter((p) => !isWorkshop(p))
  const workshops = products.filter((p) => isWorkshop(p) && isUpcoming(p))
  const stock = (n: number) => (n > 0 ? "satışta" : "tükendi")
  const when = (iso?: string) => (iso ? workshopDate(iso).long : "tarih birlikte belirlenir")
  const home = [
    `# ${s.heroTitle}`,
    s.heroText,
    "## Koleksiyon",
    items.map((p) => `- [${p.title}](/urunler/${p.slug}/) (${price(p.price)}, ${stock(p.stock)}): ${p.summary}`).join("\n"),
    workshops.length ? "## Atölyeler" : "",
    workshops.map((w) => `- ${w.title} (${when(w.eventDate)}, ${price(w.price)}): ${w.summary}`).join("\n"),
    s.aboutTitle ? `## ${s.aboutTitle}` : "",
    lines(s.aboutText).join("\n\n"),
    "## Ziyaret ve iletişim",
    [s.address && `- Adres: ${lines(s.address).join(", ")}`, s.hours && `- Açık: ${s.hours}`, s.phone && `- Telefon: ${s.phone}`, s.email && `- E-posta: ${s.email}`].filter(Boolean).join("\n"),
  ].filter(Boolean).join("\n\n")
  const workshopPage = [
    s.workshopIntro,
    ...workshops.map((w) => `## ${w.title}\n\n${when(w.eventDate)} · ${price(w.price)} · ${w.stock > 0 ? `${w.stock} kişilik yer` : "kontenjan doldu"}\n\n${htmlToMarkdown(w.description)}`),
  ].filter(Boolean).join("\n\n")
  return {
    name: s.companyName,
    summary: s.seoDescription || s.heroText,
    facts: { Telefon: s.phone, "E-posta": s.email, Adres: lines(s.address).join(", "), "Açık": s.hours },
    sections: [
      {
        title: "Sayfalar",
        pages: [
          { path: "/", title: "Ana sayfa", description: s.seoDescription, content: home },
          { path: "/atolyeler/", title: "Atölyeler", description: "Çark, el şekillendirme ve boyama atölyeleri.", content: workshopPage },
        ],
      },
      {
        title: "Koleksiyon",
        pages: items.map((p) => ({ path: `/urunler/${p.slug}/`, title: p.title, description: p.summary, content: `${price(p.price)}, ${stock(p.stock)}.\n\n${htmlToMarkdown(p.description)}` })),
      },
      ...(posts.length ? [{
        title: "Stüdyodan notlar",
        pages: posts.map((p) => ({ path: `/yazilar/${p.slug}/`, title: p.title, description: p.summary, date: p.date, content: htmlToMarkdown(p.body) })),
      }] : []),
      { title: "Yasal bilgiler", pages: pages.map((p) => ({ path: `/${p.slug}/`, title: p.title, description: p.seoDescription, content: htmlToMarkdown(p.body) })) },
    ],
    contact: [
      { label: "İletişim formu", url: "/#ziyaret", kind: "form", description: "Kişiye özel sipariş, grup atölyesi ve sorular için ana sayfadaki form." },
      ...(s.phone ? [{ label: "Telefon", url: telHref(s.phone), kind: "phone" as const }] : []),
      ...(s.instagram ? [{ label: "Instagram", url: s.instagram, kind: "other" as const }] : []),
    ],
    aiTraining: true,
  }
}
