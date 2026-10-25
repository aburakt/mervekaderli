/// <reference path="../../pb_data/types.d.ts" />

// ORTAK (core): template'ten gelir, sitede elle değiştirilmez.
//
// Mağaza modülü (docs/shop.md): sepet doğrulama, stok ayırma, sipariş durumu ve ödeme dönüşü.
// Ayarlar site.js SHOP'tan (isteğe bağlı alanlar aşağıdaki DEFAULTS), şema pb/shop/1792200000_shop.js.
// shop.pb.js bu dosyayı handler içinde yükler. Ödeme sağlayıcısı lib/shop-<provider>.js (aynı arayüz: start, callback).
//
// Stok kuralı (tek kural, her yerde aynı): sipariş HOLD durumlarından birindeyken ürünleri stoktan düşülmüş tutar.
// pending/paid/shipped/delivered = ürünler siparişte; failed/expired/cancelled/refunded = ürünler stokta.
// Durum hangi yoldan değişirse değişsin (ödeme adımı, ödeme dönüşü, süre dolması, panel) stok transition() ile izler.
// Tutarlar kuruş (tam sayı) ile hesaplanır, kayda TL yazılır.

const DEFAULTS = {
  // Ödeme sağlayıcısı: lib/shop-<provider>.js
  provider: "shopier",
  // Ödeme beklenirken ürünler kaç dakika ayrılır; sonra sipariş expired olur, ürünler stoğa döner
  reserveMinutes: 30,
  // Kargo (TL): price sabit ücret, freeOver bu tutar ve üstünde ücretsiz (0 = yok). Atölyede kargo alınmaz.
  shipping: { price: 0, freeOver: 0 },
  // Ödeme sonrası müşterinin döndüğü sayfa (BRAND.url + returnPath + ?no=&t=)
  returnPath: "/siparis/",
  // Sipariş numarası öneki (ör. S2610251234)
  orderPrefix: "S",
  // Bir siparişte en çok kalem ve kalem başına en çok adet
  maxItems: 20,
  maxQty: 20,
  // Ödeme adımı hız sınırı: aynı IP'den pencere (dakika) içinde en çok istek
  rateLimit: { max: 10, minutes: 10 },
}

const HOLD = ["pending", "paid", "shipped", "delivered"]
const STATUSES = HOLD.concat(["failed", "expired", "cancelled", "refunded"])
// Sipariş açıldıktan sonra panelden değişmeyen alanlar (tutar ve kalemler ödeme sistemine gidenle aynı kalmalı)
const LOCKED = ["number", "items", "subtotal", "shipping", "total", "provider", "payment_id", "token"]

function options() {
  const site = require(`${__hooks}/site.js`)
  const opts = Object.assign({}, DEFAULTS, site.SHOP || {})
  opts.shipping = Object.assign({}, DEFAULTS.shipping, (site.SHOP || {}).shipping || {})
  opts.rateLimit = Object.assign({}, DEFAULTS.rateLimit, (site.SHOP || {}).rateLimit || {})
  return opts
}

function provider(opts) {
  if (!/^[a-z0-9_-]+$/.test(String(opts.provider))) throw new Error(`Geçersiz ödeme sağlayıcısı: ${opts.provider}`)
  return require(`${__hooks}/lib/shop-${opts.provider}.js`)
}

const kurus = (tl) => Math.round(Number(tl || 0) * 100)
const tl = (k) => Math.round(k) / 100
const nowIso = () => new Date().toISOString().replace("T", " ")
// eslint-disable-next-line no-control-regex -- kontrol karakterleri (satır sonu vb.) bilerek temizlenir
const clean = (v, max) => String(v === null || v === undefined ? "" : v).replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max)

