// ORTAK (core): template'ten gelir, sitede elle değiştirilmez (bun run core:sync).
/**
 * Panel editöründen gelen HTML'i CSP'ye uygun hâle getirir: betik, stil, gömülü çerçeve ve olay öznitelikleri atılır;
 * `style`/`class` silinir (CSP style-src 'self'). Kaynak panel (yalnız yöneticiler yazar), yine de dışarıdan
 * yapıştırılmış metne karşı savunma.
 */
export function sanitize(html: string): string {
  return html
    .replace(/<(script|style|iframe|object|embed|form)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<(script|style|iframe|object|embed|link|meta)\b[^>]*\/?>/gi, "")
    .replace(/<[a-z][^>]*>/gi, (tag) =>
      tag
        .replace(/\s(?:on[a-z]+|style|class|id)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
        .replace(/\shref\s*=\s*(["'])\s*javascript:[^"']*\1/gi, "")
        .replace(/^<a\s(?![^>]*\brel=)/i, '<a rel="noopener" '))
}
