// ORTAK (core): template'ten gelir, sitede elle değiştirilmez (bun run core:sync). Rehber docs/geo-webmcp.md.
//
// Sitenin GEO tanımını (siteye ait site/src/lib/geo.ts, `geo()`) yükler. Dosya yoksa undefined: llms.txt, robots.txt,
// markdown eşleri ve /webmcp.json üretilmez, build kırılmaz (core:sync ile gelen sitede geo.ts eklenene kadar).
import type { GeoSite } from "./llms"

const mods = import.meta.glob<{ geo: () => Promise<GeoSite> }>("./geo.ts")

let cache: Promise<GeoSite | undefined> | undefined

export function loadGeo(): Promise<GeoSite | undefined> {
  const load = Object.values(mods)[0]
  return (cache ??= load ? load().then((m) => m.geo()) : Promise.resolve(undefined))
}
