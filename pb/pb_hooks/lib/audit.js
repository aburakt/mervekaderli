/// <reference path="../../pb_data/types.d.ts" />

// ORTAK (core): template'ten gelir, sitede elle değiştirilmez.
// Değişiklik kaydı: panelden yapılan her içerik değişikliği audit_log'a yazılır (kim, ne zaman, hangi kayıt, hangi alanlar).
// Değerler değil yalnız alan adları saklanır. audit_log koleksiyonu yoksa (eski site) hiçbir şey yapılmaz.
const COLLECTION = "audit_log"
const KEEP_DAYS = 180

function enabled(app) {
  try {
    app.findCollectionByNameOrId(COLLECTION)
    return true
  } catch {
    return false
  }
}

function title(record) {
  const field = record.collection().fields.find((f) => f.presentable)
  return field ? String(record.get(field.name) || "").slice(0, 200) : ""
}

function changedFields(record) {
  const before = record.original()
  return record.collection().fields
    .filter((f) => !f.system && f.type !== "autodate" && JSON.stringify(record.get(f.name)) !== JSON.stringify(before.get(f.name)))
    .map((f) => f.name)
}

module.exports = {
  COLLECTION,

  /** e.next()'ten ÖNCE çağrılır: güncellemede değişen alanları kaydedilmeden önce yakalar. */
  before(e, action) {
    return { action, fields: action === "update" ? changedFields(e.record) : [], title: title(e.record) }
  },

  /** e.next() başarılı olduktan SONRA çağrılır. Hata isteği bozmaz. */
  write(e, info) {
    if (!enabled(e.app)) return
    if (info.action === "update" && info.fields.length === 0) return
    try {
      const log = new Record(e.app.findCollectionByNameOrId(COLLECTION))
      log.set("actor", e.auth ? e.auth.email() : "")
      log.set("action", info.action)
      log.set("collection_name", e.record.collection().name)
      log.set("record_id", e.record.id)
      log.set("title", info.title || title(e.record))
      log.set("fields", info.fields)
      e.app.save(log)
    } catch (err) {
      require(`${__hooks}/lib/report.js`).error(e.app, "Değişiklik kaydı yazılamadı", { error: String(err) })
    }
  },

  /** KEEP_DAYS günden eski kayıtları siler. */
  prune(app) {
    if (!enabled(app)) return 0
    const cutoff = new Date(Date.now() - KEEP_DAYS * 24 * 3600 * 1000).toISOString().replace("T", " ")
    const old = app.findRecordsByFilter(COLLECTION, "created < {:cutoff}", "", 500, 0, { cutoff })
    for (const r of old) app.delete(r)
    return old.length
  },
}
