// SİTEYE ÖZEL (template başlangıç dosyası, core değil): dil listesi, yollar, hreflang. Rehber docs/i18n.md.
// Tek dilli sitede LANGS tek dildir; yardımcılar öneksiz yol üretir, hreflang ve sitemap dil eki çıkmaz.
// LANGS, DEFAULT_LANG ve RESERVED_SLUGS pb/pb_hooks/site.js LANG ile aynı tutulur (tests/i18n.test.ts ölçer).

export const LANGS = ["tr"] as const
export type Lang = (typeof LANGS)[number]
export const DEFAULT_LANG: Lang = "tr"
/** Kayıt adresi (slug) olamayacak değerler: dil önekleri ve sitenin kendi yolları. */
export const RESERVED_SLUGS = ["tr", "api", "_astro", "yazilar"] as const
/** og:locale ve sitemap hreflang değerleri. */
export const LOCALES: Record<Lang, { og: string; hreflang: string; name: string }> = {
  tr: { og: "tr_TR", hreflang: "tr", name: "Türkçe" },
}

/** Yardımcıların okuduğu ayar; testler iki dilli bir ayarla çağırır. */
export type I18nConfig = { langs: readonly string[]; defaultLang: string; reserved: readonly string[] }
export const CONFIG: I18nConfig = { langs: LANGS, defaultLang: DEFAULT_LANG, reserved: RESERVED_SLUGS }
export const isMultilingual = (c: I18nConfig = CONFIG): boolean => c.langs.length > 1

export const isLang = (v: string, c: I18nConfig = CONFIG): boolean => c.langs.includes(v)
/** Varsayılan dil öneksiz, diğerleri /<dil>. */
export const prefix = (lang: string, c: I18nConfig = CONFIG): string => (lang === c.defaultLang ? "" : `/${lang}`)
/** Dilsiz yolu ("/yazilar/x/") o dilin yoluna çevirir ("/en/yazilar/x/"). */
export const localePath = (lang: string, path: string, c: I18nConfig = CONFIG): string =>
  `${prefix(lang, c)}${path.startsWith("/") ? path : `/${path}`}`
/** Yolun dilini önekten bulur; öneksiz yol varsayılan dildir. */
export const langOf = (path: string, c: I18nConfig = CONFIG): string => {
  const first = path.split("/")[1] ?? ""
  return first !== c.defaultLang && isLang(first, c) ? first : c.defaultLang
}

export type Translated = { lang: string; translation_group: string; slug: string }
export type Alternate = { lang: string; href: string }

/** Aynı translation_group'taki kayıtların dil/yol listesi (langs sırasıyla). Çevirisi olmayan kayıtta yalnız kendisi. */
export function alternatesFor<T extends Translated>(current: T, all: T[], pathOf: (r: T) => string, c: I18nConfig = CONFIG): Alternate[] {
  return all
    .filter((r) => r.translation_group === current.translation_group)
    .map((r) => ({ lang: r.lang, href: pathOf(r) }))
    .sort((a, b) => c.langs.indexOf(a.lang) - c.langs.indexOf(b.lang))
}

/** Sabit yollu sayfa (ana sayfa, liste) için her dilde aynı yol. */
export const sameInAll = (path: string, c: I18nConfig = CONFIG): Alternate[] => c.langs.map((lang) => ({ lang, href: localePath(lang, path, c) }))

/** Dil değiştirici: eşi olan dilde eşe, olmayanda o dilin ana sayfasına (404'e değil). */
export function switchLinks(current: string, alternates: Alternate[], c: I18nConfig = CONFIG): Alternate[] {
  return c.langs.filter((l) => l !== current).map((lang) => ({
    lang,
    href: alternates.find((a) => a.lang === lang)?.href ?? `${prefix(lang, c)}/`,
  }))
}

/**
 * <link rel="alternate" hreflang> listesi (x-default varsayılan dil). Eşi olmayan sayfada ve tek dilli sitede boş:
 * ölü ya da yalnız kendini gösteren hreflang yazılmaz.
 */
export function hreflangLinks(alternates: Alternate[], c: I18nConfig = CONFIG): { hreflang: string; href: string }[] {
  if (!isMultilingual(c) || alternates.length < 2) return []
  const links = alternates.map((a) => ({ hreflang: a.lang, href: a.href }))
  const def = alternates.find((a) => a.lang === c.defaultLang)
  return def ? [...links, { hreflang: "x-default", href: def.href }] : links
}

/** Build doğrulaması: ayrılmış adres ve aynı dilde yinelenen adres build'i kırar (PB'de de reddedilir). */
export function assertSlugs(records: Translated[], kind: string, c: I18nConfig = CONFIG): void {
  const seen = new Set<string>()
  for (const r of records) {
    if (c.reserved.includes(r.slug)) throw new Error(`${kind}: ayrılmış slug "${r.slug}" (${r.lang})`)
    if (!isLang(r.lang, c)) throw new Error(`${kind}: bilinmeyen dil "${r.lang}" (${r.slug})`)
    const key = `${r.lang}/${r.slug}`
    if (seen.has(key)) throw new Error(`${kind}: yinelenen ${key}`)
    seen.add(key)
  }
}

/** Build doğrulaması: aynı çeviri grubunda aynı dil iki kez olamaz. */
export function assertGroups(records: Translated[], kind: string): void {
  const seen = new Set<string>()
  for (const r of records) {
    const key = `${r.translation_group}/${r.lang}`
    if (seen.has(key)) throw new Error(`${kind}: aynı grupta aynı dil iki kez: ${key}`)
    seen.add(key)
  }
}

/** Kayıtları dile göre süzer (PB ve fixture aynı yoldan geçer). */
export const ofLang = <T extends { lang: string }>(records: T[], lang: string): T[] => records.filter((r) => r.lang === lang)
