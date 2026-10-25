/// <reference path="../pb_data/types.d.ts" />

// ORTAK (core): template'ten `bun run core:sync` ile gelir, sitede elle değiştirilmez.
// Ziyaretçi formları: hangi koleksiyonlar site.js FORMS'ta, ayarlar FORM_OPTIONS'ta, uygulama lib/forms.js'te.
// Not: hook handler'ları izole çalışır; ortak kod handler içinde require() ile yüklenir.
// *.pb.js dosyaları aynı üst kapsamı paylaşır (core.pb.js'te SITE var): değişkenler bu blokta kalır.
{
  const FORMS_SITE = require(`${__hooks}/site.js`)
  const FORMS = FORMS_SITE.FORMS || []

  // FORMS boşsa kayıt yapılmaz (koleksiyonsuz hook bütün koleksiyonlara bağlanırdı).
  if (FORMS.length) {
    // Ziyaretçi gönderimi: KVKK onayı, spam tuzağı (status), personel alanları
    onRecordCreateRequest((e) => {
      require(`${__hooks}/lib/forms.js`).beforeCreate(e)
      e.next()
    }, ...FORMS)

    // Spam değilse e-posta bildirimi (hata loglanır, gönderimi bozmaz)
    onRecordAfterCreateSuccess((e) => {
      e.next()
      require(`${__hooks}/lib/forms.js`).notify(e.app, e.record)
    }, ...FORMS)

    // KVKK saklama süresi: her gece eski gönderimler silinir
    cronAdd(`${FORMS_SITE.ID}_forms_retention`, "30 3 * * *", () => {
      require(`${__hooks}/lib/forms.js`).purge($app)
    })
  }
}
