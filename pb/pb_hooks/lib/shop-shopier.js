/// <reference path="../../pb_data/types.d.ts" />

// ORTAK (core): template'ten gelir, sitede elle değiştirilmez.
//
// Mağaza ödeme sağlayıcısı: Shopier (docs/shop.md). Sağlayıcı arayüzü (lib/shop.js kullanır):
//   start(app, order, opts)  → { action, method: "POST", fields }   tarayıcı bu formu Shopier'e gönderir
//   callback(e, opts)        → { number, paid, paymentId, installment } ya da imza geçersizse null
//
// Shopier'in dış siteden ödeme alma API'si (WooCommerce/OpenCart modüllerinin kullandığı api_pay4): sipariş no, tutar ve
// alıcı bilgisi imzalı gönderilir, müşteri kartı Shopier'in sayfasında girer, sonuç imzalı POST ile dönüş adresine gelir.
// Resmi dokümanı yoktur; alanlar ve imza topluluk SDK'larıyla aynıdır (npm shopier-api, erkineren/shopier).
//   gönderim imzası: base64(HMAC-SHA256(random_nr + platform_order_id + total_order_value + currency, API secret))
//   dönüş imzası:    base64(HMAC-SHA256(random_nr + platform_order_id, API secret))
// Dönüş adresi Shopier panelinde (Entegrasyonlar > Modül yönetimi) website_index'e karşılık gelen "Geri dönüş URL"
// alanına yazılır: https://<pb-adresi>/api/<ID>/shop/callback/shopier
// Sunucu .env: SHOPIER_API_KEY, SHOPIER_API_SECRET. site.js SHOP.shopier = { websiteIndex: 1 } (isteğe bağlı).

const ENDPOINT = "https://www.shopier.com/ShowProduct/api_pay4.php"
const CURRENCY = { TRY: 0, USD: 1, EUR: 2 }
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

/** $security.hs256 hex döndürür; Shopier base64 bekler. */
function hexToBase64(hex) {
  const bytes = []
  for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16))
  let out = ""
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i], bytes[i + 1], bytes[i + 2]]
    const n = (a << 16) | ((b || 0) << 8) | (c || 0)
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (b === undefined ? "=" : B64[(n >> 6) & 63]) + (c === undefined ? "=" : B64[n & 63])
  }
  return out
}

function sign(data, secret) {
  return hexToBase64($security.hs256(data, secret))
}

function keys() {
  const key = ($os.getenv("SHOPIER_API_KEY") || "").trim()
  const secret = ($os.getenv("SHOPIER_API_SECRET") || "").trim()
  if (!key || !secret) throw new Error("SHOPIER_API_KEY / SHOPIER_API_SECRET tanımlı değil")
  return { key, secret }
}

/** Shopier ad ve soyadı ayrı ister. */
function splitName(full) {
  const parts = String(full).trim().split(/\s+/)
  const surname = parts.length > 1 ? parts.pop() : "-"
  return [parts.join(" ") || "-", surname]
}

function start(app, order, opts) {
  const { key, secret } = keys()
  const items = JSON.parse(order.getString("items") || "[]")
  const physical = items.some((l) => l.kind !== "workshop")
  const number = order.getString("number")
  const total = order.getFloat("total").toFixed(2)
  const currency = CURRENCY.TRY
  const random = $security.randomStringWithAlphabet(6, "123456789")
  const [name, surname] = splitName(order.getString("buyer_name"))
  const title = items.map((l) => (l.qty > 1 ? `${l.title} x${l.qty}` : l.title)).join(", ")
  // atölye kaydında adres yok: Shopier boş alan kabul etmez
  const address = order.getString("address") || "Atölye kaydı"
  const city = order.getString("city") || "-"
  const country = order.getString("country") || "Türkiye"
  const postcode = order.getString("postcode") || "-"
  const fields = {
    API_key: key,
    website_index: Number((opts.shopier && opts.shopier.websiteIndex) || 1),
    platform_order_id: number,
    product_name: title.length > 200 ? `${title.slice(0, 197)}...` : title,
    // 0 = fiziksel ürün, 1 = indirilebilir/sanal (atölye kaydı)
    product_type: physical ? 0 : 1,
    buyer_name: name,
    buyer_surname: surname,
    buyer_email: order.getString("email"),
    buyer_account_age: 0,
    buyer_id_nr: order.id,
    buyer_phone: order.getString("phone"),
    billing_address: address,
    billing_city: city,
    billing_country: country,
    billing_postcode: postcode,
    shipping_address: address,
    shipping_city: city,
    shipping_country: country,
    shipping_postcode: postcode,
    total_order_value: total,
    currency,
    platform: 0,
    is_in_frame: 0,
    current_language: 0,
    modul_version: "1.0.4",
    random_nr: random,
  }
  fields.signature = sign(`${random}${number}${total}${currency}`, secret)
  return { action: ENDPOINT, method: "POST", fields }
}

function callback(e) {
  const { secret } = keys()
  const body = e.requestInfo().body || {}
  const random = String(body.random_nr || "")
  const number = String(body.platform_order_id || "")
  const signature = String(body.signature || "")
  if (!random || !number || !signature) return null
  if (!$security.equal(sign(`${random}${number}`, secret), signature)) return null
  return {
    number,
    paid: String(body.status || "").toLowerCase() === "success",
    paymentId: String(body.payment_id || ""),
    installment: Number(body.installment) || 0,
  }
}

module.exports = { ENDPOINT, start, callback, sign, hexToBase64 }
