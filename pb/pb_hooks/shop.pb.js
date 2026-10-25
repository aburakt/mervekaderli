/// <reference path="../pb_data/types.d.ts" />

// ORTAK (core): template'ten `bun run core:sync` ile gelir, sitede elle değiştirilmez.
// Mağaza (docs/shop.md): site.js SHOP doluysa açılır; uygulama lib/shop.js ve lib/shop-<provider>.js'te.
// SHOP yoksa hiçbir hook ya da adres kaydedilmez (mağazası olmayan sitede bu dosya etkisizdir).
// *.pb.js dosyaları aynı üst kapsamı paylaşır: değişkenler bu blokta kalır.
{
  const SHOP_SITE = require(`${__hooks}/site.js`)

  if (SHOP_SITE.SHOP) {
    const base = `/api/${SHOP_SITE.ID}/shop`

    // Ödeme adımı: sepet doğrulanır, ürünler ayrılır, sipariş açılır, ödeme formu döner (ziyaretçiye açık)
    routerAdd("POST", `${base}/checkout`, (e) => e.json(200, require(`${__hooks}/lib/shop.js`).checkout(e)))

    // Ödeme sağlayıcısının dönüşü: imza doğrulanır, sipariş güncellenir, müşteri sitedeki sipariş sayfasına yönlenir
    routerAdd("POST", `${base}/callback/{provider}`, (e) => require(`${__hooks}/lib/shop.js`).callback(e, e.request.pathValue("provider")))

    // Müşterinin sipariş sayfası: sipariş no + gizli anahtar
    routerAdd("GET", `${base}/order`, (e) => e.json(200, require(`${__hooks}/lib/shop.js`).status(e)))

    // Panel korumaları: sipariş panelden açılmaz, tutar/kalemler kilitli, durum değişince stok izler
    onRecordCreateRequest((e) => {
      require(`${__hooks}/lib/shop.js`).beforeCreate(e)
    }, "orders")

    onRecordUpdateRequest((e) => {
      require(`${__hooks}/lib/shop.js`).beforeUpdate(e)
    }, "orders")

    onRecordDeleteRequest((e) => {
      require(`${__hooks}/lib/shop.js`).beforeDelete(e)
      e.next()
    }, "orders")

    // Ödenmeyen siparişin süresi dolunca ürünler stoğa döner
    cronAdd(`${SHOP_SITE.ID}_shop_expire`, "*/5 * * * *", () => {
      require(`${__hooks}/lib/shop.js`).expire($app)
    })
  }
}
