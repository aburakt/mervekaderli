/// <reference path="../../pb_data/types.d.ts" />

// ORTAK (core): template'ten gelir, sitede elle değiştirilmez.
// Her sitenin kendi PB süreci olduğu için store anahtarı sabit olabilir.
const KEY = "deploy_dirty_at"

function quietMs() {
  return parseInt($os.getenv("DEPLOY_QUIET_MS"), 10) || 45 * 1000
}

module.exports = {
  markDirty(app) {
    app.store().set(KEY, Date.now())
  },

  /**
   * Bekleyen değişiklik varsa Cloudflare Pages deploy hook'unu çağırır.
   * force=true ise bekleme süresini ve dirty işaretini yok sayar.
   */
  flush(app, force) {
    const store = app.store()
    const dirtyAt = store.get(KEY)
    if (!force) {
      if (!dirtyAt) return { ok: true, skipped: "no changes" }
      if (Date.now() - Number(dirtyAt) < quietMs()) return { ok: true, skipped: "waiting" }
    }
    store.remove(KEY)

    const url = $os.getenv("CF_PAGES_DEPLOY_HOOK")
    if (!url) {
      app.logger().warn("CF_PAGES_DEPLOY_HOOK tanımlı değil, deploy tetiklenmedi")
      return { ok: false, error: "CF_PAGES_DEPLOY_HOOK is not set" }
    }

    try {
      const res = $http.send({ url, method: "POST", timeout: 30 })
      const ok = res.statusCode >= 200 && res.statusCode < 300
      if (ok) {
        app.logger().info("Cloudflare Pages deploy tetiklendi", "status", res.statusCode)
      } else {
        // başarısızsa bir sonraki dakikada tekrar denensin
        store.set(KEY, Date.now() - quietMs())
        require(`${__hooks}/lib/report.js`).error(app, "Cloudflare Pages deploy hook hatası", { status: res.statusCode, body: toString(res.body).slice(0, 500) })
      }
      return { ok, status: res.statusCode }
    } catch (err) {
      store.set(KEY, Date.now() - quietMs())
      // deploy bağlantısı gizli anahtardır: hata metninden çıkar
      const msg = String(err).split(url).join("<deploy-hook>")
      require(`${__hooks}/lib/report.js`).error(app, "Cloudflare Pages deploy hook çağrılamadı", { error: msg })
      return { ok: false, error: msg }
    }
  },
}
