// ORTAK (core): template'ten gelir, sitede elle değiştirilmez (bun run core:sync).
//
// Mağaza modülünün iyzico sağlayıcısı (pb_hooks/lib/shop-iyzico.js) ve ürün seçeneği (site.js SHOP.option, ör. beden).
// iyzico yerine sahte bir sunucu çalışır (IYZICO_BASE_URL): IYZWSv2 imzasını iyzico'nun formülüyle doğrular,
// CF-Initialize ve CF-Retrieve yanıtlarını iyzico gibi imzalar.
import { createHmac } from "node:crypto"
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { SITE_ID, startPb, type Pb } from "../scripts/pb-harness"

const site = require("../pb/pb_hooks/site.js") as { CONTENT: string[]; RULES: Record<string, unknown> }
const iyz = require("../pb/pb_hooks/lib/shop-iyzico.js") as { trimZeros(v: unknown): string; pageForm(u: string): { action: string; method: string; fields: Record<string, string> } }
const MIGRATION = "pb/shop/1792200000_shop.js"
const KEY = "sandbox-test-key"
const SECRET = "sandbox-test-secret"
const CALLBACK = "https://cms.magaza.test/api/x/shop/callback/iyzico"

type Product = { id: string; stock: number }
type Order = { number: string; status: string; total: number; payment_id: string; installment: number; items: { option?: string; optionLabel?: string; qty: number }[] }
type Checkout = { number: string; token: string; total: number; payment: { action: string; method: string; fields: Record<string, string> } }
type Init = { conversationId: string; basketId: string; price: string; paidPrice: string; callbackUrl: string; enabledInstallments?: number[]; buyer: Record<string, string>; shippingAddress?: Record<string, string>; basketItems: { name: string; price: string; itemType: string }[] }

const hex = (data: string) => createHmac("sha256", SECRET).update(data).digest("hex")

// --- sahte iyzico ---
const sessions = new Map<string, Init>()
// token → sonuç: SUCCESS, FAILURE, fraud (-1), badsig (imza bozuk), error (basketId'siz hata)
const outcome = new Map<string, string>()
let lastInit: Init | null = null
let authFailures = 0

const iyzico = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(req) {
    const path = new URL(req.url).pathname
    const body = await req.text()
    const rnd = req.headers.get("x-iyzi-rnd") ?? ""
    const expected = `IYZWSv2 ${Buffer.from(`apiKey:${KEY}&randomKey:${rnd}&signature:${hex(`${rnd}${path}${body}`)}`).toString("base64")}`
    if (req.headers.get("authorization") !== expected) {
      authFailures++
      return Response.json({ status: "failure", errorCode: "1000", errorMessage: "Geçersiz imza" })
    }
    const json = JSON.parse(body) as Init & { token?: string }
    if (path === "/payment/iyzipos/checkoutform/initialize/auth/ecom") {
      lastInit = json
      const token = `tok${crypto.randomUUID().replace(/-/g, "")}`
      sessions.set(token, json)
      return Response.json({
        status: "success", locale: "tr", conversationId: json.conversationId, token, tokenExpireTime: 1800,
        paymentPageUrl: `https://sandbox-cpp.iyzipay.com?token=${token}&lang=tr`,
        signature: hex(`${json.conversationId}:${token}`),
      })
    }
    if (path === "/payment/iyzipos/checkoutform/auth/ecom/detail") {
      const token = String(json.token)
      const s = sessions.get(token)
      const kind = outcome.get(token) ?? "SUCCESS"
      if (!s || kind === "error") return Response.json({ status: "failure", errorCode: "5115", errorMessage: "Token bulunamadı" })
      // iyzico fiyatları sayı olarak döndürür; imzada sondaki sıfırlar atılır
      const price = Number(s.price)
      const res = {
        status: "success", locale: "tr", conversationId: s.conversationId, basketId: s.basketId, currency: "TRY", token,
        price, paidPrice: price, installment: 3, paymentId: "24580000",
        paymentStatus: kind === "FAILURE" ? "FAILURE" : "SUCCESS", fraudStatus: kind === "fraud" ? -1 : 1,
      }
      const data = [res.paymentStatus, res.paymentId, res.currency, res.basketId, res.conversationId, iyz.trimZeros(price), iyz.trimZeros(price), token].join(":")
      return Response.json({ ...res, signature: kind === "badsig" ? hex("başka") : hex(data) })
    }
    return new Response("not found", { status: 404 })
  },
})

let pb: Pb

