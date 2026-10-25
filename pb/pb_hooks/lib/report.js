/// <reference path="../../pb_data/types.d.ts" />

// ORTAK (core): template'ten gelir, sitede elle değiştirilmez.
// Hook hatalarını GlitchTip'e (Sentry uyumlu) bildirir. DSN sunucu .env'inde: GLITCHTIP_DSN=https://<anahtar>@<sunucu>/<proje>.
// DSN boşsa yalnız PB loguna yazılır. Projenin hangi GlitchTip organizasyonunda olduğu DSN'e gömülüdür, kod bilmez.

function parseDsn(dsn) {
  const m = /^(https?):\/\/([^@/]+)@([^/]+)\/(\d+)\/?$/.exec(dsn || "")
  return m ? { url: `${m[1]}://${m[3]}/api/${m[4]}/store/`, key: m[2] } : null
}

module.exports = {
  parseDsn,

  /** Hatayı PB loguna yazar ve DSN tanımlıysa GlitchTip'e gönderir. Hiçbir zaman hata fırlatmaz. */
  error(app, message, extra) {
    const data = extra || {}
    app.logger().error(message, "extra", JSON.stringify(data))
    const target = parseDsn($os.getenv("GLITCHTIP_DSN"))
    if (!target) return false
    const site = require(`${__hooks}/site.js`)
    const event = {
      event_id: $security.randomStringWithAlphabet(32, "0123456789abcdef"),
      timestamp: new Date().toISOString(),
      level: "error",
      logger: "pb_hooks",
      platform: "javascript",
      message,
      server_name: `pb-${site.ID}`,
      tags: { site: site.ID },
      extra: data,
    }
    try {
      const res = $http.send({
        url: target.url,
        method: "POST",
        timeout: 10,
        headers: {
          "content-type": "application/json",
          "x-sentry-auth": `Sentry sentry_version=7, sentry_client=pb-hooks/1.0, sentry_key=${target.key}`,
        },
        body: JSON.stringify(event),
      })
      return res.statusCode >= 200 && res.statusCode < 300
    } catch (err) {
      app.logger().warn("GlitchTip'e hata gönderilemedi", "error", String(err))
      return false
    }
  },
}
