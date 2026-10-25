// ORTAK (core): template'ten gelir, sitede elle değiştirilmez (bun run core:sync).
//
// Mağaza ayarları build'de (docs/shop.md): site.js SHOP okunur, sayfaya mağaza adresleri data-* olarak yazılır.
// Tarayıcı tarafı lib/shop.ts shopApi() bu öznitelikleri okur. Önizlemede (CONTENT_SOURCE=fixture) PB yok:
// shopAttrs() boş döner, sepet görünür ama ödeme kapalıdır (shopEnabled() false).
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { isFixtureMode, pbUrl } from "./pb"

export type ShopSettings = {
  provider: string
  reserveMinutes: number
  shipping: { price: number; freeOver: number }
  returnPath: string
}

type SiteJs = { ID: string; SHOP?: Partial<ShopSettings> | null }

const SITE_JS = fileURLToPath(new URL("../../../pb/pb_hooks/site.js", import.meta.url))
// pb/pb_hooks/lib/shop.js DEFAULTS ile aynı
const DEFAULTS: ShopSettings = { provider: "shopier", reserveMinutes: 30, shipping: { price: 0, freeOver: 0 }, returnPath: "/siparis/" }

function siteJs(): SiteJs {
  const mod: { exports: SiteJs } = { exports: { ID: "" } }
  new Function("module", "exports", readFileSync(SITE_JS, "utf8"))(mod, mod.exports)
  return mod.exports
}

/** site.js SHOP (varsayılanlarla) ya da mağaza yoksa null. */
export function shopSettings(): ShopSettings | null {
  const shop = siteJs().SHOP
  if (!shop) return null
  return { ...DEFAULTS, ...shop, shipping: { ...DEFAULTS.shipping, ...shop.shipping } }
}

/** Ödeme açık mı: mağaza var ve build PB'ye bağlı (önizleme değil). */
export const shopEnabled = (): boolean => !!shopSettings() && !isFixtureMode()

/** Sepet/ödeme betiğinin okuyacağı öznitelikler (<body {...shopAttrs()}>). */
export function shopAttrs(): Record<string, string> {
  if (!shopEnabled()) return {}
  return { "data-shop-pb": pbUrl(), "data-shop-id": siteJs().ID }
}
