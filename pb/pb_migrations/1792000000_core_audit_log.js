/// <reference path="../pb_data/types.d.ts" />

// ORTAK (core): template'ten gelir, sitede elle değiştirilmez.
// Değişiklik Kaydı (audit_log): panelden yapılan içerik değişiklikleri pb_hooks/lib/audit.js ile buraya yazılır.
// Yalnız superuser okur; kimse elle yazamaz/silemez (kurallar null, hook app.save ile yazar). 180 günden eskiler silinir.
// Koleksiyon zaten varsa dokunmaz (her sitede aynı dosya çalışır).
migrate((app) => {
  try {
    app.findCollectionByNameOrId("audit_log")
    return
  } catch (_) {}
  app.save(new Collection({
    type: "base",
    name: "audit_log",
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { name: "actor", type: "text", max: 200, help: "Değişikliği yapan hesabın e-postası." },
      { name: "action", type: "select", maxSelect: 1, values: ["create", "update", "delete"], help: "create = eklendi, update = düzenlendi, delete = silindi." },
      { name: "collection_name", type: "text", max: 100, help: "Değişikliğin yapıldığı bölüm (koleksiyon)." },
      { name: "record_id", type: "text", max: 50, help: "Değişen kaydın numarası." },
      { name: "title", type: "text", max: 200, presentable: true, help: "Değişen kaydın başlığı ya da adı." },
      { name: "fields", type: "json", maxSize: 5000, help: "Düzenlemede değişen alanların adları (değerler saklanmaz)." },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    ],
    indexes: ["CREATE INDEX idx_audit_log_created ON audit_log (created)"],
  }))
}, (app) => {
  try {
    app.delete(app.findCollectionByNameOrId("audit_log"))
  } catch (_) {}
})
