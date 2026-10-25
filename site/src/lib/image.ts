// ORTAK (core): template'ten gelir, sitede elle değiştirilmez (bun run core:sync).
import { getImage, inferRemoteSize } from "astro:assets"
import type { Img } from "./types"

/** Panelden (PB) gelen raster görsel mi? SVG ve diğerleri olduğu gibi kullanılır. */
export const isRemoteRaster = (src: Img["src"]): src is string => typeof src === "string" && /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(src)

const sizes = new Map<string, Promise<{ width: number; height: number }>>()
/** Uzak görselin asıl boyutu (aynı adres için bir kez ölçülür). */
export const remoteSize = (src: string) => {
  let p = sizes.get(src)
  if (!p) sizes.set(src, (p = inferRemoteSize(src).then((s) => ({ width: s.width, height: s.height }))))
  return p
}

/**
 * Panel görselinin build'deki boyutları: istenen genişliği aşmaz, asıl dosyadan büyütmez,
 * srcset genişlikleri de asıl genişlikle sınırlanır. Yükseklik oranı korunur (kırpma CSS'te).
 */
export async function remoteDims(src: string, width = 1200, widths = [480, 800, 1200]) {
  const o = await remoteSize(src)
  const w = Math.min(width, o.width)
  return { width: w, height: Math.round((o.height * w) / o.width), widths: [...new Set([...widths.filter((x) => x < w), w])] }
}

/** Paylaşım görseli (og:image): 1200 px'i aşmayan JPEG. */
export async function shareImageUrl(img: Img): Promise<string> {
  if (!isRemoteRaster(img.src)) return typeof img.src === "string" ? img.src : img.src.src
  const { width, height } = await remoteDims(img.src, 1200)
  return (await getImage({ src: img.src, width, height, format: "jpg", quality: 82 })).src
}
