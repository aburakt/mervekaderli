import content from "../data/content.json"
import { loadFromPb } from "./pb-loader"
import { isFixtureMode, pbUrl } from "./pb"
import type { Img, Product, Redirect, Site } from "./types"

const assets = import.meta.glob<{ default: ImageMetadata }>("../assets/media/*.webp", { eager: true })

/** content.json'daki görsel adı -> optimize edilecek yerel görsel. Yoksa build kırılır. */
export function localImage(name: string): Img {
  const mod = assets[`../assets/media/${name}`]
  if (!mod) throw new Error(`görsel yok: ${name}`)
  return { src: mod.default }
}
const optional = (name: string | undefined): Img | undefined => (name ? localImage(name) : undefined)

function fromFixture(): Site {
  const { heroImage, aboutImage, ...settings } = content.settings
  // PB yalnız yayındaki sayfaları verir (published = true); fixture da aynısını yapar
  const pages = content.pages.filter((p) => p.published).map((p) => ({ title: p.title, slug: p.slug, body: p.body, seoDescription: p.seoDescription }))
  const products: Product[] = content.products.map((p) => ({
    id: p.id, kind: p.kind as Product["kind"], title: p.title, slug: p.slug, summary: p.summary, description: p.description,
    images: p.images.map(localImage), price: p.price, stock: p.stock, eventDate: "eventDate" in p ? p.eventDate : undefined,
  }))
  return {
    settings: { ...settings, heroImage: optional(heroImage), aboutImage: optional(aboutImage) },
    posts: content.posts, redirects: content.redirects as Redirect[], pages, products,
  }
}

let cache: Promise<Site> | undefined

/** Tüm içeriği bir kez yükler. CONTENT_SOURCE=fixture dışında PB gerekir; yoksa build kırılır. */
export function loadSite(): Promise<Site> {
  if (isFixtureMode()) return (cache ??= Promise.resolve(fromFixture()))
  pbUrl() // PB_URL yoksa burada hata fırlatır; build kırılır, boş site yayına çıkmaz
  return (cache ??= loadFromPb())
}
