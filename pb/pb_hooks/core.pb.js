/// <reference path="../pb_data/types.d.ts" />

// ORTAK (core): template'ten `bun run core:sync` ile gelir, sitede elle değiştirilmez.
// Siteye özel değerler (ID, içerik koleksiyonları, panel korumaları) pb_hooks/site.js'te.
// Not: hook handler'ları izole çalışır; ortak kod handler içinde require() ile yüklenir.
// Üst düzeydeki değerler yalnız kayıt sırasında (hangi koleksiyon, hangi adres) kullanılır.
const SITE = require(`${__hooks}/site.js`)
const PROTECTED = Object.keys(SITE.RULES)

// İçerik değişince Cloudflare Pages yeniden yayınlansın: değişiklik işaretlenir, cron sessizlikten sonra tetikler.
onRecordAfterCreateSuccess((e) => {
  require(`${__hooks}/lib/deploy.js`).markDirty(e.app)
  e.next()
}, ...SITE.CONTENT)

onRecordAfterUpdateSuccess((e) => {
  require(`${__hooks}/lib/deploy.js`).markDirty(e.app)
  e.next()
}, ...SITE.CONTENT)

onRecordAfterDeleteSuccess((e) => {
  require(`${__hooks}/lib/deploy.js`).markDirty(e.app)
  e.next()
}, ...SITE.CONTENT)

// Panel korumaları (tek kayıt, sabit kayıtlar, kilitli adresler): kurallar site.js RULES'ta, uygulama lib/protect.js'te.
// RULES boşsa kayıt yapılmaz (koleksiyonsuz hook bütün koleksiyonlara bağlanırdı).
if (PROTECTED.length) {
  onRecordCreateRequest((e) => {
    require(`${__hooks}/lib/protect.js`).beforeCreate(e)
    e.next()
  }, ...PROTECTED)

  onRecordUpdateRequest((e) => {
    require(`${__hooks}/lib/protect.js`).beforeUpdate(e)
    e.next()
  }, ...PROTECTED)

  onRecordDeleteRequest((e) => {
    require(`${__hooks}/lib/protect.js`).beforeDelete(e)
    e.next()
  }, ...PROTECTED)
}

cronAdd(`${SITE.ID}_deploy`, "* * * * *", () => {
  require(`${__hooks}/lib/deploy.js`).flush($app, false)
})

// Elle yeniden yayınlama: POST /api/<ID>/deploy (superuser token ile)
routerAdd("POST", `/api/${SITE.ID}/deploy`, (e) => {
  const result = require(`${__hooks}/lib/deploy.js`).flush(e.app, true)
  return e.json(result.ok ? 200 : 500, result)
}, $apis.requireSuperuserAuth())
