// SİTEYE ÖZEL: ürün ve atölye sayfalarındaki etkileşim. Galeri küçük görselleri, adet seçici, "Sepete ekle" ve
// sayfa açılınca canlı stok (statik sayfa build anındaki stoğu gösterir; satılan parça burada hemen "Tükendi" olur).
import { addToCart, liveProducts, readCart, shopApi, type ProductKind } from "../lib/shop"

for (const g of document.querySelectorAll<HTMLElement>("[data-gallery]")) {
  const slides = [...g.querySelectorAll<HTMLElement>("[data-slide]")]
  const thumbs = [...g.querySelectorAll<HTMLButtonElement>("[data-thumb]")]
  for (const t of thumbs) {
    t.addEventListener("click", () => {
      const i = Number(t.dataset.thumb)
      slides.forEach((s, n) => { s.hidden = n !== i })
      thumbs.forEach((b, n) => b.setAttribute("aria-current", String(n === i)))
    })
  }
}

const inCart = (id: string) => readCart().find((l) => l.id === id)?.qty ?? 0

function message(el: HTMLElement, text: string, link?: { href: string; label: string }) {
  el.replaceChildren(text)
  if (link) {
    const a = document.createElement("a")
    a.href = link.href
    a.textContent = link.label
    a.className = "link-arrow ml-1"
    el.append(a)
  }
}

type Buy = { box: HTMLElement; paint: () => void }
const boxes: Buy[] = []

for (const box of document.querySelectorAll<HTMLElement>("[data-buy]")) {
  const d = box.dataset
  const id = d.id!
  const add = box.querySelector<HTMLButtonElement>("[data-add]")!
  const out = box.querySelector<HTMLOutputElement>("[data-qty]")
  const inc = box.querySelector<HTMLButtonElement>("[data-qty-inc]")
  const dec = box.querySelector<HTMLButtonElement>("[data-qty-dec]")
  const status = box.querySelector<HTMLElement>("[data-buy-status]")!
  let qty = 1
  const left = () => Math.max(0, Number(d.max) - inCart(id))
  const paint = () => {
    const room = left()
    qty = Math.max(1, Math.min(qty, room))
    if (out) out.textContent = String(qty)
    if (dec) dec.disabled = qty <= 1
    if (inc) inc.disabled = qty >= room
    if (add.dataset.closed === undefined && add.textContent !== "Tamamlandı") {
      add.disabled = Number(d.max) <= 0
      add.textContent = Number(d.max) <= 0 ? d.outLabel! : d.label!
    }
  }
  inc?.addEventListener("click", () => { qty += 1; paint() })
  dec?.addEventListener("click", () => { qty -= 1; paint() })
  add.addEventListener("click", () => {
    const before = inCart(id)
    const after = addToCart({ id, title: d.title!, price: Number(d.price), kind: d.kind as ProductKind, image: d.image || undefined, url: d.url, max: Number(d.max) }, qty)
    if (after > before) message(status, d.kind === "workshop" ? "Yeriniz sepete eklendi." : "Sepete eklendi.", { href: "/sepet/", label: "Sepete git →" })
    else message(status, "Bu parçanın elimizdeki tüm adetleri zaten sepetinizde.", { href: "/sepet/", label: "Sepete git →" })
    qty = 1
    paint()
  })
  paint()
  boxes.push({ box, paint })
}

// Canlı stok: PB'ye bağlı yayında (önizlemede adres yok, atlanır). Hata olursa sayfadaki build stoğu kalır.
const api = shopApi()
const ids = [...new Set([...document.querySelectorAll<HTMLElement>("[data-product-id]")].map((el) => el.dataset.productId!))]
if (api && ids.length) {
  liveProducts(api, ids).then((live) => {
    for (const el of document.querySelectorAll<HTMLElement>("[data-product-id]")) {
      const p = live.get(el.dataset.productId!)
      if (!p || p.stock > 0) continue
      const badge = el.querySelector<HTMLElement>("[data-stock-badge]")
      if (badge) { badge.textContent = el.querySelector("[data-buy][data-kind='workshop']") ? "Kontenjan doldu" : "Tükendi"; badge.dataset.tone = "out" }
      const text = el.querySelector<HTMLElement>("[data-stock-text]")
      if (text) text.textContent = el.querySelector("[data-buy][data-kind='workshop']") ? "Kontenjan doldu" : "Tükendi"
    }
    for (const { box, paint } of boxes) {
      const p = live.get(box.dataset.id!)
      if (!p) continue
      box.dataset.max = String(p.stock)
      box.dataset.price = String(p.price)
      paint()
    }
  }).catch(() => {})
}
