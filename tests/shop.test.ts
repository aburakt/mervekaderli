// ORTAK (core): template'ten gelir, sitede elle değiştirilmez (bun run core:sync).
//
// Mağaza modülü (docs/shop.md, pb_hooks/shop.pb.js, lib/shop.js, lib/shop-shopier.js): şema, ödeme adımı (stok ayırma,
// fiyatın sunucudan alınması, onaylar), Shopier imzası ve dönüşü, süre dolumu, müşteri sipariş sayfası, panel korumaları.
// Sitenin kendi site.js'i SHOP'suz da olsa testler geçici bir kopyada SHOP açık çalışır (scripts/pb-harness.ts site/migrations).
import { Database } from "bun:sqlite"
import { createHmac } from "node:crypto"
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { SITE_ID, startPb, type Pb } from "../scripts/pb-harness"
import { htmlPart, startSmtpSink } from "../scripts/smtp-sink"

const ROOT = join(import.meta.dir, "..")
const site = require(join(ROOT, "pb", "pb_hooks", "site.js")) as { CONTENT: string[]; FORMS?: string[]; RULES: Record<string, { locked?: string[] }>; SHOP?: unknown }
const MIGRATION = "pb/shop/1792200000_shop.js"
const KEY = "test-api-key"
const SECRET = "test-api-secret"
const SHOP = { shipping: { price: 100, freeOver: 1000 }, rateLimit: { max: 1000, minutes: 1 } }
const OVERRIDE = {
  CONTENT: [...site.CONTENT.filter((c) => c !== "products"), "products"],
  RULES: { ...site.RULES, products: { slugFrom: "title", locked: ["slug"] } },
  BRAND: { name: "Test Mağaza", color: "#8a4b2a", ink: "#2a211c", paper: "#f7f1e8", url: "https://magaza.test", logo: "", icon: "" },
  SHOP,
}

type Field = { name: string; type: string; help?: string; presentable?: boolean; hidden?: boolean; system?: boolean }
type Collection = { name: string; fields: Field[]; listRule: string | null; viewRule: string | null; createRule: string | null; updateRule: string | null; deleteRule: string | null }
type Product = { id: string; stock: number; slug: string }
type Order = { id: string; number: string; status: string; total: number; subtotal: number; shipping: number; payment_id: string; notes: string; token?: string }
type Checkout = { number: string; token: string; total: number; payment: { action: string; method: string; fields: Record<string, string | number> } }

const smtp = startSmtpSink()
let pb: Pb
let off: Pb
let nokeys: Pb

const b64 = (data: string) => createHmac("sha256", SECRET).update(data).digest("base64")

async function product(p: Pb, body: Record<string, unknown>): Promise<Product> {
  const res = await p.admin("/api/collections/products/records", {
    method: "POST",
    body: JSON.stringify({ kind: "product", price: 250, stock: 5, published: true, ...body }),
  })
  if (!res.ok) throw new Error(`ürün açılamadı: ${res.status} ${await res.text()}`)
  return (await res.json()) as Product
}

const getProduct = async (id: string, p = pb) => (await (await p.admin(`/api/collections/products/records/${id}`)).json()) as Product
const getOrder = async (number: string, p = pb) =>
  ((await (await p.admin(`/api/collections/orders/records?filter=${encodeURIComponent(`number="${number}"`)}`)).json()) as { items: Order[] }).items[0]!

const BUYER = { name: "Ayşe Yılmaz", email: "ayse@example.com", phone: "0530 000 00 00", address: "Örnek Mah. Deneme Sok. No: 1 D: 2", city: "Çankaya / Ankara", postcode: "06000" }

function order(p: Pb, items: { id: string; qty: number; price?: number }[], extra: Record<string, unknown> = {}) {
  return p.api(`/api/${SITE_ID}/shop/checkout`, {
    method: "POST",
    body: JSON.stringify({ items, buyer: BUYER, kvkk_consent: true, contract_consent: true, ...extra }),
  })
}

function callback(fields: Record<string, string>) {
  return pb.api(`/api/${SITE_ID}/shop/callback/shopier`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  })
}

