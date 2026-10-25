// SİTEYE ÖZEL: panelde yönlendirme kaydı kontrolü (redirects.pb.js çağırır). PB'ye bağlı değil; tests/redirects.test.ts de yükler.
// Build tarafındaki tam kontrol (sabit satırlarla birlikte) site/src/lib/redirects.ts'te; buradaki kurallar onunla aynıdır.

/** "/a/" ile "/a" aynı adres sayılır. */
function key(path) {
  const p = String(path || "").trim()
  return p.length > 1 ? p.replace(/\/+$/, "") : p
}
const dynamic = (from) => /[*:]/.test(from)
const internal = (to) => to.startsWith("/")

/**
 * Yeni ya da düzenlenen kaydın sorunu (yoksa ""). rules: diğer bütün kayıtlar [{ from, to }].
 * Kontroller: eski adres / ile başlar, aynı eski adres iki kez yok, kendine ya da zincirle başa dönen yönlendirme yok.
 */
function problem(rules, candidate) {
  const from = String(candidate.from || "").trim()
  const to = String(candidate.to || "").trim()
  if (!from.startsWith("/")) return "Eski adres / ile başlamalı (alan adı yazılmaz)."
  if (!to.startsWith("/") && !/^https?:\/\//.test(to)) return "Yeni adres / ile ya da https:// ile başlamalı."
  if (rules.some((r) => key(r.from) === key(from))) return `"${from}" için zaten bir yönlendirme var; onu düzenleyin.`
  if (internal(to) && key(to) === key(from)) return "Eski ve yeni adres aynı; yönlendirme kendine döner."
  if (from.endsWith("*") && internal(to) && to.startsWith(from.slice(0, -1))) return "Yeni adres eski adresin kapsamında; yönlendirme kendine döner."
  if (dynamic(from) || !internal(to)) return ""
  const next = new Map(rules.filter((r) => !dynamic(r.from) && internal(r.to)).map((r) => [key(r.from), key(r.to)]))
  let cur = key(to)
  for (let i = 0; i < 50 && next.has(cur); i++) {
    cur = next.get(cur)
    if (cur === key(from)) return `Yönlendirme döngüsü: ${to} adresi zincirle tekrar ${from} adresine dönüyor.`
  }
  return ""
}

/** PB hook'u: kayıt diğer bütün yönlendirmelerle birlikte kontrol edilir; sorun varsa panelde Türkçe iletiyle reddedilir. */
function check(e) {
  const others = e.app.findAllRecords("redirects")
    .filter((r) => r.id !== e.record.id)
    .map((r) => ({ from: r.getString("from"), to: r.getString("to") }))
  const msg = problem(others, { from: e.record.getString("from"), to: e.record.getString("to") })
  if (msg) throw new BadRequestError(msg)
}

module.exports = { key, problem, check }
