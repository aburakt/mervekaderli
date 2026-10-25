// ORTAK (core): template'ten gelir, sitede elle değiştirilmez. site.config.ts bu tipleri kullanır.
import type { Pb } from "./pb-harness"

/** Build çıktısında kontrol edilen sayfa: durum kodu, içinde olması ve olmaması gereken metinler. */
export type Check = { name: string; path: string; status?: number; has?: string[]; hasNot?: string[] }

export type SiteConfig = {
  /** `bun run verify` gerçek içerikle (seed) yapılan PB build'inden sonra bunları kontrol eder. */
  checks: Check[]
  /** Yayın hook'u testi için içerik koleksiyonunda açılıp düzenlenecek basit kayıt (zorunlu alanlarıyla). */
  hookSample: { collection: string; create: Record<string, unknown>; update: (n: number) => Record<string, unknown> }
  /** true ise sayfada dış adresli görsel kabul edilir (CSP img-src 'self' kullanmayan siteler). */
  externalImages?: boolean
  /**
   * İsteğe bağlı ikinci build: gerçek içerikte bulunmayan durumlar (taslak, çevirisi olmayan kayıt, panel görseli)
   * test verisiyle tohumlanır ve testChecks ile kontrol edilir.
   */
  testSeed?: (pb: Pb) => Promise<void>
  testChecks?: Check[]
  /** Performans bütçesi (verify): sayfa başına gzip'li HTML + CSS + JS (varsayılan 150 KB), en büyük yerel görsel (varsayılan 400 KB). */
  budget?: { pageKb?: number; imageKb?: number }
}
