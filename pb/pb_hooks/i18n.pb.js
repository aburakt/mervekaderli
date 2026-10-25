/// <reference path="../pb_data/types.d.ts" />

// ORTAK (core): template'ten gelir, sitede elle değiştirilmez. Ayarlar pb_hooks/site.js LANG'da; rehber docs/i18n.md.
// İsteğe bağlı çok dillilik: dil başına tek kayıt, çeviri grupları, hazır sayfalar, ayrılmış adresler (lib/i18n.js).
// Tek dilli sitede (LANG yok ya da tek dil) hiçbir hook kaydedilmez: davranış değişmez.
// Not: PB hook dosyalarını sırasız yükler; slug üretimi (core protect.js) lib/i18n.js içinde önce çağrılır.
// Hook dosyaları aynı global kapsamı paylaşır: ad diğer dosyalarla çakışmasın diye önekli.
const I18N_COLLECTIONS = require(`${__hooks}/lib/i18n.js`).collections(require(`${__hooks}/site.js`).LANG)

if (I18N_COLLECTIONS.length) {
  onRecordCreateRequest((e) => {
    require(`${__hooks}/lib/i18n.js`).beforeCreate(e)
    e.next()
  }, ...I18N_COLLECTIONS)

  onRecordUpdateRequest((e) => {
    require(`${__hooks}/lib/i18n.js`).beforeUpdate(e)
    e.next()
  }, ...I18N_COLLECTIONS)

  onRecordDeleteRequest((e) => {
    require(`${__hooks}/lib/i18n.js`).beforeDelete(e)
    e.next()
  }, ...I18N_COLLECTIONS)
}
