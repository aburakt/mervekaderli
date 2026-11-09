/// <reference path="../../pb_data/types.d.ts" />

// ORTAK (core): template'ten gelir, sitede elle değiştirilmez.
//
// Mağaza ödeme sağlayıcısı: iyzico Checkout Form (docs/shop.md). Sağlayıcı arayüzü (lib/shop.js kullanır):
//   start(app, order, opts)  → { action, method: "GET", fields }   tarayıcı iyzico'nun ödeme sayfasına gider
//   callback(e, opts)        → { number, paid, paymentId, installment } ya da sonuç alınamazsa null
//
// Akış (docs.iyzico.com, Checkout Form): sunucu sepeti ve alıcıyı CF-Initialize ile gönderir, iyzico bir token ve
// ödeme sayfası adresi (paymentPageUrl) döndürür; müşteri kartı iyzico'nun sayfasında girer. Ödemeden sonra iyzico
// müşterinin tarayıcısıyla callbackUrl'e token POST eder; sunucu sonucu CF-Retrieve ile iyzico'dan kendisi sorar
// (dönüşteki veriye güvenilmez, yalnız token alınır).
//   istek kimliği (IYZWSv2): Authorization = "IYZWSv2 " + base64("apiKey:<key>&randomKey:<rnd>&signature:<hex>"),
//                            hex = HMAC-SHA256(rnd + uri.path + gövde, secretKey), x-iyzi-rnd = rnd
//   yanıt imzası:            hex HMAC-SHA256(alanlar ":" ile, secretKey); fiyatların sondaki sıfırları atılır
//     CF-Initialize: conversationId, token
//     CF-Retrieve:   paymentStatus, paymentId, currency, basketId, conversationId, paidPrice, price, token
// Sunucu .env: IYZICO_API_KEY, IYZICO_SECRET_KEY; deneme için IYZICO_BASE_URL=https://sandbox-api.iyzipay.com.
// Dönüş adresi: PB ayarlarındaki Application URL (meta.appURL) + /api/<ID>/shop/callback/iyzico; farklıysa IYZICO_CALLBACK_URL.
// site.js SHOP.iyzico = { installments: [1, 2, 3, 6] } (isteğe bağlı; yoksa iyzico panelindeki taksitler).

const BASE = "https://api.iyzipay.com"
const INITIALIZE = "/payment/iyzipos/checkoutform/initialize/auth/ecom"
const RETRIEVE = "/payment/iyzipos/checkoutform/auth/ecom/detail"
// Ödeme sayfası kökenleri (site/integrations/pb-csp.ts PAYMENT_ORIGINS ile aynı)
const PAGE_ORIGINS = ["https://cpp.iyzipay.com", "https://sandbox-cpp.iyzipay.com"]
// iyzico alıcıdan T.C. kimlik no ister; mağaza sormuyorsa iyzico'nun önerdiği yer tutucu gönderilir
const NO_IDENTITY = "11111111111"
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

/** Metni UTF-8 baytlarıyla base64'e çevirir (goja'da btoa yok). */
function base64(text) {
  const bytes = []
  for (const ch of String(text)) {
    const c = ch.codePointAt(0)
    if (c < 0x80) bytes.push(c)
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63))
    else if (c < 0x10000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
    else bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
  }
  let out = ""
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i], bytes[i + 1], bytes[i + 2]]
    const n = (a << 16) | ((b || 0) << 8) | (c || 0)
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (b === undefined ? "=" : B64[(n >> 6) & 63]) + (c === undefined ? "=" : B64[n & 63])
  }
  return out
}

function keys() {
  const key = ($os.getenv("IYZICO_API_KEY") || "").trim()
  const secret = ($os.getenv("IYZICO_SECRET_KEY") || "").trim()
  if (!key || !secret) throw new Error("IYZICO_API_KEY / IYZICO_SECRET_KEY tanımlı değil")
  return { key, secret }
}

const base = () => (($os.getenv("IYZICO_BASE_URL") || "").trim() || BASE).replace(/\/+$/, "")

