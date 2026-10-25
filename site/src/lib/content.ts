import content from "../data/content.json"
import { loadFromPb } from "./pb-loader"
import { isFixtureMode, pbUrl } from "./pb"
import type { Img, Redirect, Site } from "./types"

const assets = import.meta.glob<{ default: ImageMetadata }>("../assets/media/*.webp", { eager: true })

/** content.json'daki görsel adı -> optimize edilecek yerel görsel. Yoksa build kırılır. */
export function localImage(name: string): Img {
  const mod = assets[`../assets/media/${name}`]
  if (!mod) throw new Error(`görsel yok: ${name}`)
  return { src: mod.default }
}

function fromFixture(): Site {
  // PB yalnız yayındaki sayfaları verir (published = true); fixture da aynısını yapar
  const pages = content.pages.filter((p) => p.published).map((p) => ({ title: p.title, slug: p.slug, body: p.body, seoDescription: p.seoDescription }))
  return { settings: content.settings, posts: content.posts, redirects: content.redirects as Redirect[], pages }
}

let cache: Promise<Site> | undefined

/** Tüm içeriği bir kez yükler. CONTENT_SOURCE=fixture dışında PB gerekir; yoksa build kırılır. */
export function loadSite(): Promise<Site> {
  if (isFixtureMode()) return (cache ??= Promise.resolve(fromFixture()))
  pbUrl() // PB_URL yoksa burada hata fırlatır; build kırılır, boş site yayına çıkmaz
  return (cache ??= loadFromPb())
}
