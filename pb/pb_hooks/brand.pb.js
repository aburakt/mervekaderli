/// <reference path="../pb_data/types.d.ts" />

// ORTAK (core): template'ten gelir, sitede elle değiştirilmez (bun run core:sync).
//
// Marka (site.js BRAND, lib/brand.js):
// 1. Sistem e-postaları: yönetim paneli hesaplarının (_superusers) parola sıfırlama, tek kullanımlık şifre, e-posta
//    değişikliği, doğrulama ve yeni konumdan giriş e-postaları her açılışta lib/mail.js şablonlarına eşitlenir
//    (yalnız fark varsa kaydedilir). Şablonların sahibi core'dur: panelden yapılan değişiklik sonraki açılışta geri alınır.
// 2. Panel logosu ve sekme simgesi: panel CSP'si dış adresten görsele izin vermez (img-src 'self'), bu yüzden PB kendi
//    adresinden verir: GET /api/<ID>/brand/logo ve /brand/icon (sunucu bir kez indirir, önbellekte tutar). panel/brand.js kullanır.
// Uygulama düzeyinde kayıt (app.save) guard.js'in istek kurallarına takılmaz; müşteri hesabı da şablonları değiştiremez.
{
  const BRAND_SITE = require(`${__hooks}/site.js`)

  // JSVM'de onServe yok; onBootstrap her açılışta (serve ve CLI komutları) veritabanı hazır olunca çalışır.
  onBootstrap((e) => {
    e.next()
    try {
      if (require(`${__hooks}/lib/mail.js`).apply(e.app)) e.app.logger().info("E-posta şablonları markaya göre güncellendi")
    } catch (err) {
      require(`${__hooks}/lib/report.js`).error(e.app, "E-posta şablonları güncellenemedi", { error: String(err) })
    }
  })

  // Panel logosu ve sekme simgesi (herkese açık; giriş ekranında da görünür). Yalnız site.js BRAND'deki sabit adresler
  // indirilir (lib/brand.js fetchImage). JSVM'de işleyiciler dış kapsamı görmez: her biri modülü kendisi yükler.
  routerAdd("GET", `/api/${BRAND_SITE.ID}/brand/logo`, (e) => {
    const img = require(`${__hooks}/lib/brand.js`).fetchImage(e.app, "logo")
    if (!img) throw new NotFoundError("Logo yok.")
    e.response.header().set("Cache-Control", "public, max-age=3600")
    e.response.header().set("Content-Security-Policy", "default-src 'none'")
    return e.blob(200, img.type, img.body)
  })
  routerAdd("GET", `/api/${BRAND_SITE.ID}/brand/icon`, (e) => {
    const img = require(`${__hooks}/lib/brand.js`).fetchImage(e.app, "icon")
    if (!img) throw new NotFoundError("Simge yok.")
    e.response.header().set("Cache-Control", "public, max-age=3600")
    e.response.header().set("Content-Security-Policy", "default-src 'none'")
    return e.blob(200, img.type, img.body)
  })
}
