/// <reference path="../../pb_data/types.d.ts" />

// ORTAK (core): template'ten gelir, sitede elle değiştirilmez. Kurallar pb_hooks/site.js RULES'ta.
//
// Panel korumaları. Müşteri superuser olduğu için API kuralları değil, istek (request) hook'ları kullanılır;
// panele de API'ye de uygulanır, migration ve sistem işlerini etkilemez. Kural alanları:
// - label: hata iletisinde görünen ad
// - singleton: tek kayıt; ikinci kayıt açılamaz
// - noCreate: yeni kayıt açılamaz (sabit sayfalar)
// - noDelete: silinemez; deleteHint iletinin ikinci yarısı (varsayılan: "metni değiştirin.")
// - alwaysPublished: "published" işareti kaldırılamaz
// - slugFrom: slug boşsa bu alandan üretilir (Türkçe karakterler sadeleşir, benzersiz yapılır)
// - locked: kaydedildikten sonra değiştirilemeyen alanlar (adres, anahtar)

const rules = () => require(`${__hooks}/site.js`).RULES

function slugify(s) {
  const map = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" }
  return String(s || "")
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .toLowerCase()
    .replace(/̇/g, "")
    .replace(/[çğıöşüâîû]/g, (ch) => map[ch])
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
    .replace(/-+$/, "")
}

function taken(collection, value, exceptId) {
  return $app.countRecords(collection, $dbx.hashExp({ slug: value }), $dbx.not($dbx.hashExp({ id: exceptId || "" }))) > 0
}

/** slug boşsa başlıktan benzersiz bir adres üretir. */
function fillSlug(record, rule) {
  if (!rule.slugFrom || record.getString("slug")) return
  const name = record.collection().name
  const base = slugify(record.getString(rule.slugFrom)) || "kayit"
  let candidate = base
  for (let i = 2; taken(name, candidate, record.id); i++) candidate = `${base}-${i}`
  record.set("slug", candidate)
}

function beforeCreate(e) {
  const name = e.record.collection().name
  const rule = rules()[name]
  if (!rule) return
  if (rule.noCreate) throw new BadRequestError(`${rule.label} koleksiyonuna yeni kayıt eklenemez; var olan kayıtları düzenleyin.`)
  if (rule.singleton && $app.countRecords(name) > 0) throw new BadRequestError(`${rule.label} tek kayıttır; yeni kayıt açmak yerine var olan kaydı düzenleyin.`)
  fillSlug(e.record, rule)
}

function beforeUpdate(e) {
  const rule = rules()[e.record.collection().name]
  if (!rule) return
  const original = e.record.original()
  for (const field of rule.locked || []) {
    const before = original.getString(field)
    if (before && e.record.getString(field) !== before) {
      throw new BadRequestError(`"${field}" alanı değiştirilemez (sitedeki bağlantılar buna bağlı). Eski değer: ${before}`)
    }
  }
  if (rule.alwaysPublished && !e.record.getBool("published")) throw new BadRequestError("Bu sayfa gizlenemez; \"published\" işaretli kalmalı.")
  fillSlug(e.record, rule)
}

function beforeDelete(e) {
  const rule = rules()[e.record.collection().name]
  if (rule && rule.noDelete) throw new BadRequestError(`${rule.label} kayıtları silinemez; ${rule.deleteHint || "metni değiştirin."}`)
}

module.exports = { slugify, beforeCreate, beforeUpdate, beforeDelete }
