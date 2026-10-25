// SİTEYE ÖZEL (template başlangıç dosyası, core değil): GEO ve WebMCP için sitenin tanımı. Rehber docs/geo-webmcp.md.
// Core çıktılar (/llms.txt, /llms-full.txt, /robots.txt, /<yol>/index.md, /webmcp.json, WebMCP araçları) yalnız bunu okur.
// Veri sayfalarla aynı yerden gelir (loadSite: PB ya da fixture); PB/fixture paritesi bu dosyaları da karşılaştırır.
import { loadSite } from "./content"
import { formatDate, lines } from "./format"
import { type GeoSite, htmlToMarkdown } from "./llms"

export async function geo(): Promise<GeoSite> {
  const { settings: s, posts, pages } = await loadSite()
  const home = [
    `# ${s.heroTitle}`,
    s.heroText,
    "## Yazılar",
    posts.map((p) => `- [${p.title}](/yazilar/${p.slug}/) (${formatDate(p.date)}): ${p.summary}`).join("\n"),
    "## İletişim",
    [s.phone && `- Telefon: ${s.phone}`, s.email && `- E-posta: ${s.email}`, s.address && `- Adres: ${lines(s.address).join(", ")}`].filter(Boolean).join("\n"),
  ].filter(Boolean).join("\n\n")
  return {
    name: s.companyName,
    summary: s.seoDescription || s.heroText,
    facts: { Telefon: s.phone, "E-posta": s.email, Adres: lines(s.address).join(", ") },
    sections: [
      { title: "Sayfalar", pages: [{ path: "/", title: "Ana sayfa", description: s.seoDescription, content: home }] },
      {
        title: "Yazılar",
        pages: posts.map((p) => ({ path: `/yazilar/${p.slug}/`, title: p.title, description: p.summary, date: p.date, content: htmlToMarkdown(p.body) })),
      },
      { title: "Yasal bilgiler", pages: pages.map((p) => ({ path: `/${p.slug}/`, title: p.title, description: p.seoDescription, content: htmlToMarkdown(p.body) })) },
    ],
    // Ziyaretçi formu ana sayfada; Google Forms ya da WhatsApp kullanan site bağlantıyı buraya yazar (kind: "form" / "whatsapp").
    contact: [{ label: "İletişim formu", url: "/#iletisim", kind: "form", description: "Mesajınızı ana sayfadaki formla gönderin." }],
    // Eğitim tarayıcıları (GPTBot, ClaudeBot, Google-Extended, CCBot...). Müşteri istemezse false; cevap botları yine izinli.
    aiTraining: true,
  }
}
