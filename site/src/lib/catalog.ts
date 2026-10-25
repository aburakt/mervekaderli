// SİTEYE ÖZEL: ürün ve atölye listeleri, fiyat/tarih biçimi, sepet küçük görseli (build'de).
import { getImage } from "astro:assets"
import { isRemoteRaster, remoteDims } from "./image"
import type { Img, Product } from "./types"

export const isWorkshop = (p: Product): boolean => p.kind === "workshop"
/** Tarihi geçmemiş (ya da tarihi birlikte belirlenecek) atölye. Build anına göre; statik site günlük yeniden yayınlanır. */
export const isUpcoming = (p: Product, now = Date.now()): boolean => !p.eventDate || Date.parse(p.eventDate) > now

const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2, minimumFractionDigits: 0 })
/** 4500 -> "₺4.500", 1249.9 -> "₺1.249,9"; kuruşlu fiyat iki haneli yazılır. */
export const price = (n: number): string => (Number.isInteger(n) ? money.format(n) : new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(n))

const TZ = "Europe/Istanbul"
const part = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, ...o }).format(new Date(iso))
/** Atölye tarih kutusu ve satırı: { day: "14", month: "Kas", long: "14 Kasım Cumartesi, 11.00" } */
export function workshopDate(iso: string): { day: string; month: string; long: string } {
  return {
    day: part(iso, { day: "numeric" }),
    month: part(iso, { month: "short" }).replace(".", ""),
    long: `${part(iso, { day: "numeric", month: "long", weekday: "long" })}, ${part(iso, { hour: "2-digit", minute: "2-digit" }).replace(":", ".")}`,
  }
}

/** Stok durumu: tükendi, son adetler ya da yok (bol). Atölyede "kontenjan". */
export function stockNote(p: Product): { label: string; tone: "out" | "last" } | null {
  if (p.stock <= 0) return { label: isWorkshop(p) ? "Kontenjan doldu" : "Tükendi", tone: "out" }
  if (p.stock <= 2) return { label: isWorkshop(p) ? `Son ${p.stock} yer` : p.stock === 1 ? "Tek parça" : `Son ${p.stock}`, tone: "last" }
  return null
}

/** Sepette görünen küçük görsel (160 px WebP); panel görseli build'de indirilir. */
export async function thumb(img: Img | undefined): Promise<string> {
  if (!img) return ""
  if (isRemoteRaster(img.src)) {
    const d = await remoteDims(img.src, 160)
    return (await getImage({ src: img.src, width: d.width, height: d.height, format: "webp", quality: 70 })).src
  }
  return (await getImage({ src: img.src, width: 160, format: "webp", quality: 70 })).src
}
