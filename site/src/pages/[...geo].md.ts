// ORTAK (core): template'ten gelir, sitede elle değiştirilmez (bun run core:sync). Rehber docs/geo-webmcp.md.
// Sayfaların markdown eşleri: /index.md, /yazilar/x/index.md. Yalnız geo.ts'te içeriği (content) olan sayfalar;
// HTML sayfa <link rel="alternate" type="text/markdown"> ile gösterir (components/Geo.astro).
import type { APIRoute } from "astro"
import { loadGeo } from "../lib/geo-load"
import { contentPages, type GeoPage, mdParam, pageMarkdown } from "../lib/llms"

export async function getStaticPaths() {
  const g = await loadGeo()
  if (!g || g.markdown === false) return []
  return contentPages(g).map((page) => ({ params: { geo: mdParam(page.path) }, props: { page } }))
}

export const GET: APIRoute = ({ props, site }) =>
  new Response(pageMarkdown((props as { page: GeoPage }).page, site ?? "https://example.invalid"), {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  })
