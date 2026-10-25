import { lines, telHref } from "./format"
import type { Settings } from "./types"

/**
 * Kurum için schema.org yapılandırılmış verisi (Site Ayarları'ndan). Adres ya da telefon varsa LocalBusiness
 * (Google haritalar/yerel sonuçlar), yoksa Organization. Boş alanlar yazılmaz.
 */
export function organizationJsonLd(s: Settings, siteUrl: string, image?: string): Record<string, unknown> {
  const local = Boolean(s.address?.trim() || s.phone?.trim())
  const street = lines(s.address).join(", ")
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": local ? "LocalBusiness" : "Organization",
    "@id": new URL("/#organization", siteUrl).href,
    name: s.companyName,
    url: new URL("/", siteUrl).href,
    description: s.seoDescription || undefined,
    image,
    telephone: s.phone?.trim() ? telHref(s.phone).slice(4) : undefined,
    email: s.email || undefined,
    address: street ? { "@type": "PostalAddress", streetAddress: street, addressCountry: "TR" } : undefined,
  }
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
}

/** <script type="application/ld+json"> içeriği: "<" kaçırılır, panelden gelen metin betik etiketini kapatamaz. */
export const jsonLdText = (data: object): string => JSON.stringify(data).replace(/</g, "\\u003c")

/** Cloudflare Web Analytics betiğinin data-cf-beacon özniteliği; anahtar biçimsizse (32 onaltılı karakter değilse) sayaç eklenmez. */
export const cfBeacon = (token: string | undefined): string | undefined =>
  token && /^[0-9a-f]{32}$/.test(token.trim()) ? JSON.stringify({ token: token.trim() }) : undefined

// Sitemap lastmod: sayfa build sırasında tarihini kaydeder, astro.config.mjs'teki sitemap serialize okur
// (build ve sitemap aynı süreçte çalışır). Tarihi olmayan sayfa lastmod'suz yazılır.
type LastmodStore = { __sitemapLastmod?: Map<string, string> }
export function recordLastmod(path: string, isoDate: string): void {
  const g = globalThis as LastmodStore
  ;(g.__sitemapLastmod ??= new Map()).set(path, isoDate.slice(0, 10))
}
