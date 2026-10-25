/// <reference path="../pb_data/types.d.ts" />

/**
 * Örnek ziyaretçi formu: İletişim mesajları (messages) ve Site Ayarları'na bildirim alıcısı (form_recipient).
 * Ziyaretçi yalnız gönderir (createRule ""), okuma ve yönetim yalnız superuser (null). Kutu site.js FORMS'ta;
 * spam tuzağı, KVKK onayı, e-posta bildirimi ve saklama süresi ortak pb_hooks/forms.pb.js'te.
 * Formu olmayan sitede bu dosya silinir (ve FORMS boş bırakılır).
 */
migrate((app) => {
  const settings = app.findCollectionByNameOrId("settings")
  settings.fields.add(new EmailField({
    name: "form_recipient",
    help: "İletişim formu bildirimlerinin gideceği e-posta. Boşsa sunucudaki varsayılan adres kullanılır. Sitede görünmez.",
  }))
  app.save(settings)

  app.save(new Collection({
    type: "base",
    name: "messages",
    listRule: null, viewRule: null, createRule: "", updateRule: null, deleteRule: null,
    fields: [
      {
        name: "status", type: "select", maxSelect: 1, values: ["new", "contacted", "closed", "spam"],
        help: "Mesajın durumu: new = yeni, contacted = dönüş yapıldı, closed = kapandı, spam = istenmeyen (bot tuzağına takılanlar otomatik spam olur).",
      },
      { name: "name", type: "text", required: true, max: 200, presentable: true, help: "Ziyaretçinin formda yazdığı ad soyad." },
      { name: "email", type: "email", required: true, help: "Ziyaretçinin e-postası. Bildirim e-postasını yanıtlarsanız bu adrese gider." },
      { name: "phone", type: "text", max: 50, help: "Ziyaretçinin telefonu (isteğe bağlı)." },
      { name: "message", type: "text", required: true, max: 5000, help: "Ziyaretçinin mesajı." },
      { name: "kvkk_consent", type: "bool", help: "Ziyaretçi KVKK aydınlatma metnini onayladı mı. Siteden onaysız gönderim kabul edilmez." },
      { name: "notes", type: "text", max: 5000, help: "Kendi notlarınız (ziyaretçi görmez). Ör. ne zaman, kim dönüş yaptı." },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
  }))

  // Bot koruması: aynı IP'den dakikada en çok 5 gönderim
  const s = app.settings()
  s.rateLimits.rules = [{ label: "messages:create", audience: "@guest", duration: 60, maxRequests: 5 }, ...s.rateLimits.rules]
  app.save(s)
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("messages")) } catch (_) {}
  try {
    const settings = app.findCollectionByNameOrId("settings")
    settings.fields.removeByName("form_recipient")
    app.save(settings)
  } catch (_) {}
  const s = app.settings()
  s.rateLimits.rules = s.rateLimits.rules.filter((r) => r.label !== "messages:create")
  app.save(s)
})
