// @ts-check
import { defineConfig } from "astro/config"
import sitemap from "@astrojs/sitemap"
import tailwindcss from "@tailwindcss/vite"
import pbCsp from "./integrations/pb-csp"
import { DEFAULT_LANG, LANGS, LOCALES } from "./src/lib/i18n.ts"

const site = process.env.PUBLIC_SITE_URL ?? "https://ornek.pages.dev"
// Çok dilli sitede sitemap her adrese hreflang eşlerini yazar (lib/i18n.ts); tek dilde ayar eklenmez, çıktı değişmez.
const i18n = LANGS.length > 1
  ? { i18n: { defaultLocale: DEFAULT_LANG, locales: Object.fromEntries(LANGS.map((l) => [l, LOCALES[l].hreflang])) } }
  : {}
/** Yazıların tarihleri (site/src/lib/seo.ts recordLastmod); build ile sitemap aynı süreçte çalışır. */
const lastmods = () => /** @type {{ __sitemapLastmod?: Map<string, string> }} */ (globalThis).__sitemapLastmod
const pbHost = process.env.PB_URL ? new URL(process.env.PB_URL).hostname : "localhost"

export default defineConfig({
  site,
  trailingSlash: "always",
  build: { format: "directory", inlineStylesheets: "never" },
  integrations: [
    sitemap({
      filter: (page) => !page.endsWith("/404/"),
      ...i18n,
      // lastmod: tarihi olan sayfalar (yazılar) build sırasında kaydeder (site/src/lib/seo.ts recordLastmod)
      serialize: (item) => {
        const lastmod = lastmods()?.get(new URL(item.url).pathname)
        return lastmod ? { ...item, lastmod } : item
      },
    }),
    pbCsp(),
  ],
  image: { domains: [pbHost] },
  vite: { plugins: [tailwindcss()], build: { assetsInlineLimit: 0 } },
})
