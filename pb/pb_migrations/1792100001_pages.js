/// <reference path="../pb_data/types.d.ts" />

// SİTEYE ÖZEL (template örneği): Sayfalar. Yasal metinler (KVKK aydınlatma metni, gizlilik ve çerez politikası) gibi
// tek metinlik sayfalar /<adres>/ altında yayınlanır; yayındaki her sayfanın bağlantısı sayfa altında görünür.
// Taslak metinler scripts/seed.ts ile gelir; müşteri (hukuk danışmanı) gözden geçirmeden yayına alınmamalıdır.
migrate((app) => {
  app.save(new Collection({
    type: "base",
    name: "pages",
    listRule: "published = true", viewRule: "published = true", createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { name: "title", type: "text", required: true, max: 160, presentable: true,
        help: "Sayfanın başlığı. Sayfada büyük başlık ve sayfa altındaki bağlantı metni olarak görünür." },
      { name: "slug", type: "text", max: 120, pattern: "^[a-z0-9-]*$",
        help: "Sayfa adresi (/<adres>/). Boş bırakın; başlıktan üretilir. Kaydettikten sonra değiştirilemez." },
      { name: "body", type: "editor", required: true,
        help: "Sayfanın metni. Başlık, liste ve bağlantı kullanabilirsiniz. Yasal metinleri hukuk danışmanınızın onayladığı hâliyle yazın." },
      { name: "seo_description", type: "text", max: 300,
        help: "Google'da bu sayfa için görünen kısa açıklama (150-160 karakter). Boşsa Site Ayarları'ndaki genel açıklama kullanılır." },
      { name: "position", type: "number", onlyInt: true,
        help: "Sayfa altındaki bağlantı sırası; küçük sayı önce gelir. Araya eklemek için 10, 20, 30 gibi aralıklı sayılar kullanın." },
      { name: "published", type: "bool",
        help: "İşaretli değilse sayfa ve sayfa altındaki bağlantısı sitede görünmez (taslak). Metin onaylanınca işaretleyin." },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_pages_slug ON pages (slug)"],
  }))
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("pages")) } catch (_) {}
})
