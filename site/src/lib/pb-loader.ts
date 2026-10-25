import { fileUrl, listAll } from "./pb"
import type { Img, Product, Site } from "./types"

type Rec = { id: string; collectionId: string }
type RawSettings = Rec & {
  company_name: string; phone: string; email: string; address: string; hero_title: string; hero_text: string; hero_image: string
  seo_description: string; share_image: string; cf_analytics_token: string
  instagram: string; hours: string; about_title: string; about_text: string; about_image: string; workshop_intro: string
}
type RawPost = Rec & { title: string; slug: string; date: string; summary: string; body: string; cover: string; updated: string }
type RawPage = Rec & { title: string; slug: string; body: string; seo_description: string }
type RawRedirect = Rec & { from: string; to: string; code: "301" | "302" }
type RawProduct = Rec & {
  kind: Product["kind"]; title: string; slug: string; summary: string; description: string; images: string[]
  price: number; stock: number; event_date: string
}

const file = (r: Rec, name: string): Img | undefined => (name ? { src: fileUrl(r, name) } : undefined)
/** PB tarihi ("2026-11-14 08:00:00.000Z") -> ISO ("2026-11-14T08:00:00.000Z"). */
const iso = (d: string) => (d ? d.replace(" ", "T") : undefined)

/** Tüm içeriği PB'den çeker (yalnız public kurallarla) ve doğrular. Eksik zorunlu içerik build'i kırar. */
export async function loadFromPb(): Promise<Site> {
  const [settingsList, posts, redirects, pages, products] = await Promise.all([
    listAll<RawSettings>("settings", { sort: "created" }),
    listAll<RawPost>("posts", { sort: "-date,position" }),
    listAll<RawRedirect>("redirects"),
    listAll<RawPage>("pages"),
    listAll<RawProduct>("products", { sort: "sort,-created" }),
  ])
  const s = settingsList[0]
  if (!s?.company_name || !s.hero_title) throw new Error("Site Ayarları (settings) kaydı yok ya da kurum adı/ana başlık boş")

  return {
    settings: {
      companyName: s.company_name, phone: s.phone, email: s.email, address: s.address, heroTitle: s.hero_title, heroText: s.hero_text,
      heroImage: file(s, s.hero_image), seoDescription: s.seo_description, shareImage: file(s, s.share_image),
      cfAnalyticsToken: s.cf_analytics_token, instagram: s.instagram, hours: s.hours, aboutTitle: s.about_title,
      aboutText: s.about_text, aboutImage: file(s, s.about_image), workshopIntro: s.workshop_intro,
    },
    posts: posts.map((p) => ({ title: p.title, slug: p.slug, date: p.date.slice(0, 10), summary: p.summary, body: p.body, cover: file(p, p.cover), updated: p.updated })),
    pages: pages.map((p) => ({ title: p.title, slug: p.slug, body: p.body, seoDescription: p.seo_description })),
    redirects: redirects.map((r) => ({ from: r.from, to: r.to, code: r.code })),
    products: products.map((p) => ({
      id: p.id, kind: p.kind, title: p.title, slug: p.slug, summary: p.summary, description: p.description,
      images: p.images.map((n) => ({ src: fileUrl(p, n) })), price: p.price, stock: p.stock, eventDate: iso(p.event_date),
    })),
  }
}
