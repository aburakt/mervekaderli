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
    // tek dilli: hreflang yok
    { name: "Ana sayfa", path: "/", has: ['<html lang="tr"', "<h1", "Topraktan, elde", 'rel="canonical"', 'property="og:image"', '"@type":"LocalBusiness"', "Aurora · Sarmaşık", "Çarkta Başlangıç Atölyesi", 'href="/kvkk-aydinlatma-metni/"', 'href="/sepet/"'], hasNot: ["hreflang"] },
    { name: "Koleksiyon", path: "/urunler/", has: ["<h1", "Zenith Abajur", "Moss No.01 Duvar Apliği", '"@type":"CollectionPage"'] },
    { name: "Ürün sayfası: fiyat, stok, sepete ekle, Product verisi", path: "/urunler/aurora-koi/", has: ["<h1", "Aurora · Koi", "₺5.000", "data-buy", 'data-id="mkp000000000010"', "Sepete ekle", '"@type":"Product"', '"priceCurrency":"TRY"'] },
    { name: "Tükenmiş ürün satılamaz", path: "/urunler/vahsi-isik-abajur/", has: ["Tükendi", 'data-add disabled', "https://schema.org/SoldOut"] },
    { name: "Atölyeler", path: "/atolyeler/", has: ["<h1", "Çarkta Başlangıç Atölyesi", "Birebir Çark Dersi", "Yerimi ayır", 'data-kind="workshop"'] },
    { name: "Sepet ve ödeme formu", path: "/sepet/", has: ["data-checkout", 'name="contract_consent"', 'name="kvkk_consent"', 'href="/mesafeli-satis-sozlesmesi/"', 'data-ship-free="3000"', 'content="noindex'] },
    { name: "Sipariş sayfası", path: "/siparis/", has: ["data-order", 'content="noindex'] },
    { name: "Mağaza PB adresi sayfada (canlı stok, ödeme)", path: "/urunler/", has: ["data-shop-pb=\"http://127.0.0.1:", 'data-shop-id="merve"'] },
    { name: "KVKK aydınlatma metni", path: "/kvkk-aydinlatma-metni/", has: ["<h1", "KVKK Aydınlatma Metni", "Taslak metin, gözden geçirilmeli", "Shopier"] },
    { name: "Mesafeli satış sözleşmesi", path: "/mesafeli-satis-sozlesmesi/", has: ["<h1", "Cayma hakkı"] },
    { name: "Ön bilgilendirme formu", path: "/on-bilgilendirme-formu/", has: ["<h1", "Satıcı"] },
    { name: "İptal, iade ve değişim", path: "/iptal-iade-ve-degisim/", has: ["<h1", "Atölyeler"] },
    { name: "Gizlilik ve çerez politikası", path: "/gizlilik-politikasi/", has: ["<h1", "Çerezler"] },
    { name: "İletişim formu PB'ye gönderir", path: "/", has: ['data-contact-form', "/api/collections/messages/records", 'name="kvkk_consent"', 'name="website"'] },
    // PB adresi build'de connect-src'ye, Shopier form-action'a eklenir (site/integrations/pb-csp.ts)
    { name: "CSP: PB'ye istek ve Shopier'e ödeme formu", path: "/_headers", has: ["connect-src 'self' https://cloudflareinsights.com http://127.0.0.1:", "https://www.shopier.com"] },
    { name: "404 sayfası", path: "/yok-boyle-bir-sayfa/", status: 404, has: ["Sayfa bulunamadı"] },
    { name: "Sitemap", path: "/sitemap-index.xml" },
    { name: "Sitemap ürünleri listeler", path: "/sitemap-0.xml", has: ["/urunler/aurora-koi/", "/atolyeler/"] },
    { name: "Robots", path: "/robots.txt", has: ["Sitemap:"] },
    ...GEO_CHECKS,
    { name: "Robots: eğitim tarayıcıları izinli (geo.ts aiTraining)", path: "/robots.txt", has: ["User-agent: meta-externalagent\nAllow: /\n"] },
    { name: "llms.txt", path: "/llms.txt", has: ["Merve Kaderli Ceramic Studio", "/urunler/aurora-koi/): ", "## Koleksiyon", "## Yasal bilgiler"] },
    { name: "llms-full.txt", path: "/llms-full.txt", has: ["## Aurora · Koi", "Çarkta Başlangıç Atölyesi", "## Satıcı"] },
    { name: "Ürünün markdown eşi", path: "/urunler/aurora-koi/index.md", has: ["# Aurora · Koi", "satışta", "Kaynak: "] },
    { name: "WebMCP verisi", path: "/webmcp.json", has: ['"name":"Merve Kaderli Ceramic Studio"', '"path":"/urunler/aurora-koi/"', '"kind":"form"'] },
    { name: "İletişim formu WebMCP bildirimsel araç", path: "/", has: ['toolname="contact_message"', "toolparamdescription="], hasNot: ["toolautosubmit"] },
    { name: "Yönlendirmeler", path: "/_redirects", has: ["\n/index.html / 301\n"] },
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
      hasNot: [">KVKK Aydınlatma Metni</a>"],
    },
    { name: "Taslak sayfa yayınlanmaz", path: "/kvkk-aydinlatma-metni/", status: 404 },
  ],
}
