import { describe, expect, test } from "bun:test"
import { createRequire } from "node:module"
import {
  CONFIG, DEFAULT_LANG, type I18nConfig, LANGS, LOCALES, RESERVED_SLUGS, type Translated,
  alternatesFor, assertGroups, assertSlugs, hreflangLinks, isMultilingual, langOf, localePath, prefix, sameInAll, switchLinks,
} from "../site/src/lib/i18n"

// SİTEYE ÖZEL: site/src/lib/i18n.ts yardımcıları ve PB ayarıyla eşitliği (docs/i18n.md).
const site = createRequire(import.meta.url)("../pb/pb_hooks/site.js") as { LANG?: { langs: string[]; default: string; reserved: string[] } }

describe("site ve PB aynı dil ayarını kullanır", () => {
  test("LANGS, DEFAULT_LANG ve RESERVED_SLUGS pb_hooks/site.js LANG ile aynı", () => {
    expect(site.LANG).toBeDefined()
    expect([...LANGS]).toEqual(site.LANG!.langs)
    expect(DEFAULT_LANG).toBe(site.LANG!.default)
    expect([...RESERVED_SLUGS].sort()).toEqual([...site.LANG!.reserved].sort())
  })
  test("her dil kodu ayrılmış (dil öneki kayıt adresi olamaz) ve her dilin yerel ayarı var", () => {
    for (const l of LANGS) {
      expect(RESERVED_SLUGS as readonly string[]).toContain(l)
      expect(LOCALES[l]?.og).toMatch(/^[a-z]{2}_[A-Z]{2}$/)
    }
  })
})

describe("tek dilli template: çıktı değişmez", () => {
  test("öneksiz yollar, hreflang yok", () => {
    if (isMultilingual()) return // çok dilli sitede aşağıdaki iki dilli testler geçerlidir
    expect(prefix(DEFAULT_LANG)).toBe("")
    expect(localePath(DEFAULT_LANG, "/yazilar/x/")).toBe("/yazilar/x/")
    expect(hreflangLinks(sameInAll("/"))).toEqual([])
    expect(switchLinks(DEFAULT_LANG, [])).toEqual([])
  })
})

const TWO: I18nConfig = { langs: ["tr", "en"], defaultLang: "tr", reserved: ["tr", "en", "api", "_astro", "yazilar"] }
const r = (lang: string, group: string, slug: string): Translated => ({ lang, translation_group: group, slug })

describe("iki dilli ayarla yardımcılar", () => {
  test("varsayılan dil öneksiz, diğeri /en önekli, sonda /", () => {
    expect(prefix("tr", TWO)).toBe("")
    expect(prefix("en", TWO)).toBe("/en")
    expect(localePath("en", "/", TWO)).toBe("/en/")
    expect(localePath("en", "yazilar/x/", TWO)).toBe("/en/yazilar/x/")
    expect(localePath("tr", "/yazilar/x/", TWO)).toBe("/yazilar/x/")
  })
  test("langOf yolun dilini önekten bulur", () => {
    expect(langOf("/en/yazilar/x/", TWO)).toBe("en")
    expect(langOf("/yazilar/x/", TWO)).toBe("tr")
    expect(langOf("/tr/", TWO)).toBe("tr")
    expect(langOf("/", TWO)).toBe("tr")
  })
  const all = [r("tr", "g1", "hakkimizda"), r("en", "g1", "about"), r("tr", "g2", "yalniz-tr")]
  const path = (x: Translated) => localePath(x.lang, `/${x.slug}/`, TWO)
  test("alternatesFor: eşler langs sırasıyla; çevirisiz kayıtta yalnız kendisi", () => {
    expect(alternatesFor(all[1]!, all, path, TWO)).toEqual([{ lang: "tr", href: "/hakkimizda/" }, { lang: "en", href: "/en/about/" }])
    expect(alternatesFor(all[2]!, all, path, TWO)).toEqual([{ lang: "tr", href: "/yalniz-tr/" }])
  })
  test("switchLinks: eşi varsa eşe, yoksa o dilin ana sayfasına (404 değil)", () => {
    expect(switchLinks("tr", alternatesFor(all[0]!, all, path, TWO), TWO)).toEqual([{ lang: "en", href: "/en/about/" }])
    expect(switchLinks("tr", alternatesFor(all[2]!, all, path, TWO), TWO)).toEqual([{ lang: "en", href: "/en/" }])
  })
  test("hreflangLinks: eşleri ve x-default; çevirisiz sayfada boş", () => {
    expect(hreflangLinks(alternatesFor(all[0]!, all, path, TWO), TWO)).toEqual([
      { hreflang: "tr", href: "/hakkimizda/" }, { hreflang: "en", href: "/en/about/" }, { hreflang: "x-default", href: "/hakkimizda/" },
    ])
    expect(hreflangLinks(alternatesFor(all[2]!, all, path, TWO), TWO)).toEqual([])
    expect(hreflangLinks(sameInAll("/", TWO), TWO).map((l) => l.href)).toEqual(["/", "/en/", "/"])
  })
  test("assertSlugs: ayrılmış, bilinmeyen dil ve aynı dilde yinelenen adres build'i kırar", () => {
    for (const s of TWO.reserved) expect(() => assertSlugs([r("tr", "g", s)], "pages", TWO)).toThrow(/ayrılmış slug/)
    expect(() => assertSlugs([r("de", "g", "x")], "pages", TWO)).toThrow(/bilinmeyen dil/)
    expect(() => assertSlugs([r("tr", "a", "x"), r("tr", "b", "x")], "pages", TWO)).toThrow(/yinelenen/)
    expect(() => assertSlugs([r("tr", "a", "x"), r("en", "a", "x")], "pages", TWO)).not.toThrow()
  })
  test("assertGroups: aynı grupta aynı dil iki kez build'i kırar", () => {
    expect(() => assertGroups([r("tr", "g", "a"), r("tr", "g", "b")], "pages")).toThrow(/aynı grupta/)
    expect(() => assertGroups([r("tr", "g", "a"), r("en", "g", "b")], "pages")).not.toThrow()
  })
  test("varsayılan ayar CONFIG site dilleridir", () => {
    expect(CONFIG.langs).toEqual(LANGS)
    expect(CONFIG.defaultLang).toBe(DEFAULT_LANG)
  })
})
