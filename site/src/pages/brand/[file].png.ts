// ORTAK (core): template'ten gelir, sitede elle değiştirilmez (bun run core:sync).
// Marka görselleri (lib/mail-logo.ts), yalnız kaynağı varsa üretilir:
//   /brand/logo-mail.png   site/public/logo.svg'den e-posta logosu (400x80 kutu). pb_hooks/site.js BRAND.logo bu adrestir.
//   /brand/logo-panel.png  aynı logo, kenarı kırpılmış (panel giriş ekranı ve üst çubuk; BRAND.logo'nun yanından okunur).
//   /brand/icon.png        site/public/favicon.svg (yoksa favicon.png) kaynaklı 128x128 sekme simgesi; BRAND.icon bu adrestir.
// Logo yoksa e-postalar ve panel site adını yazıyla, simge yoksa panel baş harfli rozeti gösterir.
import type { APIRoute } from "astro"
import { iconPng, mailLogoPng, panelLogoPng } from "../../lib/mail-logo"

const logos = import.meta.glob<string>("/public/logo.svg", { query: "?raw", import: "default" })
// svg metin olarak, png data: adresi olarak (ikisi de build'e gömülür, dosya yolu gerekmez)
const icons = {
  ...import.meta.glob<string>("/public/favicon.svg", { query: "?raw", import: "default" }),
  ...import.meta.glob<string>("/public/favicon.png", { query: "?inline", import: "default" }),
}

async function read(path: string): Promise<Uint8Array> {
  const text = await icons[path]!()
  return path.endsWith(".png") ? Uint8Array.from(Buffer.from(text.replace(/^data:[^,]*,/, ""), "base64")) : Buffer.from(text)
}

function iconSource(): string | undefined {
  const keys = Object.keys(icons)
  return keys.find((k) => k.endsWith(".svg")) ?? keys[0]
}

export function getStaticPaths() {
  const files = Object.keys(logos).length ? ["logo-mail", "logo-panel"] : []
  if (iconSource()) files.push("icon")
  return files.map((file) => ({ params: { file } }))
}

export const GET: APIRoute = async ({ params }) => {
  let png: Uint8Array<ArrayBuffer>
  if (params.file === "icon") png = await iconPng(await read(iconSource()!))
  else {
    const svg = await Object.values(logos)[0]!()
    png = params.file === "logo-panel" ? await panelLogoPng(svg) : await mailLogoPng(svg)
  }
  return new Response(png, { headers: { "content-type": "image/png" } })
}
