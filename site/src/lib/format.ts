export const lines = (text: string | undefined): string[] => (text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean)

/** Rakamlar: başa 0 ya da +90 eklenmiş Türkiye numarası (0507… -> 90507…). */
const digits = (phone: string): string => {
  const d = phone.replace(/\D/g, "")
  return d.startsWith("90") ? d : d.startsWith("0") ? `9${d}` : `90${d}`
}
/** tel: bağlantısı (0 312 000 00 00 -> tel:+903120000000). */
export const telHref = (phone: string): string => `tel:+${digits(phone)}`

const date = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
/** "2026-10-01" -> "1 Ekim 2026" */
export const formatDate = (iso: string): string => date.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`))

// Türkçe büyük/küçük harf ortak (core) lib/tr.ts'te: toLowerCase/toUpperCase yerine bunları kullanın (İ/ı bozulmaz).
export { lower, softCase, titleCase, upper } from "./tr"