function signedCallback(number: string, status: "success" | "failed", paymentId = "987654") {
  const random = String(100000 + Math.floor(Math.random() * 899999))
  return callback({ platform_order_id: number, status, payment_id: paymentId, installment: "0", random_nr: random, signature: b64(`${random}${number}`) })
}

function backdate(p: Pb, number: string) {
  const db = new Database(join(p.dir, "pb_data", "data.db"))
  db.exec("PRAGMA busy_timeout = 5000")
  db.query(`UPDATE orders SET reserved_until = ? WHERE number = ?`).run("2000-01-01 00:00:00.000Z", number)
  db.close()
}

beforeAll(async () => {
  ;[pb, off, nokeys] = await Promise.all([
    startPb({ SHOPIER_API_KEY: KEY, SHOPIER_API_SECRET: SECRET, SHOP_NOTIFY_TO: "merve@magaza.test" }, { site: OVERRIDE, migrations: [MIGRATION] }),
    startPb({}, { site: { SHOP: null } }),
    startPb({}, { site: { ...OVERRIDE, SHOP: { rateLimit: { max: 2, minutes: 10 } } }, migrations: [MIGRATION] }),
  ])
}, 300_000)
afterAll(async () => {
  await Promise.all([pb?.stop(), off?.stop(), nokeys?.stop()])
  smtp.stop()
})

describe.skipIf(!site.SHOP)("bu sitenin mağaza kurulumu (site.js SHOP)", () => {
  test("şema pb_migrations'ta, ürünler CONTENT'te (yayın tetikler), siparişler CONTENT/FORMS dışında, ürün adresi kilitli", () => {
    expect(existsSync(join(ROOT, "pb", "pb_migrations", MIGRATION.split("/").pop()!))).toBe(true)
    expect(site.CONTENT).toContain("products")
    expect(site.CONTENT).not.toContain("orders")
    expect(site.FORMS ?? []).not.toContain("orders")
    expect(site.RULES.products?.locked).toContain("slug")
  })
})

describe("mağaza şeması", () => {
  test("her alanda Türkçe yardım, her koleksiyonda presentable alan, beş kural açık", async () => {
    for (const name of ["products", "orders"]) {
      const c = (await (await pb.admin(`/api/collections/${name}`)).json()) as Collection
      const missing = c.fields.filter((f) => !f.system && f.type !== "autodate" && !f.help).map((f) => f.name)
      expect(missing).toEqual([])
      expect(c.fields.some((f) => f.presentable)).toBe(true)
      expect(c.createRule).toBeNull()
      expect(c.updateRule).toBeNull()
      expect(c.deleteRule).toBeNull()
    }
    const products = (await (await pb.admin("/api/collections/products")).json()) as Collection
    expect(products.listRule).toBe("published = true")
    const orders = (await (await pb.admin("/api/collections/orders")).json()) as Collection
    expect(orders.listRule).toBeNull()
    expect(orders.fields.find((f) => f.name === "token")?.hidden).toBe(true)
  })

  test("her koleksiyonun ve alanın Türkçe panel etiketi core-labels.json'da", async () => {
    const labels = (await Bun.file(join(ROOT, "pb", "pb_hooks", "panel", "core-labels.json")).json()) as { collections: Record<string, string>; fields: Record<string, string> }
    const missing: string[] = []
    for (const name of ["products", "orders"]) {
      if (!labels.collections[name]) missing.push(name)
      const c = (await (await pb.admin(`/api/collections/${name}`)).json()) as Collection
      for (const f of c.fields.filter((x) => !x.system && x.type !== "autodate")) if (!labels.fields[`${name}.${f.name}`]) missing.push(`${name}.${f.name}`)
    }
    expect(missing).toEqual([])
  })

  test("ziyaretçi siparişleri okuyamaz, taslak ürünü göremez", async () => {
    const draft = await product(pb, { title: "Taslak vazo", published: false })
    expect((await pb.api("/api/collections/orders/records")).status).toBe(403)
    expect((await pb.api(`/api/collections/products/records/${draft.id}`)).status).toBe(404)
  })

  test("SHOP kapalı sitede mağaza adresleri yoktur", async () => {
    expect((await off.api(`/api/${SITE_ID}/shop/checkout`, { method: "POST", body: "{}" })).status).toBe(404)
  })
})

