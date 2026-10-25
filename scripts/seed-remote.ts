// ORTAK (core): template'ten gelir, sitede elle değiştirilmez. Siteye özel kısım scripts/seed.ts'in dışa açtıklarıdır
// (`seed`, isteğe bağlı `isEmpty` ve `fillEmpty`; sözleşme aşağıdaki SeedModule).
//
// Çalışan bir PocketBase'e (ör. SSH tüneli) gerçek içeriği yükler:
// - PB boşsa (`isEmpty`, varsayılan: Site Ayarları kaydı yok) `seed` tüm içeriği yükler.
// - PB doluysa site `fillEmpty` veriyorsa yalnız boş alanlar doldurulur (panelde yazılanı ezmez, tekrar çalıştırmak güvenlidir);
//   vermiyorsa hiçbir şey yazılmadan reddedilir.
// PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD ortamdan gelir; parola komut satırına yazılmaz, hiçbir yerde yazdırılmaz.
import type { Pb } from "./pb-harness"
import * as site from "./seed"

/**
 * scripts/seed.ts sözleşmesi (bu betik ve tests/seed-remote.test.ts kullanır; verify yalnız `seed`i çağırır).
 * - `seed(pb)`: boş bir PB'yi gerçek içerikle doldurur.
 * - `isEmpty(pb)` (isteğe bağlı): PB boş mu? Verilmezse "Site Ayarları kaydı yok" sayılır. Kaydı migration açan site
 *   (ör. settings tek kaydı migration'da) kendi ölçüsünü verir (ör. "hiç etkinlik yok").
 * - `fillEmpty(pb)` (isteğe bağlı): dolu PB'de yalnız BOŞ alanları/eksik kayıtları doldurur, panelde yazılanı ezmez,
 *   tekrar çalıştırmak güvenlidir. Verilmezse dolu PB'ye tohumlama reddedilir.
 */
export type SeedModule = {
  seed: (pb: Pb) => Promise<void>
  isEmpty?: (pb: Pb) => Promise<boolean>
  fillEmpty?: (pb: Pb) => Promise<void>
}

/** Varsayılan boşluk ölçüsü: Site Ayarları (settings) kaydı yok. */
export async function settingsEmpty(pb: Pb): Promise<boolean> {
  const res = await pb.admin("/api/collections/settings/records?perPage=1")
  if (!res.ok) throw new Error(`settings okunamadı: ${res.status}`)
  return ((await res.json()) as { totalItems: number }).totalItems === 0
}

/** Boş PB'yi tohumlar ya da dolu PB'de yalnız boş alanları doldurur; ne yapıldığını döner. */
export async function seedRemote(pb: Pb, mod: SeedModule): Promise<string> {
  if (await (mod.isEmpty ?? settingsEmpty)(pb)) {
    await mod.seed(pb)
    return "tohumlama tamam"
  }
  if (!mod.fillEmpty) throw new Error("PB dolu; tohumlama yalnız boş PB'ye yapılır (scripts/seed.ts fillEmpty vermiyor), hiçbir şey yazılmadı")
  await mod.fillEmpty(pb)
  return "PB dolu: yalnız boş alanlar dolduruldu"
}

/** Superuser olarak giriş yapar. Hata mesajında yalnız durum kodu vardır (kimlik bilgisi yazılmaz). */
export async function connect(rawUrl: string, identity: string, password: string): Promise<Pb> {
  const url = rawUrl.replace(/\/+$/, "")
  const auth = await fetch(`${url}/api/collections/_superusers/auth-with-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identity, password }),
  })
  if (!auth.ok) throw new Error(`giriş başarısız: ${auth.status}`)
  const token = ((await auth.json()) as { token: string }).token
  const call = (path: string, init: RequestInit = {}, authed = false) => {
    const headers = new Headers(init.headers)
    if (typeof init.body === "string" && !headers.has("content-type")) headers.set("content-type", "application/json")
    if (authed) headers.set("authorization", token)
    return fetch(`${url}${path}`, { ...init, headers })
  }
  return { url, dir: "", token, email: identity, api: (p, i) => call(p, i), admin: (p, i) => call(p, i, true), stop: async () => {} }
}

if (import.meta.main) {
  const { PB_URL: url = "", PB_ADMIN_EMAIL: identity = "", PB_ADMIN_PASSWORD: password = "" } = process.env
  if (!url || !identity || !password) throw new Error("PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD gerekli")
  const pb = await connect(url, identity, password)
  process.stdout.write(`${await seedRemote(pb, site)}\n`)
}
