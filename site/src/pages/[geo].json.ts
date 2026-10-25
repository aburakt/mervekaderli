// ORTAK (core): template'ten gelir, sitede elle değiştirilmez (bun run core:sync). Rehber docs/geo-webmcp.md.
// /webmcp.json: WebMCP araçlarının (scripts/webmcp.ts) okuduğu veri; site/src/lib/geo.ts varsa üretilir.
import type { APIRoute } from "astro"
import { loadGeo } from "../lib/geo-load"
import { webmcpData } from "../lib/webmcp"

export async function getStaticPaths() {
  return (await loadGeo()) ? [{ params: { geo: "webmcp" } }] : []
}

export const GET: APIRoute = async ({ site }) =>
  new Response(JSON.stringify(webmcpData((await loadGeo())!, site ?? "https://example.invalid")), {
    headers: { "content-type": "application/json; charset=utf-8" },
  })
