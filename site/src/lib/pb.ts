// ORTAK (core): template'ten gelir, sitede elle değiştirilmez (bun run core:sync).
type ListResult<T> = { items: T[]; totalPages: number }

/** CONTENT_SOURCE=fixture: PB olmadan örnek veriyle build (yalnız önizleme; açıkça seçilmelidir). */
export const isFixtureMode = (): boolean => (process.env.CONTENT_SOURCE ?? import.meta.env.CONTENT_SOURCE) === "fixture"

export function pbUrl(): string {
  const url = process.env.PB_URL ?? import.meta.env.PB_URL
  if (!url) throw new Error("PB_URL tanımlı değil; build içerik çekemez")
  return url.replace(/\/$/, "")
}

/** Public API kurallarıyla tüm kayıtları çeker. Hata ya da boş cevap build'i kırar. */
export async function listAll<T>(collection: string, params: Record<string, string> = {}): Promise<T[]> {
  const out: T[] = []
  for (let page = 1; ; page++) {
    const qs = new URLSearchParams({ perPage: "200", page: String(page), sort: "position,created", ...params })
    const res = await fetch(`${pbUrl()}/api/collections/${collection}/records?${qs}`)
    if (!res.ok) throw new Error(`${collection}: HTTP ${res.status}`)
    const body = (await res.json()) as ListResult<T>
    out.push(...body.items)
    if (page >= body.totalPages) break
  }
  return out
}

export const fileUrl = (r: { collectionId: string; id: string }, filename: string): string =>
  `${pbUrl()}/api/files/${r.collectionId}/${r.id}/${filename}`
