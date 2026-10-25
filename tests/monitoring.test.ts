// ORTAK (core): tarayıcı hata takibi (ErrorTracking.astro) siteye doğru bağlanmış mı.
import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { allowConnect } from "../site/integrations/pb-csp"
import { GLITCHTIP_DSN } from "../site/src/lib/monitoring"

const ROOT = join(import.meta.dir, "..")
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8")

describe("tarayıcı hata takibi", () => {
  test("DSN boş ya da bu sitenin GlitchTip projesi", () => {
    if (GLITCHTIP_DSN) expect(GLITCHTIP_DSN).toMatch(/^https:\/\/[0-9a-f]{32}@glitchtip\.aburakt\.com\/\d+$/)
  })

  test("CSP: DSN varken build GlitchTip kökenini connect-src'ye ekler (pb-csp)", () => {
    expect(allowConnect("connect-src 'self';", new URL("https://k@glitchtip.aburakt.com/1").origin)).toBe("connect-src 'self' https://glitchtip.aburakt.com;")
  })

  test("GEO'lu her layout <ErrorTracking /> içerir", () => {
    const dir = join(ROOT, "site/src/layouts")
    const layouts = readdirSync(dir).filter((f) => f.endsWith(".astro"))
    const withGeo = layouts.filter((f) => read("site/src/layouts", f).includes("<Geo "))
    expect(withGeo.length).toBeGreaterThan(0)
    for (const f of withGeo) expect(read("site/src/layouts", f), f).toContain("<ErrorTracking />")
  })
})
