// ORTAK (core): template'ten gelir, sitede elle değiştirilmez (bun run core:sync).
//
// Mağaza istemcisi (tarayıcı; docs/shop.md). Sepet tarayıcıda (localStorage), fiyat ve stok her zaman sunucudan:
// liveProducts() sayfadaki stoğu tazeler, checkout() siparişi PB'de açar ve ödeme formunu sağlayıcıya gönderir.
// Arayüz (sepet çekmecesi, ödeme formu, sipariş sayfası) siteye aittir; bu dosya yalnız veri ve akış verir.
// Sayfada inline betik yok: ödeme formu DOM'da kurulup gönderilir (CSP form-action'a sağlayıcı build'de eklenir).

export type ProductKind = "product" | "workshop"
export type CartLine = { id: string; title: string; price: number; qty: number; kind: ProductKind; image?: string; url?: string; max?: number }
export type Buyer = { name: string; email: string; phone: string; address?: string; city?: string; postcode?: string; country?: string }
export type CheckoutInput = { buyer: Buyer; note?: string; kvkk_consent: boolean; contract_consent: boolean; marketing_consent?: boolean }
export type Payment = { action: string; method: string; fields: Record<string, string | number> }
export type CheckoutResult = { number: string; token: string; total: number; payment: Payment }
export type OrderStatus = "pending" | "paid" | "failed" | "expired" | "shipped" | "delivered" | "cancelled" | "refunded"
export type OrderView = { number: string; status: OrderStatus; items: { title: string; qty: number; price: number; kind: ProductKind }[]; subtotal: number; shipping: number; total: number; created: string }
export type LiveProduct = { id: string; price: number; stock: number }

const KEY = "shop_cart_v1"
export const CART_EVENT = "shop:cart"

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null // gizli pencere ya da engelli depolama: sepet bu sayfada bellekte kalır
  }
}

let memory: CartLine[] = []

export function readCart(): CartLine[] {
  try {
    const raw = storage()?.getItem(KEY)
    if (raw === null || raw === undefined) return memory
    const lines = JSON.parse(raw) as CartLine[]
    return Array.isArray(lines) ? lines.filter((l) => l && typeof l.id === "string" && l.qty > 0) : []
  } catch {
    return memory
  }
}

function writeCart(lines: CartLine[]): void {
  memory = lines
  try {
    storage()?.setItem(KEY, JSON.stringify(lines))
  } catch {}
  window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: lines }))
}

const clamp = (qty: number, max?: number) => Math.max(0, Math.min(Math.floor(qty), max ?? 20, 20))

/** Sepete ekler (aynı ürün varsa adedi artar); stok sınırını aşmaz. Eklenen son adedi döndürür. */
export function addToCart(line: Omit<CartLine, "qty">, qty = 1): number {
  const lines = readCart()
  const found = lines.find((l) => l.id === line.id)
  const next = clamp((found?.qty ?? 0) + qty, line.max)
  writeCart(found ? lines.map((l) => (l.id === line.id ? { ...l, ...line, qty: next } : l)) : [...lines, { ...line, qty: next }])
  return next
}

/** Adedi değiştirir; 0 olursa ürün sepetten çıkar. */
export function setQty(id: string, qty: number): void {
  writeCart(readCart().map((l) => (l.id === id ? { ...l, qty: clamp(qty, l.max) } : l)).filter((l) => l.qty > 0))
}

export const removeFromCart = (id: string): void => writeCart(readCart().filter((l) => l.id !== id))
export const clearCart = (): void => writeCart([])
export const cartCount = (lines = readCart()): number => lines.reduce((n, l) => n + l.qty, 0)
export const cartSubtotal = (lines = readCart()): number => Math.round(lines.reduce((n, l) => n + Math.round(l.price * 100) * l.qty, 0)) / 100
export const needsShipping = (lines = readCart()): boolean => lines.some((l) => l.kind !== "workshop")

