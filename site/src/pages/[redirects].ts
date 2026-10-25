import type { APIRoute } from "astro"
import { loadSite } from "../lib/content"
import { buildRedirects } from "../lib/redirects"

// dist/_redirects (Cloudflare Pages): site/src/data/redirects.txt (isteğe bağlı, elle yazılan sabit satırlar) + panel Yönlendirmeler.
// Astro "_" ile başlayan sayfa dosyalarını yok saydığı için adres parametreyle üretilir.
// site/public/_redirects varsa Astro bu dosyayı atlar (uyarı verir) ve elle yazılmış dosya olduğu gibi yayına çıkar;
// panel yönlendirmeleri o zaman çalışmaz. Birleştirmek için public/_redirects, src/data/redirects.txt'ye taşınır (biçim aynı).
const fixed = import.meta.glob<string>("../data/redirects.txt", { query: "?raw", import: "default", eager: true })

export function getStaticPaths() {
  return [{ params: { redirects: "_redirects" } }]
}

export const GET: APIRoute = async () => {
  const { redirects } = await loadSite()
  const text = buildRedirects(redirects, Object.values(fixed)[0] ?? "")
  return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8" } })
}
