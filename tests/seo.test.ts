import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { cfBeacon, jsonLdText, organizationJsonLd } from "../site/src/lib/seo"
import type { Settings } from "../site/src/lib/types"

// SİTEYE ÖZEL: Site Ayarları'ndan üretilen yapılandırılmış veri (site/src/lib/seo.ts).
const base: Settings = { companyName: "Örnek Kurum", phone: "", email: "", address: "", heroTitle: "x", heroText: "", seoDescription: "" }
const SITE = "https://www.ornek.com.tr"

describe("kurum yapılandırılmış verisi", () => {
  test("adres ve telefon yoksa Organization, boş alan yazılmaz", () => {
    expect(organizationJsonLd(base, SITE)).toEqual({
      "@context": "https://schema.org", "@type": "Organization", "@id": `${SITE}/#organization`, name: "Örnek Kurum", url: `${SITE}/`,
    })
  })
  test("adres ya da telefon varsa LocalBusiness; telefon uluslararası, adres tek satır", () => {
    const d = organizationJsonLd({ ...base, phone: "0 312 000 00 00", address: "Örnek Mah.\nÇankaya / Ankara", email: "info@ornek.com.tr" }, SITE, `${SITE}/og.jpg`)
    expect(d["@type"]).toBe("LocalBusiness")
    expect(d.telephone).toBe("+903120000000")
    expect(d.address).toEqual({ "@type": "PostalAddress", streetAddress: "Örnek Mah., Çankaya / Ankara", addressCountry: "TR" })
    expect(d.image).toBe(`${SITE}/og.jpg`)
  })
  test("panelden gelen metin betik etiketini kapatamaz", () => {
    const text = jsonLdText(organizationJsonLd({ ...base, companyName: "</script><script>alert(1)</script>" }, SITE))
    expect(text).not.toContain("<")
    expect(JSON.parse(text).name).toBe("</script><script>alert(1)</script>")
  })
})

describe("Cloudflare Web Analytics", () => {
  test("anahtar varsa data-cf-beacon JSON'u, yoksa ya da biçimsizse sayaç yok", () => {
    expect(cfBeacon(" 0123456789abcdef0123456789abcdef ")).toBe('{"token":"0123456789abcdef0123456789abcdef"}')
    expect(cfBeacon("")).toBeUndefined()
    expect(cfBeacon(undefined)).toBeUndefined()
    expect(cfBeacon('x"}<script>')).toBeUndefined()
  })
  test("CSP betiğe ve ölçüm adresine izin verir, başka dış kaynağa değil", () => {
    const csp = readFileSync(join(import.meta.dir, "..", "site", "public", "_headers"), "utf8")
    expect(csp).toContain("script-src 'self' https://static.cloudflareinsights.com;")
    expect(csp).toContain("connect-src 'self' https://cloudflareinsights.com;")
    expect(csp).toContain("style-src 'self';")
  })
})
