/// <reference path="../pb_data/types.d.ts" />

/**
 * Örnek içerik şeması: Site Ayarları (tek kayıt) ve Yazılar. Standart: astro-pocketbase (koleksiyon/alan adları İngilizce).
 * Okuma: içerik published = true ile sınırlı; Site Ayarları herkese açık (tek kayıt). Yazma: yalnız superuser (null).
 * Panel müşterinin kendi başına düzenleyebileceği hâlde gelir: her alanda Türkçe yardım metni, her koleksiyonda okunur alan
 * (presentable), şema düğmeleri gizli. Korumalar pb_hooks/site.js RULES'ta.
 * Yeni sitede bu dosya sitenin şemasıyla değiştirilir; yayına çıktıktan sonra düzenlenmez, yeni migration eklenir.
 */
migrate((app) => {
  const SIRA = "Sitede küçük sayı önce gelir. Araya eklemek için 10, 20, 30 gibi aralıklı sayılar kullanın."
  const PUB = "İşaretli değilse kayıt sitede görünmez (taslak). Yeni kayıtta işaretlemeyi unutmayın; siteden kaldırmak için silmek yerine işareti kaldırın."
  const IMG = "Telefon fotoğrafı da yükleyebilirsiniz; site görseli web için kendisi küçültür. Mümkünse en yüksek çözünürlüklü dosyayı yükleyin."
  const IMAGE_MIME = ["image/png", "image/jpeg", "image/webp"]

  const text = (name, help, extra) => Object.assign({ name, type: "text", help }, extra || {})
  const long = (name, help, extra) => text(name, help, Object.assign({ max: 5000 }, extra || {}))
  const image = (name, help, extra) => Object.assign({ name, type: "file", maxSelect: 1, maxSize: 20 * 1024 * 1024, mimeTypes: IMAGE_MIME, thumbs: ["400x0", "1200x0"], help }, extra || {})
  const position = () => ({ name: "position", type: "number", onlyInt: true, help: SIRA })
  const published = () => ({ name: "published", type: "bool", help: PUB })
  const timestamps = () => [
    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
  ]
  const make = (name, fields, rules) => {
    const c = new Collection({
      type: "base", name,
      listRule: rules.list, viewRule: rules.view, createRule: rules.create, updateRule: rules.update, deleteRule: rules.delete,
      fields: [...fields, ...timestamps()],
    })
    app.save(c)
    return c
  }
  const PUBLISHED = { list: "published = true", view: "published = true", create: null, update: null, delete: null }
  const PUBLIC = { list: "", view: "", create: null, update: null, delete: null }

  // ---------- settings (Site Ayarları, tek kayıt) ----------
  make("settings", [
    text("company_name", "Kurumun adı. Sayfa başlığında, menüde ve sayfa altında görünür.", { required: true, max: 120, presentable: true }),
    text("phone", "Telefon (ör. 0 312 000 00 00). Sayfa altında görünür. Boşsa görünmez.", { max: 40 }),
    { name: "email", type: "email", help: "İletişim e-postası. Boşsa görünmez." },
    long("address", "Açık adres. Sayfa altında görünür. Satırları Enter ile ayırabilirsiniz.", { max: 500 }),
    text("hero_title", "Ana sayfanın en üstündeki büyük başlık.", { required: true, max: 160 }),
    long("hero_text", "Büyük başlığın altındaki 1-2 cümlelik açıklama.", { max: 400 }),
    image("hero_image", "Ana sayfanın en üstündeki fotoğraf. " + IMG),
    text("seo_description", "Google'da ve link paylaşımlarında görünen site açıklaması (150-160 karakter).", { max: 300 }),
    image("share_image", "Site linki paylaşılınca görünen görsel. Yatay, 1200x630 piksel önerilir. Boşsa ana sayfa fotoğrafı kullanılır."),
  ], PUBLIC)

  // ---------- posts (Yazılar) ----------
  make("posts", [
    text("title", "Yazının başlığı.", { required: true, max: 160, presentable: true }),
    text("slug", "Sayfa adresi (/yazilar/<adres>/). Boş bırakın; başlıktan üretilir. Kaydettikten sonra değiştirilemez.", { max: 120, pattern: "^[a-z0-9-]*$" }),
    { name: "date", type: "date", required: true, help: "Yayın tarihi. Yazılar yeniden eskiye sıralanır." },
    long("summary", "Listede görünen 1-2 cümlelik özet.", { required: true, max: 400 }),
    { name: "body", type: "editor", required: true, help: "Yazının metni. Başlık, liste ve bağlantı kullanabilirsiniz." },
    image("cover", "Kapak fotoğrafı. Boşsa kapak görünmez. " + IMG),
    position(), published(),
  ], PUBLISHED)

  // ---------- panel ve sunucu ayarları ----------
  const s = app.settings()
  s.meta.appName = "Örnek Site Yönetimi"
  s.meta.hideControls = true
  s.logs.maxDays = 14
  s.backups.cron = "0 3 * * *"
  s.backups.cronMaxKeep = 7
  s.rateLimits.enabled = true
  s.rateLimits.rules = [
    { label: "*:auth", audience: "", duration: 3, maxRequests: 5 },
    { label: "/api/", audience: "", duration: 10, maxRequests: 300 },
    // build görselleri aynı anda çeker; dosya indirme için geniş sınır
    { label: "*:file", audience: "", duration: 10, maxRequests: 100000 },
  ]
  s.trustedProxy.headers = ["X-Forwarded-For"]
  s.trustedProxy.useLeftmostIP = false
  app.save(s)

  // kullanılmayan varsayılan users koleksiyonu (boşsa)
  try {
    const users = app.findCollectionByNameOrId("users")
    if (app.countRecords("users") === 0) app.delete(users)
  } catch (_) { /* zaten yok */ }
}, (app) => {
  for (const name of ["posts", "settings"]) {
    try { app.delete(app.findCollectionByNameOrId(name)) } catch (_) {}
  }
})
