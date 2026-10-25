/// <reference path="../pb_data/types.d.ts" />

// SİTEYE ÖZEL (template örneği): Site Ayarları'na Cloudflare Web Analytics anahtarı. Doluysa layout çerezsiz ziyaret
// sayacını (static.cloudflareinsights.com/beacon.min.js) dış betik olarak ekler; CSP izni site/public/_headers'ta.
migrate((app) => {
  const c = app.findCollectionByNameOrId("settings")
  c.fields.add(new TextField({
    name: "cf_analytics_token",
    max: 64,
    pattern: "^[0-9a-f]{32}$",
    help: "Ziyaret istatistiği (Cloudflare Web Analytics, çerezsiz). Cloudflare panelinde Analytics & Logs > Web Analytics > Add a site ile alınan kodda \"token\" değerinin 32 karakteri. Boşsa istatistik toplanmaz. Emin değilseniz dokunmayın.",
  }))
  app.save(c)
}, (app) => {
  const c = app.findCollectionByNameOrId("settings")
  c.fields.removeByName("cf_analytics_token")
  app.save(c)
})