function items(order) {
  try {
    const v = JSON.parse(order.getString("items") || "[]")
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

/** Siparişin durumu from → to değişirken stok: HOLD'dan çıkınca ürünler geri gelir, HOLD'a girince düşülür. */
function transition(app, order, from, to) {
  const wasHeld = HOLD.includes(from)
  const willHold = HOLD.includes(to)
  if (wasHeld === willHold) return []
  const sign = willHold ? -1 : 1
  const short = []
  for (const line of items(order)) {
    let product
    try {
      product = app.findRecordById("products", line.id)
    } catch {
      continue // ürün silinmiş: stoğu izlenecek kayıt yok
    }
    const stock = product.getInt("stock")
    const next = stock + sign * Number(line.qty || 0)
    if (next < 0) short.push(`${line.title}: ${-next} adet eksik`)
    product.set("stock", Math.max(0, next))
    app.save(product)
  }
  return short
}

/** Durumu değiştirir (stokla birlikte, tek transaction). extra: aynı kayda yazılacak diğer alanlar. */
function setStatus(app, order, to, extra) {
  app.runInTransaction((tx) => {
    const fresh = tx.findRecordById("orders", order.id)
    const from = fresh.getString("status")
    const short = transition(tx, fresh, from, to)
    fresh.set("status", to)
    for (const k of Object.keys(extra || {})) fresh.set(k, extra[k])
    if (short.length) {
      const note = `Stok yetersizdi (${nowIso()}): ${short.join("; ")}`
      fresh.set("notes", [fresh.getString("notes"), note].filter(Boolean).join("\n"))
      tx.logger().warn("Sipariş stok yetersizken onaylandı", "order", fresh.getString("number"), "short", short.join("; "))
    }
    tx.save(fresh)
  })
  return app.findRecordById("orders", order.id)
}

function rateLimited(app, ip, opts) {
  const store = app.store()
  const key = `shop_rl_${ip}`
  const windowMs = Number(opts.rateLimit.minutes) * 60000
  const now = Date.now()
  const hits = (store.get(key) || []).filter((t) => now - t < windowMs)
  hits.push(now)
  store.set(key, hits)
  return hits.length > Number(opts.rateLimit.max)
}

function newNumber(app, prefix) {
  const d = new Date()
  const day = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`
  for (let i = 0; i < 20; i++) {
    const n = `${prefix}${day}${$security.randomStringWithAlphabet(4, "0123456789")}`
    if (app.countRecords("orders", $dbx.hashExp({ number: n })) === 0) return n
  }
  throw new Error("Sipariş numarası üretilemedi")
}

function bad(msg) {
  return new BadRequestError(msg)
}

/** POST /api/<ID>/shop/checkout gövdesini doğrular, ürünleri ayırır, siparişi açar; ödeme formunu döndürür. */
function checkout(e) {
  const opts = options()
  if (rateLimited(e.app, e.realIP(), opts)) throw new TooManyRequestsError("Çok fazla deneme. Lütfen birkaç dakika sonra tekrar deneyin.")
  const body = e.requestInfo().body || {}
  const buyer = body.buyer || {}
  const name = clean(buyer.name, 200)
  const email = clean(buyer.email, 200).toLowerCase()
  const phone = clean(buyer.phone, 50)
  if (name.split(/\s+/).length < 2) throw bad("Lütfen adınızı ve soyadınızı yazın.")
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw bad("Lütfen geçerli bir e-posta adresi yazın.")
  if (phone.replace(/\D/g, "").length < 10) throw bad("Lütfen geçerli bir telefon numarası yazın.")
  if (body.kvkk_consent !== true) throw bad("Siparişi tamamlamak için KVKK aydınlatma metnini onaylamanız gerekir.")
  if (body.contract_consent !== true) throw bad("Siparişi tamamlamak için ön bilgilendirme formunu ve mesafeli satış sözleşmesini onaylamanız gerekir.")

  // aynı ürün birden çok satırda gelirse birleşir
  const wanted = {}
  for (const it of Array.isArray(body.items) ? body.items : []) {
    const id = clean(it && it.id, 30)
    const qty = Number(it && it.qty)
    if (!id || !Number.isInteger(qty) || qty < 1 || qty > opts.maxQty) throw bad(`Adet 1 ile ${opts.maxQty} arasında olmalı.`)
    wanted[id] = (wanted[id] || 0) + qty
  }
  const ids = Object.keys(wanted)
  if (!ids.length) throw bad("Sepetiniz boş.")
  if (ids.length > opts.maxItems) throw bad(`Bir siparişte en çok ${opts.maxItems} farklı ürün olabilir.`)

  let order
  e.app.runInTransaction((tx) => {
    const lines = []
    let subtotal = 0
    let physical = false
    for (const id of ids) {
      let p
      try {
        p = tx.findRecordById("products", id)
      } catch {
        throw bad("Sepetteki bir ürün artık satışta değil. Lütfen sepetinizi yenileyin.")
      }
      const title = p.getString("title")
      if (!p.getBool("published")) throw bad(`${title} artık satışta değil.`)
      const price = kurus(p.getFloat("price"))
      if (price <= 0) throw bad(`${title} için fiyat girilmemiş.`)
      const kind = p.getString("kind") || "product"
      const date = p.getDateTime("event_date")
      if (kind === "workshop" && !date.isZero() && date.unix() * 1000 < Date.now()) throw bad(`${title}: atölye tarihi geçti.`)
      const qty = wanted[id]
      const stock = p.getInt("stock")
      if (stock < qty) throw bad(stock > 0 ? `${title}: yalnız ${stock} adet kaldı.` : `${title} tükendi.`)
      p.set("stock", stock - qty)
      tx.save(p)
      lines.push({ id, title, kind, qty, price: tl(price) })
      subtotal += price * qty
      if (kind !== "workshop") physical = true
    }

    const address = clean(buyer.address, 500)
    const city = clean(buyer.city, 100)
    if (physical && (address.length < 10 || !city)) throw bad("Lütfen teslimat adresini ve ili/ilçeyi eksiksiz yazın.")
    const ship = !physical ? 0 : (kurus(opts.shipping.freeOver) > 0 && subtotal >= kurus(opts.shipping.freeOver) ? 0 : kurus(opts.shipping.price))

    order = new Record(tx.findCollectionByNameOrId("orders"))
    order.set("number", newNumber(tx, clean(opts.orderPrefix, 6)))
    order.set("status", "pending")
    order.set("items", lines)
    order.set("subtotal", tl(subtotal))
    order.set("shipping", tl(ship))
    order.set("total", tl(subtotal + ship))
    order.set("buyer_name", name)
    order.set("email", email)
    order.set("phone", phone)
    order.set("address", address)
    order.set("city", city)
    order.set("postcode", clean(buyer.postcode, 20))
    order.set("country", clean(buyer.country, 100) || "Türkiye")
    order.set("note", clean(body.note, 2000))
    order.set("kvkk_consent", true)
    order.set("contract_consent", true)
    order.set("marketing_consent", body.marketing_consent === true)
    order.set("provider", opts.provider)
    order.set("token", $security.randomString(32))
    order.set("reserved_until", new Date(Date.now() + Number(opts.reserveMinutes) * 60000).toISOString().replace("T", " "))
    tx.save(order)
  })

  let payment
  try {
    payment = provider(opts).start(e.app, order, opts)
  } catch (err) {
    // ödeme formu hazırlanamadı (ör. anahtar yok): ürünler hemen stoğa döner
    setStatus(e.app, order, "failed", { notes: `Ödeme başlatılamadı: ${String(err)}` })
    e.app.logger().error("Ödeme başlatılamadı", "order", order.getString("number"), "error", String(err))
    throw new BadRequestError("Ödeme şu an başlatılamıyor. Lütfen biraz sonra tekrar deneyin ya da bize ulaşın.")
  }
  return { number: order.getString("number"), token: order.getString("token"), total: order.getFloat("total"), payment }
}

/** Ödeme sonrası dönüş adresi: müşteri sitedeki sipariş sayfasına gelir. */
function returnUrl(order, opts) {
  const site = require(`${__hooks}/site.js`)
  const base = String((site.BRAND && site.BRAND.url) || "").replace(/\/+$/, "")
  const q = order ? `?no=${encodeURIComponent(order.getString("number"))}&t=${encodeURIComponent(order.getString("token"))}` : ""
  return `${base}${opts.returnPath}${q}`
}

/**
 * Sağlayıcının sonucu (provider.callback döndürür): { number, paid, paymentId, installment }.
 * Ödendiyse sipariş paid olur (süresi dolmuş ya da başarısız sayılmış olsa bile: para alındıysa ürünler yeniden ayrılır),
 * olmadıysa bekleyen sipariş failed olur. Aynı dönüş ikinci kez gelirse bir şey değişmez.
 */
function applyResult(app, result) {
  let order
  try {
    order = app.findFirstRecordByFilter("orders", "number = {:n}", { n: result.number })
  } catch {
    return null
  }
  const status = order.getString("status")
  if (result.paid) {
    if (["pending", "failed", "expired"].includes(status)) {
      order = setStatus(app, order, "paid", {
        payment_id: clean(result.paymentId, 100),
        installment: Number(result.installment) || 0,
        paid_at: nowIso(),
      })
      notifyPaid(app, order)
    }
  } else if (status === "pending") {
    order = setStatus(app, order, "failed", {})
  }
  return order
}

/** Sağlayıcının dönüş adresi (POST /api/<ID>/shop/callback/<provider>): imza doğrulanır, müşteri siteye yönlenir. */
function callback(e, name) {
  const opts = options()
  if (name !== opts.provider) throw new NotFoundError()
  const result = provider(opts).callback(e, opts)
  const order = result ? applyResult(e.app, result) : null
  if (!order) e.app.logger().warn("Ödeme dönüşü eşleşmedi ya da imza geçersiz", "provider", name)
  return e.redirect(303, returnUrl(order, opts))
}

/** GET /api/<ID>/shop/order?no=&t=: müşterinin sipariş sayfası için durum (gizli anahtarla). */
function status(e) {
  const q = e.requestInfo().query || {}
  const no = clean(q.no, 40)
  const t = clean(q.t, 64)
  let order
  try {
    order = e.app.findFirstRecordByFilter("orders", "number = {:n}", { n: no })
  } catch {
    throw new NotFoundError("Sipariş bulunamadı.")
  }
  if (!t || !$security.equal(t, order.getString("token"))) throw new NotFoundError("Sipariş bulunamadı.")
  return {
    number: order.getString("number"),
    status: order.getString("status"),
    items: items(order).map((l) => ({ title: l.title, qty: l.qty, price: l.price, kind: l.kind })),
    subtotal: order.getFloat("subtotal"),
    shipping: order.getFloat("shipping"),
    total: order.getFloat("total"),
    created: order.getString("created"),
  }
}

/** Cron: süresi dolan bekleyen siparişler expired olur, ürünler stoğa döner. Kapatılan sipariş sayısını döndürür. */
function expire(app) {
  let n = 0
  const due = app.findRecordsByFilter("orders", "status = 'pending' && reserved_until != '' && reserved_until < {:now}", "reserved_until", 200, 0, { now: nowIso() })
  for (const order of due) {
    try {
      setStatus(app, order, "expired", {})
      n++
    } catch (err) {
      app.logger().error("Süresi dolan sipariş kapatılamadı", "order", order.getString("number"), "error", String(err))
    }
  }
  if (n) app.logger().info("Süresi dolan siparişler kapatıldı, ürünler stoğa döndü", "count", n)
  return n
}

// --- panel korumaları (sipariş kaydı panelden ya da API'den değişirken) ---

function beforeCreate() {
  throw bad("Siparişler siteden gelir; panelden sipariş açılamaz.")
}

/** Panelden düzenleme: tutar/kalemler kilitli, durum değişince stok izler (aynı transaction içinde kaydedilir). */
function beforeUpdate(e) {
  const original = e.record.original()
  for (const f of LOCKED) {
    if (e.record.getString(f) !== original.getString(f)) throw bad(`"${f}" alanı sipariş açıldıktan sonra değiştirilemez.`)
  }
  const from = original.getString("status")
  const to = e.record.getString("status")
  if (!STATUSES.includes(to)) throw bad("Geçersiz sipariş durumu.")
  e.app.runInTransaction((tx) => {
    const app = e.app
    e.app = tx
    try {
      const short = transition(tx, e.record, from, to)
      if (short.length) throw bad(`Stok yetersiz: ${short.join("; ")}. Önce ürün stoğunu artırın.`)
      e.next()
    } finally {
      e.app = app
    }
  })
}

function beforeDelete(e) {
  const s = e.record.getString("status")
  if (HOLD.includes(s)) throw bad("Bekleyen, ödenmiş ya da gönderilmiş sipariş silinemez; gerekiyorsa durumunu cancelled yapın.")
}

// --- bildirim (SMTP yoksa yalnız loglanır, siparişi bozmaz) ---

function esc(v) {
  return String(v === null || v === undefined ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c])
}

/** 1234.5 → "1.234,50 TL" (goja'da toLocaleString yerel biçim bilmez). */
function money(n) {
  const [int, dec] = Number(n || 0).toFixed(2).split(".")
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec} TL`
}

function merchantAddress(app) {
  let to = ""
  try {
    to = app.findFirstRecordByFilter("settings", "form_recipient != ''").getString("form_recipient")
  } catch {}
  return (to || $os.getenv("SHOP_NOTIFY_TO") || $os.getenv("FORM_NOTIFY_TO") || "").trim()
}

function orderTable(order) {
  const rows = items(order).map((l) => `<tr><td style="padding:8px 0;border-top:1px solid #e5e5e5;font-size:15px;">${esc(l.title)} × ${esc(l.qty)}</td>`
    + `<td align="right" style="padding:8px 0;border-top:1px solid #e5e5e5;font-size:15px;white-space:nowrap;">${esc(money(l.price * l.qty))}</td></tr>`)
  if (order.getFloat("shipping") > 0) rows.push(`<tr><td style="padding:8px 0;border-top:1px solid #e5e5e5;">Kargo</td><td align="right" style="padding:8px 0;border-top:1px solid #e5e5e5;">${esc(money(order.getFloat("shipping")))}</td></tr>`)
  rows.push(`<tr><th align="left" style="padding:10px 0;border-top:2px solid #333;">Toplam</th><th align="right" style="padding:10px 0;border-top:2px solid #333;">${esc(money(order.getFloat("total")))}</th></tr>`)
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:8px 0 0;">${rows.join("")}</table>`
}

function send(app, to, subject, html, replyTo) {
  const meta = app.settings().meta
  const headers = replyTo ? { "Reply-To": replyTo } : {}
  app.newMailClient().send(new MailerMessage({ from: { address: meta.senderAddress, name: meta.senderName }, to: [{ address: to }], subject, html, headers }))
}

function notifyPaid(app, order) {
  const mail = require(`${__hooks}/lib/mail.js`)
  const no = order.getString("number")
  const table = orderTable(order)
  const merchant = merchantAddress(app)
  if (merchant) {
    try {
      const base = String(app.settings().meta.appURL || "").replace(/\/+$/, "")
      const who = [order.getString("buyer_name"), order.getString("phone"), order.getString("email")].map(esc).join("<br>")
      const where = [order.getString("address"), order.getString("city"), order.getString("postcode")].filter(Boolean).map(esc).join(", ")
      send(app, merchant, `[Sipariş] ${no}: ${money(order.getFloat("total"))}`, mail.layout({
        title: `Yeni sipariş: ${no}`,
        intro: "Ödemesi alınan yeni bir sipariş var. Ürünleri hazırlayıp durumunu panelden shipped yapın.",
        bodyHtml: `${table}<p style="margin:18px 0 0;font-size:15px;line-height:22px;">${who}${where ? `<br>${where}` : ""}</p>`
          + (order.getString("note") ? `<p style="margin:12px 0 0;font-size:15px;line-height:22px;"><strong>Not:</strong> ${esc(order.getString("note"))}</p>` : ""),
        action: /^https?:\/\//.test(base) ? { label: "Panelde aç", url: `${base}/_/#/collections?collection=orders&record=${encodeURIComponent(order.id)}` } : null,
        footer: `Sipariş ${no}`,
      }), order.getString("email"))
    } catch (err) {
      app.logger().error("Sipariş bildirimi gönderilemedi", "order", no, "error", String(err))
    }
  }
  try {
    send(app, order.getString("email"), `Siparişiniz alındı: ${no}`, mail.layout({
      title: "Siparişiniz için teşekkürler",
      intro: `${no} numaralı siparişinizin ödemesi alındı. Hazırlanıp gönderildiğinde size haber vereceğiz.`,
      bodyHtml: table,
      action: { label: "Siparişi görüntüle", url: returnUrl(order, options()) },
      footer: `Sipariş ${no}`,
    }), merchant)
  } catch (err) {
    app.logger().error("Müşteri sipariş e-postası gönderilemedi", "order", no, "error", String(err))
  }
}

module.exports = { DEFAULTS, HOLD, STATUSES, options, checkout, callback, applyResult, status, expire, beforeCreate, beforeUpdate, beforeDelete, transition }
