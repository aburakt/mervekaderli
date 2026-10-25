import { join } from "node:path"
import type { Pb } from "./pb-harness"

// SİTEYE ÖZEL: site/src/data/content.json + görseller -> PocketBase. İçeriği ilk kez PB'ye yükler; testler ve verify kullanır.
// Sözleşme: `seed(pb)` boş bir PB'yi doldurur (scripts/verify.ts ve seed-remote.ts bunu çağırır).
const SITE = join(import.meta.dir, "..", "site")
const MEDIA = join(SITE, "src", "assets", "media")

type Json = Record<string, unknown>
export type Content = {
  settings: { companyName: string; phone: string; email: string; address: string; heroTitle: string; heroText: string; seoDescription: string; cfAnalyticsToken?: string }
  posts: { title: string; slug: string; date: string; summary: string; body: string; cover?: string }[]
  redirects: { from: string; to: string; code: string }[]
  pages: { title: string; slug: string; seoDescription: string; body: string; published: boolean }[]
}
export const loadContent = async (): Promise<Content> => (await Bun.file(join(SITE, "src", "data", "content.json")).json()) as Content

const blob = async (name: string) => new Blob([await Bun.file(join(MEDIA, name)).arrayBuffer()], { type: "image/webp" })

/** Kayıt açar. Boş alanlar gönderilmez; görseller media klasöründen yüklenir. */
export async function save(pb: Pb, collection: string, fields: Json, files: Record<string, string | undefined> = {}): Promise<Json> {
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null || v === "" || v === 0) continue
    form.set(k, String(v))
  }
  for (const [field, name] of Object.entries(files)) if (name) form.append(field, await blob(name), name)
  const res = await pb.admin(`/api/collections/${collection}/records`, { method: "POST", body: form })
  if (!res.ok) throw new Error(`seed ${collection}: ${res.status} ${await res.text()}`)
  return (await res.json()) as Json
}

/** Boş bir PB'yi içerikle doldurur. Site Ayarları zaten varsa (canlıda) durur. */
export async function seed(pb: Pb): Promise<void> {
  const existing = await pb.admin("/api/collections/settings/records?perPage=1")
  if (!existing.ok) throw new Error(`seed settings: ${existing.status}`)
  if (((await existing.json()) as { totalItems: number }).totalItems > 0) throw new Error("PB dolu (settings kaydı var); tohumlama yalnız boş PB'ye yapılır")
  const { settings: s, posts, redirects, pages } = await loadContent()
  await save(pb, "settings", {
    company_name: s.companyName, phone: s.phone, email: s.email, address: s.address, hero_title: s.heroTitle, hero_text: s.heroText,
    seo_description: s.seoDescription, cf_analytics_token: s.cfAnalyticsToken,
  })
  for (const [i, p] of posts.entries()) {
    await save(pb, "posts", { title: p.title, slug: p.slug, date: `${p.date} 00:00:00.000Z`, summary: p.summary, body: p.body, position: (i + 1) * 10, published: true }, { cover: p.cover })
  }
  for (const [i, p] of pages.entries()) {
    await save(pb, "pages", { title: p.title, slug: p.slug, body: p.body, seo_description: p.seoDescription, position: (i + 1) * 10, published: p.published })
  }
  for (const [i, r] of redirects.entries()) await save(pb, "redirects", { from: r.from, to: r.to, code: r.code, position: (i + 1) * 10, published: true })
}
