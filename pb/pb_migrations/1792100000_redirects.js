/// <reference path="../pb_data/types.d.ts" />

// SİTEYE ÖZEL (template örneği): Yönlendirmeler. Build bunları site/src/data/redirects.txt'deki sabit satırlarla birleştirip
// dist/_redirects (Cloudflare Pages biçimi) yazar: site/src/pages/[redirects].ts. Panelde kayıt sırasında biçim, tekrar ve
// döngü kontrolü pb_hooks/redirects.pb.js'te.
migrate((app) => {
  app.save(new Collection({
    type: "base",
    name: "redirects",
    listRule: "published = true", viewRule: "published = true", createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { name: "from", type: "text", required: true, max: 500, pattern: "^/\\S*$", presentable: true,
        help: "Eski adres, / ile başlar (ör. /eski-sayfa ya da /eski-blog/*). Alan adı yazılmaz. Sonunda / olan ve olmayan hâli birlikte yönlenir." },
      { name: "to", type: "text", required: true, max: 1000, pattern: "^(/|https?://)\\S*$",
        help: "Yeni adres: sitedeki bir sayfa (/yazilar/ornek-yazi/) ya da tam adres (https://...). Eski adreste * kullandıysanız :splat ile aynı parçayı taşıyabilirsiniz." },
      { name: "code", type: "select", required: true, maxSelect: 1, values: ["301", "302"],
        help: "301 = kalıcı taşındı (Google eski adresi unutur; çoğu durumda bu). 302 = geçici (eski adres ileride geri gelecekse)." },
      { name: "position", type: "number", onlyInt: true,
        help: "Küçük sayı önce yazılır. Yalnız * içeren geniş kurallarda önemlidir: özel kural genel kuraldan önce gelmeli." },
      { name: "published", type: "bool",
        help: "İşaretli değilse yönlendirme çalışmaz. Kaldırmak için silmek yerine işareti kaldırabilirsiniz." },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_redirects_from ON redirects (`from`)"],
  }))
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("redirects")) } catch (_) {}
})
