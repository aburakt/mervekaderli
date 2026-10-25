// ORTAK (core): template'ten gelir, sitede elle değiştirilmez (bun run core:sync).
// Marka görselleri (pages/brand/[file].png.ts): e-posta logosu, panel logosu ve panel sekme simgesi.
// E-posta logosu: Gmail ve Outlook SVG göstermez. site/public/logo.svg'den şeffaf PNG üretilir (pages/brand/[file].png.ts).
// Kutu 400x80 px (e-postada 200x40 gösterilir, yüksek yoğunluklu ekranda keskin): kenar boşluğu kırpılan logo oranı korunarak sığdırılır,
// kutuda ortalanır. pb_hooks/lib/mail.js img'ye width=200 height=40 yazar; kutu sabit olduğu için Outlook da doğru ölçer.
import sharp from "sharp"

export const MAIL_LOGO = { width: 400, height: 80 } as const

export async function mailLogoPng(svg: string | Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const src = Buffer.from(svg)
  const { width: W, height: H } = MAIL_LOGO
  // SVG'nin kendi boyutundan bağımsız keskin çizim: kutuyu dolduracak ölçeğin iki katı yoğunlukla rasterleştirilir
  const meta = await sharp(src).metadata()
  const scale = Math.min(W / (meta.width || W), H / (meta.height || H))
  const density = Math.max(72, Math.min(2400, Math.round(72 * scale * 2)))
  // şeffaf kenar kırpılır (SVG'nin kendi boşluğu logoyu küçültmesin), sonra kutuya sığdırılır
  const drawn = await sharp(src, { density }).png().toBuffer()
  const logo = await sharp(drawn).trim({ threshold: 1 }).resize({ width: W, height: H, fit: "inside" }).png().toBuffer()
  const m = await sharp(logo).metadata()
  const png = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: logo, left: Math.round((W - (m.width ?? W)) / 2), top: Math.round((H - (m.height ?? H)) / 2) }])
    .png({ compressionLevel: 9 })
    .toBuffer()
  return new Uint8Array(png)
}

// Panel logosu (/brand/logo-panel.png): kenar boşluğu kırpılmış logo, 112 px yükseklik (panelde en çok 56 px, iki kat
// yoğunluk), genişlik en çok 640 px. Panel kutusu sabit değil: kırpılmış logo giriş ekranını ve üst çubuğu doldurur.
export const PANEL_LOGO = { width: 640, height: 112 } as const

export async function panelLogoPng(svg: string | Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const src = Buffer.from(svg)
  const { width: W, height: H } = PANEL_LOGO
  const meta = await sharp(src).metadata()
  const scale = Math.min(W / (meta.width || W), H / (meta.height || H))
  const density = Math.max(72, Math.min(2400, Math.round(72 * scale * 2)))
  // önce büyük çizilir, sonra şeffaf kenar kırpılır, en son kutuya sığdırılır (büyütülmez)
  const big = await sharp(src, { density }).png().toBuffer()
  const trimmed = await sharp(big).trim({ threshold: 1 }).png().toBuffer()
  const png = await sharp(trimmed).resize({ width: W, height: H, fit: "inside", withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer()
  return new Uint8Array(png)
}

// Sekme simgesi (/brand/icon.png): sitenin favicon'u (svg ya da png), 128x128 şeffaf kare, oran korunarak ortada.
export const PANEL_ICON = 128

export async function iconPng(src: string | Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const input = Buffer.from(src)
  const meta = await sharp(input).metadata()
  const density = meta.format === "svg" ? Math.max(72, Math.min(2400, Math.round((72 * PANEL_ICON * 2) / Math.max(meta.width || 1, meta.height || 1)))) : undefined
  const png = await sharp(input, density ? { density } : {})
    .resize({ width: PANEL_ICON, height: PANEL_ICON, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer()
  return new Uint8Array(png)
}
