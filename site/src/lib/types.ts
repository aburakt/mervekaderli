export type Img = { src: ImageMetadata | string }

/** Site Ayarları (PB `settings`, tek kayıt). */
export type Settings = {
  companyName: string; phone: string; email: string; address: string
  heroTitle: string; heroText: string; heroImage?: Img; seoDescription: string; shareImage?: Img
  /** Cloudflare Web Analytics anahtarı; boşsa sayaç eklenmez. */
  cfAnalyticsToken?: string
}
/** Yazı (PB `posts`). `body` panel editöründen gelen HTML. `updated`: son düzenleme (PB `updated`; fixture'da yok), JSON-LD dateModified. */
export type Post = { title: string; slug: string; date: string; summary: string; body: string; cover?: Img; updated?: string }

/** Yönlendirme (PB `redirects`): eski adres -> yeni adres. Dosyaya site/src/lib/redirects.ts yazar. */
export type Redirect = { from: string; to: string; code: "301" | "302" }

/** Sayfa (PB `pages`): yasal metinler gibi tek metinlik sayfa, /<slug>/ adresinde. Yalnız yayındakiler gelir. */
export type Page = { title: string; slug: string; body: string; seoDescription: string }

export type Site = { settings: Settings; posts: Post[]; redirects: Redirect[]; pages: Page[] }
