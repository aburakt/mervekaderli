/// <reference path="../pb_data/types.d.ts" />

// SİTEYE ÖZEL: Yönlendirmeler kaydedilmeden önce kontrol edilir (biçim, tekrar, döngü); kural lib/redirects.js'te.
// Hatalı kayıt panelde Türkçe iletiyle reddedilir, böylece build'deki son kontrol (site/src/lib/redirects.ts) kırılmaz.
// Handler'lar izole çalışır; kod handler içinde require() ile yüklenir.
onRecordCreateRequest((e) => {
  require(`${__hooks}/lib/redirects.js`).check(e)
  e.next()
}, "redirects")

onRecordUpdateRequest((e) => {
  require(`${__hooks}/lib/redirects.js`).check(e)
  e.next()
}, "redirects")
