/// <reference path="../../pb_data/types.d.ts" />

// ORTAK (core): template'ten gelir, sitede elle değiştirilmez. Ayarlar pb_hooks/site.js LANG'da; rehber docs/i18n.md.
//
// İsteğe bağlı çok dillilik: dil korumaları. Tek dilli sitede (LANG yok ya da langs tek dil) hiçbir şey yapmaz;
// i18n.pb.js hook bile kaydetmez. Müşteri superuser olduğu için kontroller istek (request) hook'larındadır:
// panele ve API'ye uygulanır, migration ve tohumlamaya değil. LANG alanları:
// - langs: site dilleri, ilki varsayılan değil; default ayrıca yazılır (ör. ["tr", "en"], default: "tr")
// - reserved: kayıt adresi (slug) olamayacak değerler; site/src/lib/i18n.ts RESERVED_SLUGS ile aynı (test ölçer)
// - rules: koleksiyon başına kural; alanların anlamı:
//   - label: hata iletisinde görünen ad
//   - perLang: dil başına tek kayıt (settings gibi). Yeni dilde bir kez açılır, silinemez, dili değişmez.
//     (core RULES'taki singleton bunun yerine kaldırılır.)
//   - grouped: kayıtlar translation_group ile eşleşir; aynı grupta aynı dil iki kez, aynı dilde aynı adres iki kez olamaz. Grup boşsa
//     adresten (slug) doldurulur: kayıt çevirisiz başlar, çevirisi aynı grup değeriyle açılır.
//   - fixed: silinemeyen hazır gruplar (ör. ["home", "contact"]); dil, adres ve grup değiştirilemez.
//   - alwaysPublished: yayından kaldırılamayan gruplar (ör. ["home"]).
// Kuralı olan her koleksiyonda: lang langs'tan biri olmalı, slug reserved'den biri olamaz.

/** Etkin ayar: tek dilliyse null (hiçbir kontrol çalışmaz). */
function active(lang) {
  if (!lang || !Array.isArray(lang.langs) || lang.langs.length < 2) return null
  return { langs: lang.langs, reserved: lang.reserved || [], rules: lang.rules || {} }
}

/** Hook kaydı yapılacak koleksiyonlar (tek dilli sitede boş). */
function collections(lang) {
  const cfg = active(lang)
  return cfg ? Object.keys(cfg.rules) : []
}

const label = (rule, name) => rule.label || name

/**
 * Saf karar fonksiyonu (PB'siz test edilir). rec/prev: { id, lang, slug, group, published }.
 * count(where, exceptId): koleksiyonda where'e uyan (exceptId dışındaki) kayıt sayısı.
 * Dönen değer: hata iletisi ya da "" (geçer). Kaydı değiştirmez.
 */
function check(op, name, rec, prev, count, lang) {
  const cfg = active(lang)
  const rule = cfg && cfg.rules[name]
  if (!rule) return ""
  const fixed = rule.fixed || []
  const what = label(rule, name)

  if (op === "delete") {
    if (rule.perLang) return `${what} kayıtları silinemez (her dilde bir tane olmalı); metinleri değiştirin.`
    if (rule.grouped && fixed.indexOf(rec.group) !== -1) return `${what}: bu kayıt sitenin hazır sayfalarından biri ve silinemez. Gizlemek için "published" işaretini kaldırın.`
    return ""
  }

  if (cfg.langs.indexOf(rec.lang) === -1) return `${what}: dil "${rec.lang}" geçersiz; şunlardan biri olmalı: ${cfg.langs.join(", ")}.`
  if (rec.slug && cfg.reserved.indexOf(rec.slug) !== -1) return `${what}: "${rec.slug}" adresi ayrılmış (sitenin kendi yollarıyla çakışır); başka bir adres yazın.`

  if (op === "update") {
    let locked = []
    if (rule.perLang) locked = ["lang"]
    else if (rule.grouped && fixed.indexOf(prev.group) !== -1) locked = ["lang", "slug", "group"]
    for (const f of locked) {
      if (rec[f] !== prev[f]) {
        const field = f === "group" ? "translation_group" : f
        return `"${field}" bu kayıtta değiştirilemez (sitenin sayfaları ve bağlantıları buna bağlı). Eski değer: ${prev[f]}`
      }
    }
    if (rule.grouped && (rule.alwaysPublished || []).indexOf(prev.group) !== -1 && !rec.published) {
      return `${what}: bu sayfa yayından kaldırılamaz ("published" işaretli kalmalı).`
    }
  }

  if (rule.perLang && count({ lang: rec.lang }, rec.id) > 0) {
    return `${what}: "${rec.lang}" dili için kayıt zaten var; yeni kayıt açmak yerine onu düzenleyin.`
  }
  if (rule.grouped) {
    if (!rec.group) return `${what}: "translation_group" boş; adres (slug) ya da grup yazın.`
    if (rec.slug && count({ slug: rec.slug, lang: rec.lang }, rec.id) > 0) {
      return `${what}: "${rec.lang}" dilinde "${rec.slug}" adresli kayıt zaten var; başka bir adres yazın.`
    }
    if (count({ translation_group: rec.group, lang: rec.lang }, rec.id) > 0) {
      return `${what}: "${rec.group}" grubunda "${rec.lang}" dilinde kayıt zaten var (bir kaydın her dilde tek çevirisi olur).`
    }
  }
  return ""
}

// ---------- PB tarafı (yalnız hook içinde çalışır) ----------

const siteFile = () => require(`${__hooks}/site.js`)

function plain(record) {
  return {
    id: record.id,
    lang: record.getString("lang"),
    slug: record.getString("slug"),
    group: record.getString("translation_group"),
    published: record.getBool("published"),
  }
}

function run(op, e) {
  const app = e.app
  const record = e.record
  const site = siteFile()
  const lang = site.LANG
  const cfg = active(lang)
  const name = record.collection().name
  const rule = cfg && cfg.rules[name]
  if (!rule) return
  if (op !== "delete") {
    // PB hook dosyalarını sırasız yükler: core.pb.js'teki panel koruması (slug üretimi dahil) bundan sonra da çalışabilir.
    // Adres burada denetlendiği için koruma önce burada çağrılır; tekrar çalışması zararsızdır (aynı kontroller, slug doluysa dokunmaz).
    if (site.RULES && site.RULES[name]) {
      const protect = require(`${__hooks}/lib/protect.js`)
      if (op === "create") protect.beforeCreate(e)
      else protect.beforeUpdate(e)
    }
    // grup boşsa adresten doldurulur: kayıt çevirisiz başlar, çevirisi aynı grup koduyla açılır
    if (rule.grouped && !record.getString("translation_group") && record.getString("slug")) {
      record.set("translation_group", record.getString("slug"))
    }
  }
  const count = (where, exceptId) => app.countRecords(name, $dbx.hashExp(where), $dbx.not($dbx.hashExp({ id: exceptId || "" })))
  const msg = check(op, name, plain(record), op === "update" ? plain(record.original()) : null, count, lang)
  if (msg) throw new BadRequestError(msg)
}

module.exports = {
  active,
  collections,
  check,
  beforeCreate: (e) => run("create", e),
  beforeUpdate: (e) => run("update", e),
  beforeDelete: (e) => run("delete", e),
}
