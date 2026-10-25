// ORTAK (core): template'ten gelir, sitede elle değiştirilmez (bun run core:sync). Rehber docs/geo-webmcp.md.
// /robots.txt, /llms.txt ve /llms-full.txt: site/src/lib/geo.ts varsa üretilir (lib/geo-load.ts). Aynı veri sayfalarla
// (PB ya da fixture) gelir. geo.ts `robots: false` ise robots.txt site tarafından (public/ ya da kendi rotası) verilir.
import type { APIRoute } from "astro"
import { loadGeo } from "../lib/geo-load"
import { llmsFullTxt, llmsTxt, robotsTxt } from "../lib/llms"

export async function getStaticPaths() {
  const g = await loadGeo()
  if (!g) return []
  return [...(g.robots === false ? [] : ["robots"]), "llms", "llms-full"].map((geo) => ({ params: { geo } }))
}

export const GET: APIRoute = async ({ params, site }) => {
  const g = (await loadGeo())!
  const base = site ?? "https://example.invalid"
  const text = params.geo === "robots" ? robotsTxt(g, base) : params.geo === "llms" ? llmsTxt(g, base) : llmsFullTxt(g, base)
  return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8" } })
}
