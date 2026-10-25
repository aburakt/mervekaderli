// SİTEYE ÖZEL: sepet sayfası. Satırlar ve tutarlar sepetten (tarayıcı) çizilir; kargo site.js SHOP.shipping ile aynı
// kuralla gösterilir, asıl tutarı ödeme adımında sunucu hesaplar. "Ödemeye geç": sipariş PB'de açılır (stok ayrılır),
// tarayıcı Shopier ödeme sayfasına gönderilir. Önizlemede (PB yok) yalnız açıklama gösterilir.
import { cartSubtotal, checkout, clearCart, formatTL, needsShipping, onCartChange, readCart, removeFromCart, setQty, shopApi, submitPayment, type CartLine } from "../lib/shop"

const root = document.querySelector<HTMLElement>("[data-cart]")!
const list = root.querySelector<HTMLUListElement>("[data-cart-lines]")!
const empty = root.querySelector<HTMLElement>("[data-cart-empty]")!
const summary = root.querySelector<HTMLElement>("[data-cart-summary]")!
const box = root.querySelector<HTMLElement>("[data-checkout-box]")!
const form = root.querySelector<HTMLFormElement>("[data-checkout]")!
const status = form.querySelector<HTMLElement>("[data-checkout-status]")!
const address = form.querySelector<HTMLFieldSetElement>("[data-address]")!
const workshopOnly = form.querySelector<HTMLElement>("[data-workshop-only]")!
const shipPrice = Number(root.dataset.shipPrice ?? 0)
const shipFree = Number(root.dataset.shipFree ?? 0)

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (text) n.textContent = text
  return n
}
const shippingFor = (lines: CartLine[]) => {
  if (!needsShipping(lines)) return 0
  return shipFree > 0 && cartSubtotal(lines) >= shipFree ? 0 : shipPrice
}

function line(l: CartLine): HTMLLIElement {
  const li = el("li", "cart-line")
  if (l.image) {
    const img = el("img")
    img.src = l.image
    img.alt = ""
    img.width = 80
    img.height = 80
    li.append(img)
  } else li.append(el("span", "ph"))
  const mid = el("div", "grid gap-1")
  const title = el("a", "font-semibold text-ink no-underline", l.title)
  title.href = l.url ?? "/urunler/"
  mid.append(title, el("span", "soft text-sm", `${formatTL(l.price)}${l.kind === "workshop" ? " · atölye" : ""}`))
  const qty = el("div", "qty mt-1 justify-self-start")
  qty.setAttribute("role", "group")
  qty.setAttribute("aria-label", `${l.title} adedi`)
  const dec = el("button", "", "−")
  dec.type = "button"
  dec.setAttribute("aria-label", "Bir azalt")
  dec.addEventListener("click", () => setQty(l.id, l.qty - 1))
  const out = el("output", "", String(l.qty))
  const inc = el("button", "", "+")
  inc.type = "button"
  inc.setAttribute("aria-label", "Bir artır")
  inc.disabled = l.qty >= Math.min(l.max ?? 20, 20)
  inc.addEventListener("click", () => setQty(l.id, l.qty + 1))
  qty.append(dec, out, inc)
  mid.append(qty)
  const right = el("div", "grid justify-items-end gap-2")
  right.append(el("span", "price", formatTL(Math.round(l.price * 100 * l.qty) / 100)))
  const rm = el("button", "soft text-sm underline", "Kaldır")
  rm.type = "button"
  rm.setAttribute("aria-label", `${l.title} sepetten kaldır`)
  rm.addEventListener("click", () => removeFromCart(l.id))
  right.append(rm)
  li.append(mid, right)
  return li
}

function paint(lines: CartLine[]) {
  list.replaceChildren(...lines.map(line))
  const has = lines.length > 0
  empty.hidden = has
  summary.hidden = !has
  box.hidden = !has
  if (!has) return
  const sub = cartSubtotal(lines)
  const ship = shippingFor(lines)
  const physical = needsShipping(lines)
  summary.querySelector("[data-subtotal]")!.textContent = formatTL(sub)
  summary.querySelector("[data-shipping]")!.textContent = physical ? (ship === 0 ? "Ücretsiz" : formatTL(ship)) : "Yok (atölye)"
  summary.querySelector("[data-total-value]")!.textContent = formatTL(Math.round((sub + ship) * 100) / 100)
  summary.querySelector("[data-ship-hint]")!.textContent = physical && ship > 0 && shipFree > 0 ? `${formatTL(shipFree - sub)} daha ekleyin, kargo ücretsiz olsun.` : ""
  address.hidden = !physical
  address.disabled = !physical
  for (const f of address.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[name=address],[name=city]")) f.required = physical
  workshopOnly.hidden = physical
}

paint(readCart())
onCartChange(paint)

const say = (text: string, error = false) => {
  status.textContent = text
  status.className = error ? "note text-sm" : "text-sm"
  if (error) status.dataset.tone = "error"
  else delete status.dataset.tone
}

form.addEventListener("submit", async (e) => {
  e.preventDefault()
  if (!form.reportValidity()) return
  const f = new FormData(form)
  const v = (k: string) => String(f.get(k) ?? "").trim()
  if (root.dataset.preview) {
    say("Önizleme: yayındaki sitede bu adımda siparişiniz açılır ve Shopier'in güvenli ödeme sayfasına geçilir.")
    return
  }
  const api = shopApi()
  if (!api) return say("Ödeme şu an açık değil. Lütfen bize telefonla ulaşın.", true)
  const button = form.querySelector<HTMLButtonElement>("button[type=submit]")!
  button.disabled = true
  say("Siparişiniz hazırlanıyor…")
  try {
    const physical = needsShipping()
    const res = await checkout(api, {
      buyer: {
        name: v("name"), email: v("email"), phone: v("phone"),
        ...(physical ? { address: v("address"), city: v("city"), postcode: v("postcode"), country: "Türkiye" } : {}),
      },
      note: v("note"),
      kvkk_consent: f.get("kvkk_consent") === "on",
      contract_consent: f.get("contract_consent") === "on",
      marketing_consent: f.get("marketing_consent") === "on",
    })
    say("Ödeme sayfasına yönlendiriliyorsunuz…")
    clearCart()
    submitPayment(res.payment)
  } catch (err) {
    say(err instanceof Error ? err.message : "Sipariş oluşturulamadı. Lütfen tekrar deneyin.", true)
    button.disabled = false
  }
})
