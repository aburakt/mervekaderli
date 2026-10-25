/// <reference path="../../pb_data/types.d.ts" />

// ORTAK (core): template'ten gelir, sitede elle değiştirilmez (bun run core:sync).
//
// Markalı e-posta düzeni ve PocketBase sistem e-postaları (Türkçe). Marka site.js BRAND'dan (lib/brand.js).
// E-posta istemcileri (Gmail, Outlook) <style>, SVG ve web fontunu güvenilir göstermez: düzen tablo, stiller satır içi,
// yazı sistem fontu, logo PNG (yoksa adın kendisi marka renginde). Bu satır içi stiller sitenin CSP kuralına girmez
// (site değil, e-posta). Eklenen bütün metinler kaçışlanır; bodyHtml çağıranın hazırladığı (kaçışlanmış) HTML'dir.
//
// layout({ title, intro, bodyHtml, action: { label, url }, afterHtml, footer, brand })  → tam HTML belgesi
// templates(b, collection)  → _superusers e-posta şablonları; apply(app) bunları sunucuya yazar (brand.pb.js, her açılışta).
// Şablonlardaki {APP_NAME}, {APP_URL}, {TOKEN}, {OTP}, {ALERT_INFO} PocketBase'in yer tutucularıdır, gönderirken doldurulur.

const { brand: siteBrand, onColor, readable, mix } = require(`${__hooks}/lib/brand.js`)

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const WHITE = "#ffffff"

function esc(value) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/** Düzende kullanılan renkler: hepsi kart (beyaz) ya da dış zemin (paper) üstünde okunur. */
function palette(b) {
  return {
    color: b.color,
    // düğme yazısı: marka rengi zemininde beyaz ya da mürekkepten hangisi daha okunursa
    onColor: onColor(b.color, b.ink),
    ink: readable(b.ink, WHITE, 7, "#000000"),
    // bağlantı ve ad (wordmark): marka rengi, beyazda okunmuyorsa mürekkebe doğru koyulaşır
    link: readable(b.color, WHITE, 4.5, b.ink),
    wordmark: readable(b.color, b.paper, 3, b.ink),
    muted: readable(mix(b.ink, b.paper, 0.45), b.paper, 4.5, b.ink),
    paper: b.paper,
    line: mix(b.ink, WHITE, 0.88),
    soft: mix(b.color, WHITE, 0.93),
  }
}

function header(b, p) {
  const name = esc(b.name)
  const inner = b.logo
    // build'in ürettiği logo 400x80 px (2x), 200x40 gösterilir; Outlook genişlik/yükseklik özniteliğine bakar
    ? `<img src="${esc(b.logo)}" width="200" height="40" alt="${name}" style="display:block;margin:0 auto;width:200px;height:40px;border:0;outline:none;text-decoration:none;">`
    : `<span style="font-family:${FONT};font-size:22px;line-height:28px;font-weight:700;letter-spacing:-0.01em;color:${p.wordmark};text-decoration:none;">${name}</span>`
  return b.url ? `<a href="${esc(b.url)}" style="text-decoration:none;color:${p.wordmark};">${inner}</a>` : inner
}

function button(action, p) {
  const url = esc(action.url)
  const label = esc(action.label)
  // "bulletproof" düğme: tablo hücresi zemin rengini Outlook da gösterir
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px;">`
    + `<tr><td bgcolor="${p.color}" style="background:${p.color};border-radius:8px;">`
    + `<a href="${url}" target="_blank" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:16px;line-height:20px;font-weight:600;color:${p.onColor};text-decoration:none;border-radius:8px;">${label}</a>`
    + `</td></tr></table>`
    + `<p style="margin:12px 0 0;font-size:13px;line-height:20px;color:${p.muted};">Düğme çalışmazsa bu adresi tarayıcınıza yapıştırın:<br>`
    + `<a href="${url}" style="color:${p.link};word-break:break-all;">${url}</a></p>`
}