beforeAll(async () => {
  pb = await startPb(
    { IYZICO_API_KEY: KEY, IYZICO_SECRET_KEY: SECRET, IYZICO_BASE_URL: `http://127.0.0.1:${iyzico.port}`, IYZICO_CALLBACK_URL: CALLBACK },
    {
      site: {
        CONTENT: [...site.CONTENT.filter((c) => c !== "products"), "products"],
        RULES: { ...site.RULES, products: { slugFrom: "title", locked: ["slug"] } },
        BRAND: { name: "Test Butik", color: "#6e5240", ink: "#1d1a17", paper: "#eee9e1", url: "https://magaza.test", logo: "", icon: "" },
        SHOP: { provider: "iyzico", shipping: { price: 150, freeOver: 5000 }, option: { field: "sizes", label: "Beden" }, iyzico: { installments: [1, 2, 3, 6] }, rateLimit: { max: 1000, minutes: 1 } },
      },
      migrations: [MIGRATION],
    },
  )
  // seçenek alanı sitenin kendi migration'ında olur; testte ürünlere eklenir
  const col = (await (await pb.admin("/api/collections/products")).json()) as { fields: unknown[] }
  const res = await pb.admin("/api/collections/products", {
    method: "PATCH",
    body: JSON.stringify({ fields: [...col.fields, { name: "sizes", type: "select", maxSelect: 4, values: ["34", "36", "38", "40"], help: "Bedenler." }] }),
  })
  if (!res.ok) throw new Error(`sizes alanı eklenemedi: ${await res.text()}`)
}, 300_000)
afterAll(async () => {
  await pb?.stop()
  iyzico.stop(true)
})

async function product(body: Record<string, unknown>): Promise<Product> {
  const res = await pb.admin("/api/collections/products/records", {
    method: "POST",
    body: JSON.stringify({ kind: "product", price: 4250, stock: 5, published: true, ...body }),
  })
  if (!res.ok) throw new Error(`ürün açılamadı: ${res.status} ${await res.text()}`)
  return (await res.json()) as Product
}

const getOrder = async (number: string) =>
  ((await (await pb.admin(`/api/collections/orders/records?filter=${encodeURIComponent(`number="${number}"`)}`)).json()) as { items: Order[] }).items[0]!
const getProduct = async (id: string) => (await (await pb.admin(`/api/collections/products/records/${id}`)).json()) as Product

const BUYER = { name: "Elif Su Kaya", email: "elif@example.com", phone: "0532 111 22 33", address: "Meşrutiyet Mah. Örnek Sk. No: 3 D: 4", city: "Şişli / İstanbul", postcode: "34363" }

function order(items: Record<string, unknown>[]) {
  return pb.api(`/api/${SITE_ID}/shop/checkout`, {
    method: "POST",
    body: JSON.stringify({ items, buyer: BUYER, kvkk_consent: true, contract_consent: true }),
  })
}

async function paid(items: Record<string, unknown>[]): Promise<Checkout> {
  const res = await order(items)
  if (!res.ok) throw new Error(`sipariş açılamadı: ${await res.text()}`)
  return (await res.json()) as Checkout
}

function callback(token: string) {
  return pb.api(`/api/${SITE_ID}/shop/callback/iyzico`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }).toString(),
  })
}

describe("iyzico yardımcıları", () => {
  test("yanıt imzasında fiyatın sondaki sıfırları atılır", () => {
    expect(["10", "10.0", "10.5", "10.50", "10.510", "50.00", 1249.9].map(iyz.trimZeros)).toEqual(["10", "10", "10.5", "10.5", "10.51", "50", "1249.9"])
  })

  test("ödeme sayfası adresi GET formuna çevrilir (sorgu alanlara geçer)", () => {
    expect(iyz.pageForm("https://cpp.iyzipay.com?token=abc&lang=tr")).toEqual({ action: "https://cpp.iyzipay.com", method: "GET", fields: { token: "abc", lang: "tr" } })
  })
})

