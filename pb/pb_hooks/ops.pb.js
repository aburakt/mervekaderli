/// <reference path="../pb_data/types.d.ts" />

// ORTAK (core): template'ten gelir, sitede elle değiştirilmez.
// Operasyon: sunucu sürüm özeti (sapma kontrolü) ve değişiklik kaydı (audit_log). Kurallar lib/version.js ve lib/audit.js başında.
// Hook dosyaları aynı global kapsamı paylaşır (core.pb.js SITE tanımlar), bu yüzden farklı ad.
const OPS_SITE = require(`${__hooks}/site.js`)

// Sapma kontrolü: GET /api/<ID>/core-version (herkese açık; yalnız dosya özetleri ve migration adları döner)
routerAdd("GET", `/api/${OPS_SITE.ID}/core-version`, (e) => e.json(200, require(`${__hooks}/lib/version.js`).snapshot(e.app)))

// Değişiklik kaydı: yalnız panelden/API'den gelen içerik değişiklikleri (CONTENT koleksiyonları)
onRecordCreateRequest((e) => {
  const audit = require(`${__hooks}/lib/audit.js`)
  const info = audit.before(e, "create")
  e.next()
  audit.write(e, info)
}, ...OPS_SITE.CONTENT)

onRecordUpdateRequest((e) => {
  const audit = require(`${__hooks}/lib/audit.js`)
  const info = audit.before(e, "update")
  e.next()
  audit.write(e, info)
}, ...OPS_SITE.CONTENT)

onRecordDeleteRequest((e) => {
  const audit = require(`${__hooks}/lib/audit.js`)
  const info = audit.before(e, "delete")
  e.next()
  audit.write(e, info)
}, ...OPS_SITE.CONTENT)

cronAdd(`${OPS_SITE.ID}_audit_prune`, "30 3 * * *", () => {
  require(`${__hooks}/lib/audit.js`).prune($app)
})
