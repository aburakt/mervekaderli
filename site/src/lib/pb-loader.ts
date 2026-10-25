import { fileUrl, listAll } from "./pb"
import type { Img, Site } from "./types"

type Rec = { id: string; collectionId: string }
type RawSettings = Rec & {
  company_name: string; phone: string; email: string; address: string; hero_title: string; hero_text: string; hero_image: string
  seo_description: string; share_image: string; cf_analytics_token: string
}
type RawPost = Rec & { title: string; slug: string; date: string; summary: string; body: string; cover: string; updated: string }
type RawPage = Rec & { title: string; slug: string; body: string; seo_description: string }
type RawRedirect = Rec & { from: string; to: string; code: "301" | "302" }

const file = (r: Rec, name: string): Img | undefined => (name ? { src: fileUrl(r, name) } : undefined)

/** Tüm içeriği PB'den çeker (yalnız public kurallarla) ve doğrular. Eksik zorunlu içerik build'i kırar. */
export async function loadFromPb(): Promise<Site> {
  const [settingsList, posts, redirects, pages] = await Promise.all([
    listAll<RawSettings>("settings", { sort: "created" }),
    listAll<RawPost>("posts", { sort: "-date,position" }),
    listAll<RawRedirect>("redirects"),
    listAll<RawPage>("pages"),
  ])
  const s = settingsList[0]
  if (!s?.company_name || !s.hero_title) throw new Error("Site Ayarları (settings) kaydı yok ya da kurum adı/ana başlık boş")

  return {
    settings: {
      companyName: s.company_name, phone: s.phone, email: s.email, address: s.address, heroTitle: s.hero_title, heroText: s.hero_text,
      heroImage: file(s, s.hero_image), seoDescription: s.seo_description, shareImage: file(s, s.share_image),
      cfAnalyticsToken: s.cf_analytics_token,
    },
    posts: posts.map((p) => ({ title: p.title, slug: p.slug, date: p.date.slice(0, 10), summary: p.summary, body: p.body, cover: file(p, p.cover), updated: p.updated })),
    pages: pages.map((p) => ({ title: p.title, slug: p.slug, body: p.body, seoDescription: p.seo_description })),
    redirects: redirects.map((r) => ({ from: r.from, to: r.to, code: r.code })),
  }
}
