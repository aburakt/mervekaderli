import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { buildRedirects, parseStatic, problems } from "../site/src/lib/redirects"
import type { Redirect } from "../site/src/lib/types"

// SİTEYE ÖZEL: dist/_redirects üreticisi (site/src/lib/redirects.ts) ve panel kontrolü (pb/pb_hooks/lib/redirects.js).
const ROOT = join(import.meta.dir, "..")
const DATA = join(ROOT, "site", "src", "data")
const hook = require(join(ROOT, "pb", "pb_hooks", "lib", "redirects.js")) as { problem: (rules: { from: string; to: string }[], c: { from: string; to: string }) => string }
const content = JSON.parse(readFileSync(join(DATA, "content.json"), "utf8")) as { redirects: Redirect[] }
const fixed = existsSync(join(DATA, "redirects.txt")) ? readFileSync(join(DATA, "redirects.txt"), "utf8") : ""
const r = (from: string, to: string, code: Redirect["code"] = "301"): Redirect => ({ from, to, code })
const LINE = /^\/\S* (\/|https?:\/\/)\S* (200|301|302|303|307|308)$/

describe("_redirects dosyası", () => {
  test("fixture + redirects.txt Cloudflare Pages biçiminde ve tekrarsız", () => {
    const text = buildRedirects(content.redirects, fixed)
    const lines = text.split("\n").filter((l) => l && !l.startsWith("#"))
    expect(lines.length).toBeGreaterThan(0)
    for (const l of lines) expect(l).toMatch(LINE)
    const froms = lines.map((l) => l.split(" ")[0])
    expect(new Set(froms).size).toBe(froms.length)
    expect(text.endsWith("\n")).toBe(true)
  })

  test("panel kaydı sonunda / olan ve olmayan hâliyle yazılır; dosya ve * kuralı tek satır", () => {
    const text = buildRedirects([r("/eski", "/yeni/"), r("/a.html", "/"), r("/blog/*", "/yazilar/:splat", "302")])
    expect(text).toContain("\n/eski /yeni/ 301\n/eski/ /yeni/ 301\n")
    expect(text).toContain("\n/a.html / 301\n")
    expect(text).toContain("\n/blog/* /yazilar/:splat 302\n")
    expect(text).not.toContain("/a.html/")
  })

  test("sabit satırlar önce gelir, yorumlar atlanır, kod yoksa 302", () => {
    const text = buildRedirects([r("/p", "/q/")], "# yorum\n\n/s /t/\n")
    expect(text.split("\n").slice(1, 3)).toEqual(["/s /t/ 302", "/p /q/ 301"])
  })

  test("hatalı satır build'i kırar", () => {
    expect(() => parseStatic("/tek-alan\n")).toThrow()
    expect(() => parseStatic("/a /b 404\n")).toThrow()
    expect(() => buildRedirects([r("eski", "/yeni/")])).toThrow("/ ile başlamalı")
    expect(() => buildRedirects([r("/a", "/b/"), r("/a/", "/c/")])).toThrow("iki kez")
    expect(() => buildRedirects([r("/a", "/b/")], "/a/ /x/ 301")).toThrow("iki kez")
    expect(() => buildRedirects([r("/a", "/a/")])).toThrow("kendine")
    expect(() => buildRedirects([r("/a", "/b/"), r("/b", "/c"), r("/c/", "/a")])).toThrow("döngüsü")
    expect(() => buildRedirects([r("/blog/*", "/blog/yeni")])).toThrow("kapsamında")
  })

  test("Cloudflare sınırı: 100'den çok dinamik kural kırar", () => {
    const many = Array.from({ length: 101 }, (_, i) => ({ from: `/d${i}/*`, to: "/", code: "301", source: "t" }))
    expect(problems(many).join()).toContain("dinamik")
  })
})

describe("panel kontrolü (lib/redirects.js) build kontrolüyle aynı", () => {
  const rules = [{ from: "/b", to: "/c/" }, { from: "/c", to: "/a" }]
  test("geçerli kayıt kabul edilir", () => {
    expect(hook.problem(rules, { from: "/x", to: "/yazilar/" })).toBe("")
    expect(hook.problem(rules, { from: "/kampanya", to: "https://ornek.com/" })).toBe("")
  })
  test("biçim, tekrar ve döngü reddedilir", () => {
    expect(hook.problem(rules, { from: "eski", to: "/" })).toContain("/ ile başlamalı")
    expect(hook.problem(rules, { from: "/x", to: "ornek.com" })).toContain("https://")
    expect(hook.problem(rules, { from: "/b/", to: "/d/" })).toContain("zaten")
    expect(hook.problem(rules, { from: "/x/", to: "/x" })).toContain("aynı")
    expect(hook.problem(rules, { from: "/a/", to: "/b" })).toContain("döngüsü")
    expect(hook.problem(rules, { from: "/blog/*", to: "/blog/x" })).toContain("kendine")
  })
})