describe("iyzico ödeme adımı", () => {
  test("CF-Initialize imzalı gider: sepet, kargo, alıcı ve dönüş adresi; tarayıcıya iyzico sayfası döner", async () => {
    const p = await product({ title: "Aura Mocha korse", sizes: ["36", "38"], stock: 3 })
    const c = await paid([{ id: p.id, qty: 1, option: "38" }])
    expect(authFailures).toBe(0)
    expect(c.payment).toEqual({ action: "https://sandbox-cpp.iyzipay.com", method: "GET", fields: { token: expect.stringMatching(/^tok/), lang: "tr" } })
    const init = lastInit!
    expect(init.conversationId).toBe(c.number)
    expect(init.basketId).toBe(c.number)
    expect(init.callbackUrl).toBe(CALLBACK)
    expect(init.enabledInstallments).toEqual([1, 2, 3, 6])
    // 5000 TL altı: 150 TL kargo ayrı satır; satırların toplamı price
    expect(init.basketItems.map((b) => [b.name, b.price, b.itemType])).toEqual([
      ["Aura Mocha korse (Beden: 38)", "4250.00", "PHYSICAL"],
      ["Kargo", "150.00", "PHYSICAL"],
    ])
    expect(init.price).toBe("4400.00")
    expect(init.paidPrice).toBe("4400.00")
    expect(c.total).toBe(4400)
    expect(init.buyer.name).toBe("Elif Su")
    expect(init.buyer.surname).toBe("Kaya")
    expect(init.buyer.gsmNumber).toBe("+905321112233")
    expect(init.buyer.city).toBe("İstanbul")
    expect(init.shippingAddress?.contactName).toBe("Elif Su Kaya")
    expect((await getOrder(c.number)).items[0]).toMatchObject({ option: "38", optionLabel: "Beden", qty: 1 })
  }, 30_000)

  test("beden: seçeneği olan ürün bedensiz ya da listede olmayan bedenle satılmaz; bedenler ayrı kalem, stok ürün başına", async () => {
    const p = await product({ title: "Nova korse", sizes: ["34", "36"], stock: 3 })
    expect((await (await order([{ id: p.id, qty: 1 }])).json() as { message: string }).message).toBe("Nova korse için Beden seçin.")
    expect((await (await order([{ id: p.id, qty: 1, option: "44" }])).json() as { message: string }).message).toBe("Nova korse: Beden 44 bulunmuyor.")
    expect((await order([{ id: p.id, qty: 2, option: "34" }, { id: p.id, qty: 2, option: "36" }])).status).toBe(400)
    expect((await getProduct(p.id)).stock).toBe(3)
    const c = await paid([{ id: p.id, qty: 1, option: "34" }, { id: p.id, qty: 2, option: "36" }])
    expect((await getOrder(c.number)).items.map((l) => [l.option, l.qty])).toEqual([["34", 1], ["36", 2]])
    expect((await getProduct(p.id)).stock).toBe(0)
    // seçeneği olmayan üründe seçenek gönderilemez
    const plain = await product({ title: "Etek", stock: 1 })
    expect((await order([{ id: plain.id, qty: 1, option: "38" }])).status).toBe(400)
  }, 30_000)
})

describe("iyzico dönüşü", () => {
  test("başarılı ödeme: sonuç iyzico'dan sorulur, sipariş paid, taksit yazılır; ikinci dönüş bir şey değiştirmez", async () => {
    const p = await product({ title: "Vela body", stock: 2 })
    const c = await paid([{ id: p.id, qty: 1 }])
    const res = await callback(c.payment.fields.token!)
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toBe(`https://magaza.test/siparis/?no=${c.number}&t=${c.token}`)
    let o = await getOrder(c.number)
    expect(o.status).toBe("paid")
    expect(o.payment_id).toBe("24580000")
    expect(o.installment).toBe(3)
    await callback(c.payment.fields.token!)
    o = await getOrder(c.number)
    expect(o.status).toBe("paid")
    expect((await getProduct(p.id)).stock).toBe(1)
  }, 30_000)

  test("başarısız ya da dolandırıcılık şüphesiyle reddedilen ödeme: sipariş failed, ürün stoğa döner", async () => {
    for (const kind of ["FAILURE", "fraud"]) {
      const p = await product({ title: `Red ${kind}`, stock: 2 })
      const c = await paid([{ id: p.id, qty: 2 }])
      outcome.set(c.payment.fields.token!, kind)
      await callback(c.payment.fields.token!)
      expect((await getOrder(c.number)).status).toBe("failed")
      expect((await getProduct(p.id)).stock).toBe(2)
    }
  }, 30_000)

  test("imzası tutmayan sonuç, bilinmeyen token ya da bozuk token yok sayılır", async () => {
    const p = await product({ title: "Sahte dönüş", stock: 2 })
    const c = await paid([{ id: p.id, qty: 1 }])
    outcome.set(c.payment.fields.token!, "badsig")
    for (const token of [c.payment.fields.token!, "tokbilinmeyen0000", "<script>"]) {
      const res = await callback(token)
      expect(res.status).toBe(303)
      expect(res.headers.get("location")).toBe("https://magaza.test/siparis/")
    }
    expect((await getOrder(c.number)).status).toBe("pending")
  }, 30_000)
})