/** IYZWSv2 Authorization başlığı. */
function authorization(key, secret, rnd, path, body) {
  const signature = $security.hs256(`${rnd}${path}${body}`, secret)
  return `IYZWSv2 ${base64(`apiKey:${key}&randomKey:${rnd}&signature:${signature}`)}`
}

/** Yanıt imzasındaki fiyat: sondaki sıfırlar atılır ("50.00" → "50", "10.50" → "10.5"). */
function trimZeros(v) {
  const s = String(v === null || v === undefined ? "" : v)
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s
}

/** Yanıttaki imza alanları sırayla ":" ile birleştirilip doğrulanır. */
function verify(res, fields, secret) {
  const sig = String((res && res.signature) || "")
  if (!sig) return false
  const data = fields.map((f) => (/price$/i.test(f) ? trimZeros(res[f]) : String(res[f] === null || res[f] === undefined ? "" : res[f]))).join(":")
  return $security.equal($security.hs256(data, secret), sig)
}

function post(path, payload) {
  const { key, secret } = keys()
  const body = JSON.stringify(payload)
  const rnd = `${Date.now()}${$security.randomStringWithAlphabet(9, "0123456789")}`
  const res = $http.send({
    url: `${base()}${path}`,
    method: "POST",
    body,
    headers: { "Content-Type": "application/json", "Accept": "application/json", "Authorization": authorization(key, secret, rnd, path, body), "x-iyzi-rnd": rnd },
    timeout: 30,
  })
  const json = res.json && typeof res.json === "object" ? res.json : {}
  return { status: res.statusCode, json, secret }
}

const kurus = (tl) => Math.round(Number(tl || 0) * 100)
const price = (k) => (k / 100).toFixed(2)

function splitName(full) {
  const parts = String(full).trim().split(/\s+/)
  const surname = parts.length > 1 ? parts.pop() : "-"
  return [parts.join(" ") || "-", surname]
}

/** 0530 000 00 00 → +905300000000 (iyzico uluslararası biçim bekler). */
function gsm(phone) {
  let d = String(phone).replace(/\D/g, "")
  if (d.startsWith("90") && d.length === 12) d = d.slice(2)
  if (d.startsWith("0")) d = d.slice(1)
  return d.length === 10 ? `+90${d}` : `+${d}`
}

/** paymentPageUrl → GET formu (sorgu parametreleri form alanı olur; GET formu adresteki sorguyu siler). */
function pageForm(url) {
  const [action, query] = String(url).split("?")
  const fields = {}
  for (const pair of (query || "").split("&")) {
    if (!pair) continue
    const i = pair.indexOf("=")
    const k = decodeURIComponent((i < 0 ? pair : pair.slice(0, i)).replace(/\+/g, " "))
    fields[k] = i < 0 ? "" : decodeURIComponent(pair.slice(i + 1).replace(/\+/g, " "))
  }
  return { action, method: "GET", fields }
}