describe("ödeme adımı", () => {
  test("sipariş açılır, ürün ayrılır, Shopier formu imzalı döner; fiyat sunucudan alınır", async () => {
    const p = await product(pb, { title: "Aurora abajur", price: 1249.9, stock: 2 })
    expect(p.slug).toBe("aurora-abajur")
    const res = await order(pb, [{ id: p.id, qty: 1, price: 1 }])
    expect(res.status).toBe(200)
    const body = (await res.json()) as Checkout
    expect(body.total).toBe(1249.9) // 1000 TL üstü: kargo ücretsiz
    expect((await getProduct(p.id)).stock).toBe(1)

    const f = body.payment.fields
    expect(body.payment.action).toBe("https://www.shopier.com/ShowProduct/api_pay4.php")
    expect(f.API_key).toBe(KEY)
    expect(f.platform_order_id).toBe(body.number)
    expect(f.total_order_value).toBe("1249.90")
    expect(f.product_type).toBe(0)
    expect(f.buyer_name).toBe("Ayşe")
    expect(f.buyer_surname).toBe("Yılmaz")
    expect(f.signature).toBe(b64(`${f.random_nr}${body.number}${f.total_order_value}${f.currency}`))

    const o = await getOrder(body.number)
    expect(o.status).toBe("pending")
    expect(o.shipping).toBe(0)
  }, 30_000)

  test("kargo: eşik altında sabit ücret eklenir", async () => {
    const p = await product(pb, { title: "Küçük kase", price: 300 })
    const body = (await (await order(pb, [{ id: p.id, qty: 2 }])).json()) as Checkout
    expect(body.total).toBe(700)
  })

  test("atölye: adres istemez, kargo almaz; tarihi geçmiş atölye satılmaz", async () => {
    const w = await product(pb, { title: "Çark atölyesi", kind: "workshop", price: 1500, stock: 8, event_date: "2099-01-01 10:00:00.000Z" })
    const res = await order(pb, [{ id: w.id, qty: 2 }], { buyer: { ...BUYER, address: "", city: "" } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Checkout
    expect(body.total).toBe(3000)
    expect(body.payment.fields.product_type).toBe(1)
    const old = await product(pb, { title: "Geçmiş atölye", kind: "workshop", event_date: "2020-01-01 10:00:00.000Z" })
    const late = await order(pb, [{ id: old.id, qty: 1 }])
    expect(late.status).toBe(400)
    expect(((await late.json()) as { message: string }).message).toContain("tarihi geçti")
  })

  test("stok yetmezse, ürün taslaksa ya da onay yoksa sipariş açılmaz ve stok değişmez", async () => {
    const p = await product(pb, { title: "Tek parça vazo", stock: 1 })
    const draft = await product(pb, { title: "Gizli tabak", published: false })
    const cases = [
      [await order(pb, [{ id: p.id, qty: 2 }]), "yalnız 1 adet"],
      [await order(pb, [{ id: draft.id, qty: 1 }]), "satışta değil"],
      [await order(pb, [{ id: p.id, qty: 1 }], { contract_consent: false }), "mesafeli satış"],
      [await order(pb, [{ id: p.id, qty: 1 }], { kvkk_consent: undefined }), "KVKK"],
      [await order(pb, [{ id: p.id, qty: 1 }], { buyer: { ...BUYER, address: "" } }), "teslimat adresini"],
      [await order(pb, []), "Sepetiniz boş"],
    ] as const
    for (const [res, msg] of cases) {
      expect(res.status).toBe(400)
      expect(((await res.json()) as { message: string }).message).toContain(msg)
    }
    expect((await getProduct(p.id)).stock).toBe(1)
  })

  test("son ürüne aynı anda gelen siparişlerden yalnız biri geçer", async () => {
    const p = await product(pb, { title: "Son abajur", stock: 1 })
    const results = await Promise.all(Array.from({ length: 6 }, () => order(pb, [{ id: p.id, qty: 1 }])))
    expect(results.filter((r) => r.status === 200).length).toBe(1)
    expect((await getProduct(p.id)).stock).toBe(0)
  }, 30_000)

  test("ödeme anahtarı yoksa sipariş failed olur, ürün hemen stoğa döner; hız sınırı 429", async () => {
    const p = await product(nokeys, { title: "Anahtarsız", stock: 3 })
    const res = await order(nokeys, [{ id: p.id, qty: 1 }])
    expect(res.status).toBe(400)
    expect(((await res.json()) as { message: string }).message).toContain("başlatılamıyor")
    expect((await getProduct(p.id, nokeys)).stock).toBe(3)
    await order(nokeys, [{ id: p.id, qty: 1 }])
    expect((await order(nokeys, [{ id: p.id, qty: 1 }])).status).toBe(429)
  })
})

describe("Shopier dönüşü", () => {
  test("başarılı ödeme: sipariş paid, müşteri sipariş sayfasına döner; ikinci dönüş bir şey değiştirmez", async () => {
    const p = await product(pb, { title: "Ödenen kase", stock: 3 })
    const c = (await (await order(pb, [{ id: p.id, qty: 1 }])).json()) as Checkout
    const res = await signedCallback(c.number, "success", "111")
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toBe(`https://magaza.test/siparis/?no=${c.number}&t=${c.token}`)
    let o = await getOrder(c.number)
    expect(o.status).toBe("paid")
    expect(o.payment_id).toBe("111")
    await signedCallback(c.number, "success", "222")
    o = await getOrder(c.number)
    expect(o.payment_id).toBe("111")
    expect((await getProduct(p.id)).stock).toBe(2)
  })

  test("imzası tutmayan dönüş yok sayılır", async () => {
    const p = await product(pb, { title: "Sahte dönüş", stock: 3 })
    const c = (await (await order(pb, [{ id: p.id, qty: 1 }])).json()) as Checkout
    const res = await callback({ platform_order_id: c.number, status: "success", payment_id: "1", installment: "0", random_nr: "123456", signature: "AAAA" })
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toBe("https://magaza.test/siparis/")
    expect((await getOrder(c.number)).status).toBe("pending")
  })

  test("başarısız ödeme: sipariş failed, ürün stoğa döner", async () => {
    const p = await product(pb, { title: "Başarısız", stock: 3 })
    const c = (await (await order(pb, [{ id: p.id, qty: 2 }])).json()) as Checkout
    expect((await getProduct(p.id)).stock).toBe(1)
    await signedCallback(c.number, "failed")
    expect((await getOrder(c.number)).status).toBe("failed")
    expect((await getProduct(p.id)).stock).toBe(3)
  })

  test("süre dolunca expired, ürün stoğa döner; geç gelen ödeme siparişi yeniden ayırır", async () => {
    const p = await product(pb, { title: "Geç ödeme", stock: 1 })
    const c = (await (await order(pb, [{ id: p.id, qty: 1 }])).json()) as Checkout
    backdate(pb, c.number)
    expect((await pb.admin(`/api/crons/${SITE_ID}_shop_expire`, { method: "POST" })).status).toBe(204)
    // cron arka planda çalışır: durumun değişmesini bekle
    let status = "pending"
    for (let i = 0; i < 20 && status === "pending"; i++) {
      await Bun.sleep(250)
      status = (await getOrder(c.number)).status
    }
    expect(status).toBe("expired")
    expect((await getProduct(p.id)).stock).toBe(1)
    await signedCallback(c.number, "success")
    expect((await getOrder(c.number)).status).toBe("paid")
    expect((await getProduct(p.id)).stock).toBe(0)
  })

  test("müşteri sipariş sayfası yalnız doğru anahtarla açılır", async () => {
    const p = await product(pb, { title: "Durum", stock: 3 })
    const c = (await (await order(pb, [{ id: p.id, qty: 1 }])).json()) as Checkout
    expect((await pb.api(`/api/${SITE_ID}/shop/order?no=${c.number}&t=yanlis`)).status).toBe(404)
    const res = await pb.api(`/api/${SITE_ID}/shop/order?no=${c.number}&t=${c.token}`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string; items: { title: string }[]; token?: string }
    expect(body.status).toBe("pending")
    expect(body.items[0]!.title).toBe("Durum")
    expect(body.token).toBeUndefined()
  })
})

describe("bildirim", () => {
  test("ödeme gelince satıcıya ve müşteriye markalı e-posta gider", async () => {
    const settings = { meta: { appURL: "https://cms.magaza.test", senderAddress: "noreply@magaza.test" }, smtp: { enabled: true, host: "127.0.0.1", port: smtp.port, tls: false } }
    expect((await pb.admin("/api/settings", { method: "PATCH", body: JSON.stringify(settings) })).status).toBe(200)
    const p = await product(pb, { title: "Mavi <b>kupa</b>", price: 1234.5, stock: 2 })
    const c = (await (await order(pb, [{ id: p.id, qty: 1 }])).json()) as Checkout
    const before = smtp.messages.length
    await signedCallback(c.number, "success")
    for (let i = 0; i < 40 && smtp.messages.length < before + 2; i++) await Bun.sleep(250)
    const mails = smtp.messages.slice(before)
    expect(mails.length).toBe(2)
    const merchant = mails.find((m) => m.includes("merve@magaza.test") && m.includes("Yeni sipari"))!
    const html = htmlPart(merchant)
    expect(html).toContain("Mavi &lt;b&gt;kupa&lt;/b&gt;")
    expect(html).toContain("1.234,50 TL")
    expect(html).toContain("https://cms.magaza.test/_/#/collections?collection=orders")
    const customer = htmlPart(mails.find((m) => m !== merchant)!)
    expect(customer).toContain(`https://magaza.test/siparis/?no=${c.number}&amp;t=${c.token}`)
  }, 30_000)
})

describe("panel korumaları", () => {
  test("sipariş panelden açılamaz, tutarı değiştirilemez, ödenmiş sipariş silinemez", async () => {
    expect((await pb.admin("/api/collections/orders/records", { method: "POST", body: JSON.stringify({ number: "X", status: "paid", buyer_name: "a b", email: "a@b.co", phone: "1" }) })).status).toBe(400)
    const p = await product(pb, { title: "Kilitli", stock: 3 })
    const c = (await (await order(pb, [{ id: p.id, qty: 1 }])).json()) as Checkout
    await signedCallback(c.number, "success")
    const o = await getOrder(c.number)
    expect((await pb.admin(`/api/collections/orders/records/${o.id}`, { method: "PATCH", body: JSON.stringify({ total: 1 }) })).status).toBe(400)
    expect((await pb.admin(`/api/collections/orders/records/${o.id}`, { method: "DELETE" })).status).toBe(400)
    // personel notu ve kargoya verme serbest
    const ship = await pb.admin(`/api/collections/orders/records/${o.id}`, { method: "PATCH", body: JSON.stringify({ status: "shipped", notes: "Kargo: 123" }) })
    expect(ship.status).toBe(200)
  })

  test("iptal ürünü stoğa döndürür, yeniden onay stoktan düşer; stok yetmezse onaylanmaz", async () => {
    const p = await product(pb, { title: "İptal edilen", stock: 2 })
    const c = (await (await order(pb, [{ id: p.id, qty: 1 }])).json()) as Checkout
    await signedCallback(c.number, "success")
    const o = await getOrder(c.number)
    const patch = (status: string) => pb.admin(`/api/collections/orders/records/${o.id}`, { method: "PATCH", body: JSON.stringify({ status }) })
    expect((await patch("cancelled")).status).toBe(200)
    expect((await getProduct(p.id)).stock).toBe(2)
    expect((await patch("paid")).status).toBe(200)
    expect((await getProduct(p.id)).stock).toBe(1)
    expect((await patch("refunded")).status).toBe(200)
    await pb.admin(`/api/collections/products/records/${p.id}`, { method: "PATCH", body: JSON.stringify({ stock: 0 }) })
    const res = await patch("paid")
    expect(res.status).toBe(400)
    expect(((await res.json()) as { message: string }).message).toContain("Stok yetersiz")
    expect((await getOrder(c.number)).status).toBe("refunded")
    expect((await getProduct(p.id)).stock).toBe(0)
  })
})
