// ORTAK (core): template'ten gelir, sitede elle değiştirilmez. Siteye özel biçimlendiriciler lib/format.ts'te kalır;
// format.ts bu fonksiyonları yeniden dışa açar (gerekirse kendi kısaltma listesiyle sarar).
//
// Türkçe büyük/küçük harf: toLowerCase/toUpperCase İ/ı'yı bozar ("İ" -> "i̇", "ı" -> "I" değil "ı"); hep yerel ayar verilir.

export type Locale = "tr" | "en"

/** "İSTANBUL" -> "istanbul", "IĞDIR" -> "ığdır" */
export const lower = (s: string, locale: Locale = "tr"): string => s.toLocaleLowerCase(locale)

/** "istanbul" -> "İSTANBUL", "ılgaz" -> "ILGAZ" */
export const upper = (s: string, locale: Locale = "tr"): string => s.toLocaleUpperCase(locale)

/** Kelime ve kesme işaretinden sonraki eki birlikte yakalar: "ANKARA'NIN", "2025’TE", "COP31". */
const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu
const APOSTROPHE = /['’]/

/**
 * "Baş Harfler Büyük" yazım. Her kelimenin ilk harfi büyük, kalanı küçük; özel ad eki küçük kalır ("ANKARA'NIN" -> "Ankara'nın").
 * `acronyms` (BÜYÜK harfle) ve rakam içeren kelimeler büyük kalır ("JCI'NIN" -> "JCI'nın", "COP31" -> "COP31").
 * "PLATİN SPONSOR" -> "Platin Sponsor", "ıspanak işi" -> "Ispanak İşi".
 */
export const titleCase = (s: string, locale: Locale = "tr", acronyms: ReadonlySet<string> = new Set()): string =>
  s.replace(WORD, (w) => {
    const cut = w.search(APOSTROPHE)
    const base = cut < 0 ? w : w.slice(0, cut)
    const suffix = cut < 0 ? "" : lower(w.slice(cut), locale)
    if (acronyms.has(upper(base, locale)) || /\p{N}/u.test(base)) return upper(base, locale) + suffix
    return lower(base, locale).replace(/^\p{L}/u, (c) => upper(c, locale)) + suffix
  })

/** Kaynakta TAMAMEN BÜYÜK yazılmış başlığı titleCase ile yumuşatır; karışık yazılmışı ve harfsizi ("2025") olduğu gibi bırakır. */
export const softCase = (s: string, locale: Locale = "tr", acronyms: ReadonlySet<string> = new Set()): string =>
  /\p{L}/u.test(s) && s === upper(s, locale) ? titleCase(s, locale, acronyms) : s
