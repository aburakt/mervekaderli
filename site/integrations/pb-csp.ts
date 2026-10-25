// ORTAK (core): template'ten gelir, sitede elle değiştirilmez (bun run core:sync).
//
// Ziyaretçi formu tarayıcıdan doğrudan PocketBase'e gönderir (fetch). CSP connect-src 'self' bunu engeller;
// PB adresi siteden siteye (ve verify'da her çalıştırmada) değiştiği için _headers'a elle yazılmaz:
// build bitince PB_URL'nin kökeni dist/_headers içindeki connect-src'ye eklenir. Yalnız site.js FORMS doluysa
// ve PB modunda (CONTENT_SOURCE=fixture değil, PB_URL tanımlı) yapılır; önizlemede form kapalıdır.
// Mağaza (site.js SHOP, docs/shop.md) açıksa da PB kökeni eklenir (sepet, canlı stok, ödeme adımı) ve ödeme formu
// sağlayıcının sayfasına gittiği için form-action'a sağlayıcının kökeni yazılır (ör. Shopier).
// Tarayıcı hata takibi (ErrorTracking.astro) açıksa GlitchTip kökeni de aynı yolla eklenir.
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import type { AstroIntegration } from "astro"
import { GLITCHTIP_DSN } from "../src/lib/monitoring"

const SITE_JS = fileURLToPath(new URL("../../pb/pb_hooks/site.js", import.meta.url))

/** _headers metnindeki her connect-src yönergesine kökeni ekler (zaten varsa dokunmaz). */
export function allowConnect(headers: string, origin: string): string {
  return headers.replace(/connect-src([^;\n]*)/g, (all, sources: string) =>
    sources.split(/\s+/).includes(origin) ? all : `connect-src${sources} ${origin}`)
}

/** _headers metnindeki her form-action yönergesine kökeni ekler (zaten varsa dokunmaz). */
export function allowFormAction(headers: string, origin: string): string {
  return headers.replace(/form-action([^;\n]*)/g, (all, sources: string) =>
    sources.split(/\s+/).includes(origin) ? all : `form-action${sources} ${origin}`)
}

/** Mağaza ödeme sağlayıcılarının ödeme sayfası kökeni (lib/shop-<provider>.js ENDPOINT ile aynı). */
export const PAYMENT_ORIGINS: Record<string, string> = { shopier: "https://www.shopier.com" }

type SiteJs = { FORMS?: string[]; SHOP?: { provider?: string } | null }

/** site.js. Kök package.json "type": "module" olduğundan Node bu CommonJS dosyasını require edemez; metni çalıştırılır. */
function siteJs(): SiteJs {
  const mod: { exports: SiteJs } = { exports: {} }
  new Function("module", "exports", readFileSync(SITE_JS, "utf8"))(mod, mod.exports)
  return mod.exports
}

export default function pbCsp(): AstroIntegration {
  return {
    name: "pb-csp",
    hooks: {
      "astro:build:done": ({ dir, logger }) => {
        const pbUrl = process.env.PB_URL
        if (process.env.CONTENT_SOURCE === "fixture" || !pbUrl) return
        const origins: [string, string][] = []
        const actions: string[] = []
        try {
          const site = siteJs()
          if (site.FORMS?.length) origins.push([new URL(pbUrl).origin, "form gönderimi"])
          if (site.SHOP) {
            origins.push([new URL(pbUrl).origin, "mağaza"])
            const pay = PAYMENT_ORIGINS[site.SHOP.provider ?? "shopier"]
            if (pay) actions.push(pay)
          }
        } catch (err) {
          logger.warn(`${SITE_JS} okunamadı, form/mağaza için CSP değişmedi: ${String(err)}`)
        }
        const dsn = process.env.PUBLIC_GLITCHTIP_DSN ?? GLITCHTIP_DSN
        if (dsn) origins.push([new URL(dsn).origin, "hata takibi"])
        const file = fileURLToPath(new URL("_headers", dir))
        if ((!origins.length && !actions.length) || !existsSync(file)) return
        let headers = readFileSync(file, "utf8")
        for (const [origin, why] of origins) {
          const next = allowConnect(headers, origin)
          if (next !== headers) logger.info(`connect-src: ${origin} (${why})`)
          headers = next
        }
        for (const origin of actions) {
          const next = allowFormAction(headers, origin)
          if (next !== headers) logger.info(`form-action: ${origin} (ödeme sayfası)`)
          headers = next
        }
        writeFileSync(file, headers)
      },
    },
  }
}
