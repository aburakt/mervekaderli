// ORTAK (core): template'ten gelir, sitede elle değiştirilmez. Rehber docs/geo-webmcp.md.
// GEO/WebMCP build çıktısı kontrolleri. site.config.ts `checks: [...GEO_CHECKS, ...]` ile verify'a girer
// (yalnız site/src/lib/geo.ts tanımlı sitede). tests/geo.test.ts ölçer.
import type { Check } from "./site-types"

/** Yapay zekâ botları: robots.txt'te açıkça bulunmalı (site/src/lib/llms.ts ANSWER_BOTS / TRAINING_BOTS'tan bir kısmı). */
const ROBOTS_MUST = ["OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "Claude-SearchBot", "Claude-User", "GPTBot", "ClaudeBot", "Google-Extended", "CCBot"]

export const GEO_CHECKS: Check[] = [
  // llmstxt.org: "# Ad", "> özet", "## Bölüm" ve "- [Başlık](adres)" listesi
  { name: "GEO: llms.txt", path: "/llms.txt", has: ["# ", "\n> ", "\n## ", "\n- ["] },
  { name: "GEO: llms-full.txt", path: "/llms-full.txt", has: ["\n---\n", "Kaynak: http"] },
  { name: "GEO: robots.txt yapay zekâ botları, sitemap ve llms.txt", path: "/robots.txt", has: [...ROBOTS_MUST.map((b) => `User-agent: ${b}\n`), "Sitemap: http", "/llms.txt"] },
  // ana sayfa sayfa listesinde (llms.txt ve WebMCP list_pages aynı listeden)
  { name: "GEO: webmcp.json ana sayfayı listeler", path: "/webmcp.json", has: ['"pages":[', '"path":"/"'] },
  // WebMCP betiği: components/Geo.astro'nun paketlenmiş betiği, aynı kökenden dış dosya (inline değil, CDN değil);
  // markdown eşi bağlantısı. Layout'ta <Geo path={path} /> yoksa kırmızı.
  { name: "GEO: ana sayfada WebMCP betiği (/_astro, dış dosya) ve markdown eşi", path: "/", has: ['<script type="module" src="/_astro/Geo.astro_astro_type_script', '<link rel="alternate" type="text/markdown" href="/index.md">'] },
  { name: "GEO: ana sayfanın markdown eşi", path: "/index.md", has: ["# ", "Kaynak: http"] },
]
