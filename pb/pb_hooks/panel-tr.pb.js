/// <reference path="../pb_data/types.d.ts" />

// ORTAK (core): template'ten gelir, sitede elle değiştirilmez (bun run core:sync).

// Yönetim panelini Türkçe gösterir. Panel (PocketBase 0.37+) açılışta /_/extensions.js dosyasını yükler; resmi kayıt yolu
// yalnız Go'da olduğu için isteği burada yakalayıp panel/tr.js'i etiketlerle birlikte döndürürüz: core koleksiyonlarının
// etiketleri panel/core-labels.json'da, sitenin etiketleri panel/labels.json'da (aynı anahtarda site kazanır).
// Dosya bozulur ya da PB bu adresi değiştirirse panel İngilizce çalışmaya devam eder.
// Aynı yanıta panelin markası da eklenir (panel/brand.js): logo ya da site adı, vurgu rengi, sekme simgesi.
routerUse((e) => {
  if (e.request.method !== "GET" || e.request.url.path !== "/_/extensions.js") return e.next()
  const core = JSON.parse(toString($os.readFile(__hooks + "/panel/core-labels.json")))
  const site = JSON.parse(toString($os.readFile(__hooks + "/panel/labels.json")))
  const labels = JSON.stringify({
    collections: Object.assign({}, core.collections, site.collections),
    fields: Object.assign({}, core.fields, site.fields),
  })
  const js = toString($os.readFile(__hooks + "/panel/tr.js"))
  // Marka (logo, vurgu rengi, sekme simgesi): panel/brand.js, veri lib/brand.js'ten. Hata olursa panel PocketBase logosuyla açılır.
  let brand = ""
  try {
    const site = require(__hooks + "/site.js")
    const lib = require(__hooks + "/lib/brand.js")
    const data = JSON.stringify(lib.panel(lib.brand(e.app), "/api/" + site.ID + "/brand"))
    brand = "\nwindow.PB_BRAND = " + data + ";\n" + toString($os.readFile(__hooks + "/panel/brand.js"))
  } catch (err) {
    e.app.logger().warn("Panel markası yüklenemedi", "error", String(err))
  }
  e.response.header().set("Content-Type", "text/javascript; charset=utf-8")
  e.response.header().set("Cache-Control", "no-cache")
  return e.string(200, "window.PB_TR_LABELS = " + labels + ";\n" + js + brand)
})