/**
 * Markalı e-posta: { title, intro?, bodyHtml?, action?: { label, url }, afterHtml?, footer?, brand? } → HTML.
 * Sıra: başlık, giriş, bodyHtml, düğme, afterHtml (düğmeden sonraki not). title, intro, action ve footer düz metindir
 * (kaçışlanır); bodyHtml ve afterHtml hazır HTML'dir. brand verilmezse site.js BRAND.
 */
function layout(opts) {
  const o = opts || {}
  const b = o.brand || siteBrand(typeof $app === "undefined" ? undefined : $app)
  const p = palette(b)
  const title = esc(o.title || b.name)
  const intro = o.intro ? `<p style="margin:0 0 16px;">${esc(o.intro)}</p>` : ""
  const action = o.action && o.action.url && o.action.label ? button(o.action, p) : ""
  const site = b.url ? ` · <a href="${esc(b.url)}" style="color:${p.muted};text-decoration:underline;">${esc(b.url.replace(/^https?:\/\//, ""))}</a>` : ""
  const footer = (o.footer ? `${esc(o.footer)}<br>` : "") + `<strong style="font-weight:600;">${esc(b.name)}</strong>${site}`
  // gelen kutusu önizlemesi (gizli): giriş cümlesi
  const preheader = o.intro ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${p.paper};opacity:0;">${esc(o.intro)}</div>` : ""
  return `<!doctype html>
<html lang="tr" xmlns="http://www.w3.org/1999/xhtml" style="background:${p.paper};">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${p.paper};-webkit-text-size-adjust:100%;">
${preheader}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${p.paper}" style="background:${p.paper};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">
<tr><td align="center" style="padding:0 8px 24px;">${header(b, p)}</td></tr>
<tr><td bgcolor="${WHITE}" style="background:${WHITE};border:1px solid ${p.line};border-top:4px solid ${p.color};border-radius:12px;padding:32px 32px 28px;font-family:${FONT};font-size:16px;line-height:26px;color:${p.ink};">
<h1 style="margin:0 0 16px;font-family:${FONT};font-size:22px;line-height:30px;font-weight:700;color:${p.ink};">${title}</h1>
${intro}${o.bodyHtml || ""}${action}${o.afterHtml || ""}
</td></tr>
<tr><td align="center" style="padding:20px 16px 0;font-family:${FONT};font-size:13px;line-height:20px;color:${p.muted};">${footer}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

/** Kod ve bilgi kutusu (OTP, giriş bilgisi): açık marka tonunda zemin. */
function box(html, p, big) {
  const font = big
    ? `font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:30px;line-height:40px;font-weight:700;letter-spacing:6px;`
    : `font-size:14px;line-height:22px;`
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;">`
    + `<tr><td align="${big ? "center" : "left"}" bgcolor="${p.soft}" style="background:${p.soft};border-radius:8px;padding:16px 18px;${font}color:${p.ink};">${html}</td></tr></table>`
}

const note = (text, p) => `<p style="margin:16px 0 0;font-size:14px;line-height:22px;color:${p.muted};">${esc(text)}</p>`

function minutes(seconds) {
  const n = Math.round(Number(seconds) / 60)
  return n > 0 ? n : 0
}

/**
 * Yönetim paneli hesaplarının (_superusers) e-posta şablonları. col verilirse bağlantı/şifre süreleri metne yazılır.
 * Bağlantı adresleri PocketBase'in varsayılanlarıyla aynıdır ({APP_URL}/_/#/auth/...).
 */