function callbackUrl(app) {
  const site = require(`${__hooks}/site.js`)
  const custom = ($os.getenv("IYZICO_CALLBACK_URL") || "").trim()
  if (custom) return custom
  const appUrl = String(app.settings().meta.appURL || "").replace(/\/+$/, "")
  if (!/^https?:\/\//.test(appUrl)) throw new Error("iyzico dönüş adresi için PB ayarlarında Application URL ya da IYZICO_CALLBACK_URL gerekir")
  return `${appUrl}/api/${site.ID}/shop/callback/iyzico`
}

/** Sepet: kalem başına bir satır (adet tutara katılır), kargo ayrı satır. Satırların toplamı price'a eşit olmalı. */
function basket(order, lineName) {
  const lines = JSON.parse(order.getString("items") || "[]")
  const rows = lines.map((l, i) => ({
    id: `${l.id}-${i + 1}`,
    name: (l.qty > 1 ? `${lineName(l)} x${l.qty}` : lineName(l)).slice(0, 250),
    category1: l.kind === "workshop" ? "Atölye" : "Ürün",
    itemType: l.kind === "workshop" ? "VIRTUAL" : "PHYSICAL",
    k: kurus(l.price) * Number(l.qty || 0),
  }))
  const ship = kurus(order.getFloat("shipping"))
  if (ship > 0) rows.push({ id: "kargo", name: "Kargo", category1: "Kargo", itemType: "PHYSICAL", k: ship })
  return rows.filter((r) => r.k > 0)
}

function start(app, order, opts) {
  const shop = require(`${__hooks}/lib/shop.js`)
  const number = order.getString("number")
  const rows = basket(order, shop.lineName)
  const total = rows.reduce((n, r) => n + r.k, 0)
  if (total !== kurus(order.getFloat("total"))) throw new Error(`Sepet toplamı siparişle tutmuyor (${total} / ${kurus(order.getFloat("total"))})`)
  const physical = rows.some((r) => r.itemType === "PHYSICAL")
  const [name, surname] = splitName(order.getString("buyer_name"))
  const contact = order.getString("buyer_name")
  const address = order.getString("address") || "Belirtilmedi"
  const city = (order.getString("city") || "Belirtilmedi").split("/").pop().trim() || "Belirtilmedi"
  const country = order.getString("country") || "Turkey"
  const zip = order.getString("postcode")
  const addr = { contactName: contact, city, country, address, zipCode: zip || undefined }
  const payload = {
    locale: "tr",
    conversationId: number,
    price: price(total),
    paidPrice: price(total),
    currency: "TRY",
    basketId: number,
    paymentGroup: "PRODUCT",
    callbackUrl: callbackUrl(app),
    buyer: {
      id: order.id,
      name,
      surname,
      identityNumber: NO_IDENTITY,
      email: order.getString("email"),
      gsmNumber: gsm(order.getString("phone")),
      registrationAddress: address,
      city,
      country,
      zipCode: zip || undefined,
    },
    billingAddress: addr,
    basketItems: rows.map((r) => ({ id: r.id, name: r.name, category1: r.category1, itemType: r.itemType, price: price(r.k) })),
  }
  if (physical) payload.shippingAddress = addr
  const installments = opts.iyzico && opts.iyzico.installments
  if (Array.isArray(installments) && installments.length) payload.enabledInstallments = installments.map(Number)

  const { status, json, secret } = post(INITIALIZE, payload)
  if (status !== 200 || json.status !== "success" || !json.token || !json.paymentPageUrl) {
    throw new Error(`iyzico ödeme formu açılamadı: ${json.errorCode || status} ${json.errorMessage || ""}`.trim())
  }
  if (!verify(json, ["conversationId", "token"], secret)) throw new Error("iyzico yanıt imzası geçersiz (CF-Initialize)")
  const form = pageForm(json.paymentPageUrl)
  if (!PAGE_ORIGINS.some((o) => form.action === o || form.action.startsWith(`${o}/`))) {
    app.logger().warn("iyzico ödeme sayfası beklenmeyen adreste; sitenin CSP form-action'ı güncellenmeli", "url", form.action)
  }
  return form
}

function callback(e) {
  const body = e.requestInfo().body || {}
  const token = String(body.token || "").trim()
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(token)) return null
  const { json, secret } = post(RETRIEVE, { locale: "tr", token })
  const number = String(json.basketId || json.conversationId || "")
  if (!number) {
    e.app.logger().warn("iyzico sonucu alınamadı", "errorCode", String(json.errorCode || ""), "error", String(json.errorMessage || ""))
    return null
  }
  if (json.status === "success") {
    const fields = ["paymentStatus", "paymentId", "currency", "basketId", "conversationId", "paidPrice", "price", "token"]
    if (!verify(json, fields, secret)) {
      e.app.logger().warn("iyzico sonuç imzası geçersiz", "order", number)
      return null
    }
  }
  // fraudStatus: 1 onaylı, 0 incelemede, -1 reddedildi (reddedilen ödeme alınmamış sayılır)
  const paid = json.status === "success" && String(json.paymentStatus || "").toUpperCase() === "SUCCESS" && Number(json.fraudStatus) !== -1
  return { number, paid, paymentId: String(json.paymentId || ""), installment: Number(json.installment) || 0 }
}

module.exports = { BASE, INITIALIZE, RETRIEVE, PAGE_ORIGINS, start, callback, authorization, verify, trimZeros, base64, gsm, pageForm }
