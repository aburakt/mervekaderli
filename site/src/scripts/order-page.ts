// SİTEYE ÖZEL: ödemeden dönüş ve sipariş durumu (/siparis/?no=&t=). Shopier dönüşü PB'ye gelir, PB bu sayfaya yönlendirir.
import { formatTL, ORDER_STATUS_TR, orderStatus, shopApi, type OrderView } from "../lib/shop"

const root = document.querySelector<HTMLElement>("[data-order]")!
const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!
const params = new URLSearchParams(location.search)
const no = params.get("no") ?? ""
const token = params.get("t") ?? ""

const LEAD: Partial<Record<OrderView["status"], string>> = {
  paid: "Ödemeniz alındı, teşekkür ederiz. Siparişinizi özenle hazırlayıp kargoya verdiğimizde size haber vereceğiz. Onay e-postası yolda.",
  pending: "Ödemenizin onayı bekleniyor. Birkaç dakika içinde bu sayfayı yenileyin; onay gelince e-posta da alacaksınız.",
  failed: "Ödeme tamamlanmadı ve kartınızdan para çekilmedi. Ürünleri yeniden sepete ekleyip tekrar deneyebilirsiniz.",
  expired: "Ödeme süresi doldu; ayrılan ürünler stoğa geri döndü. Dilerseniz yeniden sipariş verebilirsiniz.",
  shipped: "Siparişiniz kargoya verildi.",
  delivered: "Siparişiniz teslim edildi. Keyifle kullanın!",
}

function show(o: OrderView) {
  $("[data-order-title]").textContent = o.status === "paid" ? "Teşekkürler!" : "Siparişiniz"
  $("[data-order-lead]").textContent = LEAD[o.status] ?? ORDER_STATUS_TR[o.status]
  $("[data-order-no]").textContent = o.number
  $("[data-order-status]").textContent = ORDER_STATUS_TR[o.status]
  $("[data-order-items]").replaceChildren(...o.items.map((i) => {
    const li = document.createElement("li")
    li.className = "summary-row border-b border-line py-3"
    const a = document.createElement("span")
    a.textContent = `${i.title} × ${i.qty}`
    const b = document.createElement("span")
    b.textContent = formatTL(Math.round(i.price * 100 * i.qty) / 100)
    li.append(a, b)
    return li
  }))
  $("[data-o-subtotal]").textContent = formatTL(o.subtotal)
  $("[data-o-shipping]").textContent = o.shipping ? formatTL(o.shipping) : "Ücretsiz"
  $("[data-o-total]").textContent = formatTL(o.total)
  $("[data-order-body]").hidden = false
}

const api = shopApi()
if (!api) $("[data-order-lead]").textContent = "Önizlemede sipariş sorgulama kapalıdır."
else if (!no || !token) $("[data-order-lead]").textContent = "Sipariş bağlantısı eksik. Onay e-postanızdaki bağlantıyı kullanın."
else orderStatus(api, no, token).then(show).catch((e: Error) => { $("[data-order-lead]").textContent = e.message })