function templates(b, col) {
  const p = palette(b)
  const dur = (cfg) => minutes(cfg && cfg.duration)
  const valid = (n, what) => (n ? note(`${what} ${n} dakika geçerlidir.`, p) : "")
  const footer = "Bu e-postayı yönetim paneli hesabınız için aldınız."
  const mk = (subject, o) => ({ subject, body: layout(Object.assign({ brand: b, footer }, o)) })
  return {
    resetPassword: mk("{APP_NAME}: parola sıfırlama", {
      title: "Parolanızı sıfırlayın",
      intro: "Yönetim paneli hesabınız için parola sıfırlama isteği aldık. Yeni parolanızı belirlemek için aşağıdaki düğmeye tıklayın.",
      action: { label: "Parolayı sıfırla", url: "{APP_URL}/_/#/auth/confirm-password-reset/{TOKEN}" },
      afterHtml: valid(dur(col && col.passwordResetToken), "Bağlantı")
        + note("Bu isteği siz yapmadıysanız bu e-postayı yok sayabilirsiniz; parolanız değişmez.", p),
    }),
    otp: mk("{APP_NAME}: tek kullanımlık giriş şifreniz", {
      title: "Giriş şifreniz",
      intro: "Yönetim paneline girmek için tek kullanımlık şifreniz:",
      bodyHtml: box("{OTP}", p, true)
        + valid(dur(col && col.otp), "Şifre")
        + note("Şifreyi siz istemediyseniz bu e-postayı yok sayabilirsiniz.", p),
    }),
    confirmEmailChange: mk("{APP_NAME}: yeni e-posta adresinizi onaylayın", {
      title: "Yeni e-posta adresinizi onaylayın",
      intro: "Yönetim paneli hesabınızın e-posta adresini değiştirmek için aşağıdaki düğmeye tıklayın.",
      action: { label: "Yeni adresi onayla", url: "{APP_URL}/_/#/auth/confirm-email-change/{TOKEN}" },
      afterHtml: valid(dur(col && col.emailChangeToken), "Bağlantı")
        + note("Bu değişikliği siz istemediyseniz bu e-postayı yok sayabilirsiniz; adresiniz değişmez.", p),
    }),
    verification: mk("{APP_NAME}: e-posta adresinizi doğrulayın", {
      title: "E-posta adresinizi doğrulayın",
      intro: "Yönetim paneli hesabınızın e-posta adresini doğrulamak için aşağıdaki düğmeye tıklayın.",
      action: { label: "Adresimi doğrula", url: "{APP_URL}/_/#/auth/confirm-verification/{TOKEN}" },
      afterHtml: note("Bu hesabı siz açmadıysanız bu e-postayı yok sayabilirsiniz.", p),
    }),
    authAlert: mk("{APP_NAME}: hesabınıza yeni bir konumdan giriş yapıldı", {
      title: "Yeni bir konumdan giriş",
      intro: "Yönetim paneli hesabınıza yeni bir konumdan giriş yapıldı:",
      bodyHtml: box("{ALERT_INFO}", p, false)
        + `<p style="margin:0;"><strong>Bu siz değilseniz parolanızı hemen değiştirin;</strong> böylece diğer bütün oturumlar kapanır.</p>`,
      action: { label: "Panele git", url: "{APP_URL}/_/" },
      afterHtml: note("Giriş yapan sizseniz bu e-postayı yok sayabilirsiniz.", p),
    }),
  }
}

/** templates() çıktısını _superusers koleksiyonuna yazar; yalnız fark varsa kaydeder. Değiştiyse true. */
function apply(app) {
  const col = app.findCollectionByNameOrId("_superusers")
  const t = templates(siteBrand(app), col)
  const targets = [
    [col.resetPasswordTemplate, t.resetPassword],
    [col.otp.emailTemplate, t.otp],
    [col.confirmEmailChangeTemplate, t.confirmEmailChange],
    [col.verificationTemplate, t.verification],
    [col.authAlert.emailTemplate, t.authAlert],
  ]
  let changed = false
  for (const [cur, next] of targets) {
    if (cur.subject !== next.subject || cur.body !== next.body) {
      cur.subject = next.subject
      cur.body = next.body
      changed = true
    }
  }
  if (changed) app.save(col)
  return changed
}

module.exports = { esc, layout, palette, templates, apply }
