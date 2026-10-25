// ORTAK (core): template'ten gelir, sitede elle değiştirilmez (bun run core:sync).
// Panelin markası: panel-tr.pb.js bunu /_/extensions.js içinde tr.js'in ardından, window.PB_BRAND verisiyle sunar
// (veri lib/brand.js panel(): name, accent, wordmark, wordmarkLight, favicon, logo, icon).
// PocketBase 0.40 paneli logoyu ve sekme simgesini app.store'dan okur (mainLogo: giriş ekranı, headerLogo: üst çubuk,
// favicon). Logo ve simge varsa PB'nin kendi adresinden (/api/<ID>/brand/logo, /icon) yüklenir; yüklenemezse rozet +
// site adı ve baş harfli simge kalır.
// Boyutlar: giriş ekranında logo en çok 56 px yüksek / 280 px geniş, üst çubukta beyaz kutuda 28 px yüksek / 200 px geniş
// (oran korunur; logo-panel.png kenar boşluğu kırpılmış geldiği için kutuyu doldurur).
// Vurgu rengi panelin --accentColor değişkenine yazılır. PB'nin yapısı değişirse sessizce hiçbir şey yapmaz.
{
  const brand = window.PB_BRAND
  const store = window.app && window.app.store
  const set = (key, value) => {
    try {
      if (value && store && key in store && store[key] !== value) store[key] = value
    } catch {
      // panel yapısı değişti: PocketBase logosu kalır
    }
  }
  const css = (text) => {
    try {
      let el = document.getElementById("pb-brand-css")
      if (!el) {
        el = document.createElement("style")
        el.id = "pb-brand-css"
        document.head.appendChild(el)
      }
      el.textContent = text
    } catch {
      // stil eklenemedi
    }
  }

  if (brand && store) {
    set("mainLogo", brand.wordmark)
    set("headerLogo", brand.wordmarkLight)
    set("favicon", brand.favicon)
    // Vurgu rengi: PB ayarlardaki rengi satır içi yazar; markanınki öncelikli. Logo üst çubukta beyaz zemin üstünde.
    const accent = /^#[0-9a-f]{6}$/i.test(brand.accent || "") ? `:root{--accentColor:${brand.accent} !important}` : ""
    css(accent)
    if (brand.logo) {
      const img = new Image()
      img.onload = () => {
        set("mainLogo", brand.logo)
        set("headerLogo", brand.logo)
        css(accent
          + `img.main-logo{width:auto!important;height:auto!important;max-width:min(280px,80vw);max-height:56px}`
          + `.app-header .logo img{width:auto!important;height:28px!important;max-width:200px;object-fit:contain;`
          + `background:#fff;padding:2px 6px;border-radius:6px;box-sizing:content-box}`)
      }
      img.src = brand.logo
    }
    if (brand.icon) {
      const icon = new Image()
      icon.onload = () => set("favicon", brand.icon)
      icon.src = brand.icon
    }
  }
}
