/// <reference path="../pb_data/types.d.ts" />

// ORTAK (core): template'ten gelir, sitede elle değiştirilmez.
// Mağaza modülünün (docs/shop.md) şeması: Ürünler (products) ve Siparişler (orders).
// Mağazası olan sitede bu dosya bir kez pb/pb_migrations/ altına kopyalanır ve site.js SHOP doldurulur;
// mağazası olmayan sitede hiçbir yere kopyalanmaz. Koleksiyon zaten varsa dokunmaz.
// Ürünlerde ziyaretçi yalnız yayındakileri okur; siparişleri kimse API'den okuyamaz/yazamaz (kurallar null):
// sipariş yalnız ödeme adımında (POST /api/<ID>/shop/checkout) hook ile açılır, durumunu ödeme dönüşü yazar.
migrate((app) => {
  try {
    app.findCollectionByNameOrId("products")
    return
  } catch {}

  app.save(new Collection({
    type: "base",
    name: "products",
    listRule: "published = true", viewRule: "published = true", createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { name: "title", type: "text", required: true, max: 200, presentable: true, help: "Ürünün ya da atölyenin adı. Sitede başlık olarak görünür." },
      { name: "slug", type: "text", max: 120, help: "Sayfa adresi (/urunler/<adres>/). Boş bırakın, addan otomatik üretilir; kaydettikten sonra değişmez." },
      {
        name: "kind", type: "select", required: true, maxSelect: 1, values: ["product", "workshop"],
        help: "product = kargoyla gönderilen ürün, workshop = atölye/ders kaydı (kargo yok, stok = kontenjan).",
      },
      { name: "summary", type: "text", max: 300, help: "Listede görünen kısa açıklama (bir iki cümle)." },
      { name: "description", type: "editor", help: "Ürün sayfasındaki uzun açıklama: ölçü, malzeme, bakım, atölye içeriği." },
      {
        name: "images", type: "file", maxSelect: 10, maxSize: 10485760,
        mimeTypes: ["image/jpeg", "image/png", "image/webp"],
        help: "Ürün fotoğrafları (JPG, PNG ya da WebP, en çok 10). İlk fotoğraf kapak olur.",
      },
      { name: "price", type: "number", min: 0, help: "Satış fiyatı, Türk lirası (KDV dahil). Ör. 1250 ya da 1249.90." },
      { name: "stock", type: "number", min: 0, onlyInt: true, help: "Satılabilir adet. Atölyede boş kontenjan. Sipariş gelince kendiliğinden azalır, 0 olunca \"Tükendi\" görünür." },
      { name: "event_date", type: "date", help: "Yalnız atölyede: atölyenin tarihi ve saati. Tarih geçince satış kapanır." },
      { name: "published", type: "bool", help: "İşaretliyse sitede görünür ve satılır. Hazırlarken işaretsiz bırakın." },
      { name: "sort", type: "number", onlyInt: true, help: "Sıralama: küçük sayı önce gelir. Boşsa en yeni önce." },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_products_slug ON products (slug) WHERE slug != ''"],
  }))

  app.save(new Collection({
    type: "base",
    name: "orders",
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { name: "number", type: "text", required: true, max: 40, presentable: true, help: "Sipariş numarası. Müşteriye ve ödeme sistemine bu numara gider; değişmez." },
      {
        name: "status", type: "select", required: true, maxSelect: 1,
        values: ["pending", "paid", "failed", "expired", "shipped", "delivered", "cancelled", "refunded"],
        help: "pending = ödeme bekleniyor, paid = ödendi (hazırlayın), shipped = kargoda, delivered = teslim edildi, "
          + "failed = ödeme olmadı, expired = süre doldu, cancelled = iptal, refunded = iade edildi. "
          + "İptal/iadede ürünler stoğa geri döner; ödemenin kendisini ödeme sisteminin panelinden iade edin.",
      },
      { name: "items", type: "json", maxSize: 20000, help: "Sipariş edilen ürünler (ad, adet, birim fiyat). Sipariş anındaki halidir; değişmez." },
      { name: "subtotal", type: "number", min: 0, help: "Ürünlerin toplamı (TL)." },
      { name: "shipping", type: "number", min: 0, help: "Kargo ücreti (TL)." },
      { name: "total", type: "number", min: 0, help: "Ödenen toplam tutar (TL)." },
      { name: "buyer_name", type: "text", required: true, max: 200, help: "Müşterinin adı soyadı." },
      { name: "email", type: "email", required: true, help: "Müşterinin e-postası." },
      { name: "phone", type: "text", required: true, max: 50, help: "Müşterinin telefonu." },
      { name: "address", type: "text", max: 500, help: "Teslimat adresi (atölye kaydında boş olabilir)." },
      { name: "city", type: "text", max: 100, help: "Teslimat ili ve ilçesi." },
      { name: "postcode", type: "text", max: 20, help: "Posta kodu." },
      { name: "country", type: "text", max: 100, help: "Ülke." },
      { name: "note", type: "text", max: 2000, help: "Müşterinin sipariş notu." },
      { name: "kvkk_consent", type: "bool", help: "Müşteri KVKK aydınlatma metnini onayladı." },
      { name: "contract_consent", type: "bool", help: "Müşteri ön bilgilendirme formunu ve mesafeli satış sözleşmesini onayladı." },
      { name: "marketing_consent", type: "bool", help: "Müşteri kampanya ve duyuru iletisi almayı kabul etti (İYS'ye bu kayıtlar aktarılır)." },
      { name: "provider", type: "text", max: 40, help: "Ödemenin alındığı sistem (ör. shopier)." },
      { name: "payment_id", type: "text", max: 100, help: "Ödeme sistemindeki işlem numarası (iade ve kontrol için)." },
      { name: "installment", type: "number", min: 0, onlyInt: true, help: "Taksit sayısı (0 ya da 1 = tek çekim)." },
      { name: "token", type: "text", max: 64, hidden: true, help: "Müşterinin sipariş durumu sayfasının gizli anahtarı." },
      { name: "reserved_until", type: "date", help: "Ödeme beklenirken ürünlerin ayrıldığı son an. Ödeme gelmezse ürünler stoğa döner." },
      { name: "paid_at", type: "date", help: "Ödemenin onaylandığı an." },
      { name: "notes", type: "text", max: 5000, help: "Kendi notlarınız (müşteri görmez). Ör. kargo takip numarası, fatura numarası." },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_orders_number ON orders (number)",
      "CREATE INDEX idx_orders_status ON orders (status, reserved_until)",
    ],
  }))
}, (app) => {
  for (const name of ["orders", "products"]) {
    try {
      app.delete(app.findCollectionByNameOrId(name))
    } catch {}
  }
})
