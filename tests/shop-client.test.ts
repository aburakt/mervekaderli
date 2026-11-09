// ORTAK (core): template'ten gelir, sitede elle değiştirilmez (bun run core:sync).
// Mağaza istemcisi (site/src/lib/shop.ts) sepet hesabı ve CSP eklemeleri (site/integrations/pb-csp.ts).
import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { allowFormAction, PAYMENT_ORIGINS } from "../site/integrations/pb-csp"

const store = new Map<string, string>()
const events: string[] = []
Object.assign(globalThis, {
  window: {
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    dispatchEvent: (e: Event) => { events.push(e.type); return true },
    addEventListener() {},
    removeEventListener() {},
  },
})
const shop = await import("../site/src/lib/shop")
// diğer test dosyaları aynı süreçte çalışır: sahte tarayıcı nesneleri bırakılmaz
afterAll(() => {
  delete (globalThis as { window?: unknown }).window
})

describe("sepet", () => {
  beforeEach(() => shop.clearCart())

  test("ekleme adetleri birleştirir, stok sınırını aşmaz, değişiklik olayı yayar", () => {
    const vase = { id: "abc123def456ghi", title: "Vazo", price: 1249.9, kind: "product" as const, max: 2 }
    shop.addToCart(vase)
    expect(shop.addToCart(vase, 5)).toBe(2)
    expect(shop.cartCount()).toBe(2)
    expect(events.at(-1)).toBe(shop.CART_EVENT)
  })

  test("ara toplam kuruşla hesaplanır, atölye kargo istemez, 0 adet sepetten çıkarır", () => {
    shop.addToCart({ id: "a".repeat(15), title: "Kase", price: 0.1, kind: "product" }, 3)
    shop.addToCart({ id: "b".repeat(15), title: "Atölye", price: 1500, kind: "workshop" })
    expect(shop.cartSubtotal()).toBe(1500.3)
    expect(shop.needsShipping()).toBe(true)
    shop.setQty("a".repeat(15), 0)
    expect(shop.readCart().map((l) => l.id)).toEqual(["b".repeat(15)])
    expect(shop.needsShipping()).toBe(false)
  })

  test("seçenek (beden): aynı ürünün bedenleri ayrı satır, stok sınırı ürün başına, siparişe seçenek gider", () => {
    const korse = { id: "k".repeat(15), title: "Korse", price: 4250, kind: "product" as const, max: 3, optionLabel: "Beden" }
    shop.addToCart({ ...korse, option: "36" }, 2)
    expect(shop.addToCart({ ...korse, option: "38" }, 5)).toBe(1)
    expect(shop.readCart().map(shop.lineKey)).toEqual([`${korse.id}|36`, `${korse.id}|38`])
    expect(shop.lineName(shop.readCart()[1]!)).toBe("Korse (Beden: 38)")
    shop.removeFromCart(`${korse.id}|36`)
    expect(shop.readCart().map((l) => l.option)).toEqual(["38"])
  })

  test("TL biçimi Türkçe", () => {
    expect(shop.formatTL(1249.9).replace(/\s/g, "")).toBe("₺1.249,90")
  })
})

describe("CSP", () => {
  test("ödeme sağlayıcısı form-action'a eklenir, iki kez eklenmez", () => {
    const once = allowFormAction("form-action 'self'", PAYMENT_ORIGINS.shopier![0]!)
    expect(once).toBe("form-action 'self' https://www.shopier.com")
    expect(allowFormAction(once, PAYMENT_ORIGINS.shopier![0]!)).toBe(once)
    const iyzico = PAYMENT_ORIGINS.iyzico!.reduce(allowFormAction, "form-action 'self'")
    expect(iyzico).toBe("form-action 'self' https://cpp.iyzipay.com https://sandbox-cpp.iyzipay.com")
  })

  test("CSP ödeme kökenleri sağlayıcı dosyalarıyla aynı", async () => {
    const { readFileSync } = await import("node:fs")
    const iyzico = readFileSync(new URL("../pb/pb_hooks/lib/shop-iyzico.js", import.meta.url), "utf8")
    for (const o of PAYMENT_ORIGINS.iyzico!) expect(iyzico).toContain(`"${o}"`)
    const shopier = readFileSync(new URL("../pb/pb_hooks/lib/shop-shopier.js", import.meta.url), "utf8")
    expect(shopier).toContain(PAYMENT_ORIGINS.shopier![0]!)
  })
})