/** Sepet değişince (bu sekmede ya da başka sekmede) çağrılır. Bırakma fonksiyonu döndürür. */
export function onCartChange(fn: (lines: CartLine[]) => void): () => void {
  const local = (e: Event) => fn((e as CustomEvent<CartLine[]>).detail)
  const other = (e: StorageEvent) => { if (e.key === KEY) fn(readCart()) }
  window.addEventListener(CART_EVENT, local)
  window.addEventListener("storage", other)
  return () => {
    window.removeEventListener(CART_EVENT, local)
    window.removeEventListener("storage", other)
  }
}

const tl = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" })
/** 1249.9 → "₺1.249,90" */
export const formatTL = (n: number): string => tl.format(n)

/** Sayfadaki ürünlerin güncel fiyat ve stoğu (statik sayfa build anındaki değeri gösterir). */
export async function liveProducts(api: ShopApi, ids: string[]): Promise<Map<string, LiveProduct>> {
  const out = new Map<string, LiveProduct>()
  const unique = [...new Set(ids)].filter((id) => /^[a-z0-9]{15}$/.test(id))
  for (let i = 0; i < unique.length; i += 50) {
    const filter = unique.slice(i, i + 50).map((id) => `id='${id}'`).join("||")
    const qs = new URLSearchParams({ filter, fields: "id,price,stock", perPage: "50", skipTotal: "1" })
    const res = await fetch(`${api.pb}/api/collections/products/records?${qs}`)
    if (!res.ok) throw new Error(String(res.status))
    for (const p of ((await res.json()) as { items: LiveProduct[] }).items) out.set(p.id, p)
  }
  return out
}

/** Sitedeki mağaza adresleri: data-shop-pb ve data-shop-id (build'de lib/shop-config.ts yazar). */
export type ShopApi = { pb: string; id: string }
export function shopApi(el: HTMLElement = document.documentElement): ShopApi | null {
  const host = el.closest<HTMLElement>("[data-shop-pb]") ?? document.querySelector<HTMLElement>("[data-shop-pb]")
  const pb = host?.dataset.shopPb
  const id = host?.dataset.shopId
  return pb && id ? { pb, id } : null
}

/** Siparişi açar. Hata iletisi sunucunun Türkçe mesajıdır (stok, onay, adres). */
export async function checkout(api: ShopApi, input: CheckoutInput, lines = readCart()): Promise<CheckoutResult> {
  const res = await fetch(`${api.pb}/api/${api.id}/shop/checkout`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...input, items: lines.map((l) => ({ id: l.id, qty: l.qty })) }),
  })
  const body = (await res.json().catch(() => ({}))) as CheckoutResult & { message?: string }
  if (!res.ok) throw new Error(body.message || "Sipariş oluşturulamadı. Lütfen tekrar deneyin.")
  return body
}

/** Ödeme formunu kurup sağlayıcının sayfasına gönderir (sayfa ayrılır). */
export function submitPayment(payment: Payment): void {
  const form = document.createElement("form")
  form.method = payment.method || "POST"
  form.action = payment.action
  form.hidden = true
  for (const [name, value] of Object.entries(payment.fields)) {
    const input = document.createElement("input")
    input.type = "hidden"
    input.name = name
    input.value = String(value)
    form.append(input)
  }
  document.body.append(form)
  form.submit()
}

/** Müşterinin sipariş sayfası: ?no=&t= ile durum. */
export async function orderStatus(api: ShopApi, no: string, token: string): Promise<OrderView> {
  const qs = new URLSearchParams({ no, t: token })
  const res = await fetch(`${api.pb}/api/${api.id}/shop/order?${qs}`)
  if (!res.ok) throw new Error(res.status === 404 ? "Sipariş bulunamadı." : "Sipariş durumu alınamadı.")
  return (await res.json()) as OrderView
}

export const ORDER_STATUS_TR: Record<OrderStatus, string> = {
  pending: "Ödeme bekleniyor",
  paid: "Ödendi, hazırlanıyor",
  failed: "Ödeme tamamlanmadı",
  expired: "Ödeme süresi doldu",
  shipped: "Kargoya verildi",
  delivered: "Teslim edildi",
  cancelled: "İptal edildi",
  refunded: "İade edildi",
}
