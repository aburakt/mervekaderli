// ORTAK (core): template'ten gelir, sitede elle değiştirilmez (bun run core:sync).
import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"

// Bun.WebView gerekir (macOS'ta WebKit; Linux/CI'da Chrome: BUN_CHROME_PATH, ci.yml responsive işi). Fixture build'indeki her sayfayı birçok genişlikte açar,
// yatay taşmayı, ekran dışına çıkan öğeleri ve dönen kelimeli başlıklarda ([data-rotate]) düzen kaymasını ölçer.
const ROOT = join(import.meta.dir, "..")
const DIST = join(ROOT, "site", "dist")
const WIDTHS = (process.env.WIDTHS ?? "320,360,390,600,768,1024,1280,1440,1920,2560").split(",").map(Number)
const ONLY = process.env.ONLY

const out = (line: string) => process.stdout.write(`${line}\n`)

function routes(dir = DIST, base = ""): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return routes(p, `${base}/${n}`)
    return n === "index.html" ? [`${base || ""}/`] : []
  })
}

const OVERFLOW = `(() => {
  const vw = document.documentElement.clientWidth
  const res = { vw, sw: document.documentElement.scrollWidth, bad: [] }
  const clipped = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'hidden' || o === 'clip' || o === 'auto' || o === 'scroll') return true } return false }
  for (const el of document.querySelectorAll('main *, header *, footer *')) {
    if (el.closest('[aria-hidden="true"]')) continue
    const r = el.getBoundingClientRect()
    if (r.width <= 1 || r.height <= 1) continue // gizli ya da yalnız ekran okuyucuya (sr-only) görünen öğe
    if (el.tagName === 'H1' && el.scrollWidth > el.clientWidth + 1) res.bad.push('h1 içeriği kutusundan geniş: ' + el.scrollWidth + ' > ' + el.clientWidth)
    if (['P','LI','H1','H2','H3','A','DD','DT','SPAN'].includes(el.tagName) && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).display !== 'inline') res.bad.push('metin kutusundan taşıyor: ' + el.tagName.toLowerCase() + ' ' + el.scrollWidth + ' > ' + el.clientWidth + ' ' + (el.textContent || '').trim().slice(0, 24))
    if ((r.right > vw + 1 || r.left < -1) && !clipped(el)) res.bad.push(el.tagName.toLowerCase() + ' [' + Math.round(r.left) + ',' + Math.round(r.right) + '] ' + (el.textContent || '').trim().slice(0, 28))
  }
  res.bad = res.bad.slice(0, 5)
  return JSON.stringify(res)
})()`

// [data-rotate]: kelimeleri sırayla değişen başlık (çocuk öğeler .is-active ile ya da data-words ile). Her kelimede
// h1 boyutu ve yanındaki kartın (.tilt-card) yeri aynı kalmalı.
const STABILITY = `(() => {
  const el = document.querySelector('[data-rotate]')
  if (!el) return JSON.stringify({ skip: true })
  const h1 = document.querySelector('h1')
  const card = document.querySelector('.tilt-card')
  const snap = () => { const a = h1.getBoundingClientRect(); const c = card ? card.getBoundingClientRect() : { left: 0, top: 0 }; return [a.width, a.height, c.left, c.top].map(Math.round).join(',') }
  const words = el.dataset.words ? JSON.parse(el.dataset.words) : [...el.children].map((c) => c.textContent)
  const rows = []
  if (el.children.length > 0) {
    for (let i = 0; i < el.children.length; i++) { [...el.children].forEach((c, j) => c.classList.toggle('is-active', i === j)); rows.push(snap()) }
  } else {
    for (const w of words) { el.textContent = w; rows.push(snap()) }
  }
  return JSON.stringify({ rows, stable: new Set(rows).size === 1 })
})()`

const build = Bun.spawnSync(["bun", "run", "build"], { cwd: ROOT, env: { ...process.env, CONTENT_SOURCE: "fixture" }, stdout: "ignore", stderr: "inherit" })
if (build.exitCode !== 0) process.exit(1)

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(req) {
    let p = decodeURIComponent(new URL(req.url).pathname)
    if (p.endsWith("/")) p += "index.html"
    const f = Bun.file(join(DIST, p))
    return (await f.exists()) ? new Response(f) : new Response("nf", { status: 404 })
  },
})

const pages = routes().filter((r) => !ONLY || r.includes(ONLY)).sort()
let failures = 0
for (const w of WIDTHS) {
  const view = new Bun.WebView({ width: w, height: 900 })
  let bad = 0
  for (const path of pages) {
    await view.navigate(`http://127.0.0.1:${server.port}${path}`)
    await Bun.sleep(220)
    const o = JSON.parse((await view.evaluate(OVERFLOW)) as string) as { vw: number; sw: number; bad: string[] }
    if (o.sw > o.vw + 1 || o.bad.length) {
      bad++
      out(`❌ ${w}px ${path}: scrollWidth ${o.sw} > ${o.vw}${o.bad.length ? ` | ${o.bad.join(" | ")}` : ""}`)
    }
    if ((await view.evaluate("!!document.querySelector('[data-rotate]')")) === true) {
      await Bun.sleep(1300) // giriş animasyonu bitsin; yoksa kartın yeri animasyondan oynar
      const st = JSON.parse((await view.evaluate(STABILITY)) as string) as { stable?: boolean; rows?: string[] }
      if (!st.stable) {
        bad++
        out(`❌ ${w}px ${path}: dönen kelimede düzen kayıyor [genişlik,yükseklik,kart.x,kart.y] ${JSON.stringify(st.rows)}`)
      }
    }
  }
  view.close?.()
  failures += bad
  out(`${bad === 0 ? "✅" : "❌"} ${w}px: ${pages.length} sayfa, ${bad} sorun`)
}
server.stop(true)
out(failures === 0 ? "✅ responsive: sorun yok" : `❌ responsive: ${failures} sorun`)
process.exit(failures === 0 ? 0 : 1)
