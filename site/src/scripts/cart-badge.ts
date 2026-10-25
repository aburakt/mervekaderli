// SİTEYE ÖZEL: menüdeki sepet sayacı (her sayfada). Sepet tarayıcıda; başka sekmedeki değişiklik de yansır.
import { cartCount, onCartChange, readCart, type CartLine } from "../lib/shop"

function paint(lines: CartLine[]) {
  const n = cartCount(lines)
  for (const el of document.querySelectorAll<HTMLElement>("[data-cart-count]")) {
    el.textContent = String(n)
    el.toggleAttribute("data-empty", n === 0)
  }
}
paint(readCart())
onCartChange(paint)
