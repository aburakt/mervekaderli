/// <reference path="../pb_data/types.d.ts" />

// new-site: panel adı. scripts/new-site.ts üretti. Yayına çıktıktan sonra düzenlenmez; ad değişirse yeni migration eklenir.
migrate((app) => {
  const s = app.settings()
  s.meta.appName = "Merve Kaderli Ceramic Studio Yönetimi"
  app.save(s)
}, (app) => {
  const s = app.settings()
  s.meta.appName = "Örnek Site Yönetimi"
  app.save(s)
})
