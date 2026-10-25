/// <reference path="../pb_data/types.d.ts" />

// SİTEYE ÖZEL: Site Ayarları'na stüdyo alanları (ana sayfadaki "Stüdyo" ve "Ziyaret" bölümleri, Atölyeler sayfasının girişi).
migrate((app) => {
  const IMG = "Telefon fotoğrafı da yükleyebilirsiniz; site görseli web için kendisi küçültür."
  const c = app.findCollectionByNameOrId("settings")
  c.fields.add(new URLField({ name: "instagram", help: "Instagram sayfanızın tam adresi (https://www.instagram.com/...). Sayfa altında ve iletişim bölümünde görünür. Boşsa görünmez." }))
  c.fields.add(new TextField({ name: "hours", max: 120, help: "Stüdyonun açık olduğu gün ve saatler (ör. Her gün 10.00 – 18.00). Boşsa görünmez." }))
  c.fields.add(new TextField({ name: "about_title", max: 160, help: "Ana sayfadaki \"Stüdyo\" bölümünün başlığı." }))
  c.fields.add(new TextField({ name: "about_text", max: 3000, help: "Ana sayfadaki \"Stüdyo\" bölümünün metni. Paragrafları Enter ile ayırın." }))
  c.fields.add(new FileField({ name: "about_image", maxSelect: 1, maxSize: 20 * 1024 * 1024, mimeTypes: ["image/png", "image/jpeg", "image/webp"], help: "\"Stüdyo\" bölümünün fotoğrafı (dik çekim daha iyi durur). " + IMG }))
  c.fields.add(new TextField({ name: "workshop_intro", max: 1500, help: "Atölyeler sayfasının ve ana sayfadaki atölye bölümünün giriş metni (2-3 cümle)." }))
  app.save(c)
}, (app) => {
  const c = app.findCollectionByNameOrId("settings")
  for (const name of ["instagram", "hours", "about_title", "about_text", "about_image", "workshop_intro"]) c.fields.removeByName(name)
  app.save(c)
})
