/// <reference path="../../pb_data/types.d.ts" />

// ORTAK (core): template'ten gelir, sitede elle değiştirilmez.
//
// Kısıtlı superuser. PocketBase panelini yalnız superuser açabildiği için müşteriye de superuser hesabı verilir;
// bu dosya onu içerik yöneticisine indirir. Ajans hesapları (PB_AGENCY_EMAILS, virgülle ayrılmış e-postalar)
// her şeyi yapabilir; diğer superuser'lar yalnız içerik kayıtlarını ekler, düzenler, siler ve kendi şifresini değiştirir.
// Engellenenler: koleksiyon/şema değişikliği, koleksiyonu boşaltma, ayarlar (SMTP, S3, rate limit), yedek alma/geri yükleme,
// cron çalıştırma, başka superuser açma/silme/düzenleme, kimliğe bürünme. Migration ve CLI bu kurallardan etkilenmez.

const MSG = "Bu işlem yalnız site yöneticisine (ajans) açıktır. İçerik kayıtlarını düzenleyebilirsiniz."

function agencyEmails() {
  return String($os.getenv("PB_AGENCY_EMAILS") || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

/** Kısıtlanacak hesap mı: superuser ama ajans listesinde değil. */
function restricted(auth) {
  if (!auth || !auth.isSuperuser()) return false
  return !agencyEmails().includes(String(auth.email()).toLowerCase())
}

// Superuser'ın kullanabildiği yönetim adresleri. Kayıt ve oturum adresleri (records, auth-*, request-*, confirm-*) serbest.
const OPEN = /^\/api\/collections\/[^/]+\/(records|auth-[^/]+|request-[^/]+|confirm-[^/]+)(\/|$)/
const ADMIN = /^\/api\/(collections|settings|backups|crons)(\/|$)/

/** routerUse: yönetim adreslerinde okuma dışındaki istekleri kısıtlı hesaba kapatır. */
function request(e) {
  const method = e.request.method
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return
  const path = e.request.url.path
  if (!ADMIN.test(path) || OPEN.test(path)) return
  if (restricted(e.auth)) throw new ForbiddenError(MSG)
}

/** _superusers kayıtları: kısıtlı hesap yalnız kendi kaydını düzenler, e-postasını değiştiremez. */
function superusers(e, action) {
  if (!restricted(e.auth)) return
  if (action === "update" && e.record.id === e.auth.id) {
    if (String(e.record.original().getString("email")).toLowerCase() !== String(e.record.getString("email")).toLowerCase()) {
      throw new ForbiddenError("Hesap e-postası değiştirilemez; şifrenizi değiştirebilirsiniz.")
    }
    return
  }
  throw new ForbiddenError(MSG)
}

module.exports = { restricted, request, superusers }
