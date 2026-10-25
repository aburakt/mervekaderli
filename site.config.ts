// SİTEYE ÖZEL: ortak betikler (scripts/verify.ts, tests/hooks.test.ts) bu dosyayı okur.
// PB tarafındaki karşılığı pb/pb_hooks/site.js (ID, içerik koleksiyonları, panel korumaları).
import type { Pb } from "./scripts/pb-harness"
import { GEO_CHECKS } from "./scripts/geo-check"
import { seed } from "./scripts/seed"
import type { SiteConfig } from "./scripts/site-types"

const TOKEN = "0123456789abcdef0123456789abcdef"
const first = async (pb: Pb, collection: string, filter = "") =>
  ((await (await pb.admin(`/api/collections/${collection}/records?perPage=1&filter=${encodeURIComponent(filter)}`)).json()) as { items: { id: string }[] }).items[0]!.id
const patch = async (pb: Pb, collection: string, id: string, body: Record<string, unknown>) => {
  const res = await pb.admin(`/api/collections/${collection}/records/${id}`, { method: "PATCH", body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`testSeed ${collection}: ${res.status} ${await res.text()}`)
}

export const SITE: SiteConfig = {
  checks: [
    // tek dilli: hreflang yok (çok dilli sitede hasNot kaldırılır, has'a hreflang eklenir; docs/i18n.md)
    { name: "Ana sayfa", path: "/", has: ['<html lang="tr"', "<h1", "Örnek Kurum", 'rel="canonical"', 'property="og:image"', "Örnek yazı", '"@type":"LocalBusiness"', 'href="/kvkk-aydinlatma-metni/"'], hasNot: ["hreflang"] },
    { name: "Yazı sayfası", path: "/yazilar/ornek-yazi/", has: ["<h1", "Örnek yazı", "Yazının metni"] },
    { name: "KVKK aydınlatma metni", path: "/kvkk-aydinlatma-metni/", has: ["<h1", "KVKK Aydınlatma Metni", "Taslak metin, gözden geçirilmeli"] },
    { name: "Gizlilik ve çerez politikası", path: "/gizlilik-politikasi/", has: ["<h1", "Çerezler"] },
    { name: "İletişim formu PB'ye gönderir", path: "/", has: ['data-contact-form', "/api/collections/messages/records", 'name="kvkk_consent"', 'name="website"'] },
    // PB adresi build'de connect-src'ye eklenir (site/integrations/pb-csp.ts); verify PB'si 127.0.0.1'de çalışır
    { name: "CSP form gönderimine izin verir", path: "/_headers", has: ["connect-src 'self' https://cloudflareinsights.com http://127.0.0.1:"] },
    { name: "404 sayfası", path: "/yok-boyle-bir-sayfa/", status: 404, has: ["Sayfa bulunamadı"] },
    { name: "Sitemap", path: "/sitemap-index.xml" },
    { name: "Sitemap tarihleri", path: "/sitemap-0.xml", has: ["<lastmod>2026-10-01"] },
    { name: "Robots", path: "/robots.txt", has: ["Sitemap:"] },
    // GEO ve WebMCP (lib/geo.ts, docs/geo-webmcp.md): ortak kontroller, sonra bu sitenin içeriği
    ...GEO_CHECKS,
    { name: "Robots: eğitim tarayıcıları izinli (geo.ts aiTraining)", path: "/robots.txt", has: ["User-agent: meta-externalagent\nAllow: /\n"] },
    { name: "llms.txt", path: "/llms.txt", has: ["Örnek Kurum", "/yazilar/ornek-yazi/): ", "## Yasal bilgiler"] },
    { name: "llms-full.txt", path: "/llms-full.txt", has: ["## Örnek yazı", "Yazının metni", "## Veri sorumlusu"] },
    { name: "Yazının markdown eşi", path: "/yazilar/ornek-yazi/index.md", has: ["# Örnek yazı", "Kaynak: ", "Tarih: 2026-10-01"] },
    { name: "Markdown eşi ve WebMCP betiği sayfada", path: "/yazilar/ornek-yazi/", has: ['<link rel="alternate" type="text/markdown" href="/yazilar/ornek-yazi/index.md">', '"@type":"Article"', '"@type":"BreadcrumbList"'] },
    { name: "WebMCP verisi", path: "/webmcp.json", has: ['"name":"Örnek Kurum"', '"path":"/yazilar/ornek-yazi/"', '"kind":"form"'] },
    { name: "İletişim formu WebMCP bildirimsel araç", path: "/", has: ['toolname="contact_message"', "toolparamdescription="], hasNot: ["toolautosubmit"] },
    { name: "Yönlendirmeler", path: "/_redirects", has: ["\n/index.html / 301\n", "\n/eski-yazi /yazilar/ornek-yazi/ 301\n/eski-yazi/ /yazilar/ornek-yazi/ 301\n"] },
  ],
  hookSample: {
    collection: "posts",
    create: { title: "hook-testi", date: "2026-01-01 00:00:00.000Z", summary: "x", body: "<p>x</p>", published: true },
    update: (n) => ({ summary: `özet ${n}` }),
  },
  // Gerçek içerikte olmayan durumlar: ziyaret sayacı anahtarı dolu, KVKK metni taslakta (bağlantısı ve sayfası yok olmalı).
  testSeed: async (pb) => {
    await seed(pb)
    await patch(pb, "settings", await first(pb, "settings"), { cf_analytics_token: TOKEN })
    await patch(pb, "pages", await first(pb, "pages", 'slug = "kvkk-aydinlatma-metni"'), { published: false })
  },
  testChecks: [
    {
      name: "Ziyaret sayacı (Cloudflare Web Analytics) dış betik", path: "/",
      has: ['src="https://static.cloudflareinsights.com/beacon.min.js"', `data-cf-beacon="{&quot;token&quot;:&quot;${TOKEN}&quot;}"`, 'href="/gizlilik-politikasi/"'],
      hasNot: ['href="/kvkk-aydinlatma-metni/"'],
    },
    { name: "Taslak sayfa yayınlanmaz", path: "/kvkk-aydinlatma-metni/", status: 404 },
  ],
}
