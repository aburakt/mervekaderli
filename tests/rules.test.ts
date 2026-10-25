import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { startPb, type Pb } from "../scripts/pb-harness"
import { type Content, loadContent, seed } from "../scripts/seed"

// SİTEYE ÖZEL: tohumlanan içerik, taslak sızıntısı ve panel korumaları. Genel standartlar tests/core.test.ts'te.
let pb: Pb
let content: Content
beforeAll(async () => {
  content = await loadContent()
  pb = await startPb()
  await seed(pb)
}, 300_000)
afterAll(async () => {
  await pb?.stop()
})

type Rec = { id: string; slug: string }
const list = async (c: string, qs = "") => {
  const res = await pb.api(`/api/collections/${c}/records?perPage=1&${qs}`)
  return { status: res.status, total: ((await res.json()) as { totalItems: number }).totalItems }
}
const create = (c: string, body: Record<string, unknown>) => pb.admin(`/api/collections/${c}/records`, { method: "POST", body: JSON.stringify(body) })
const patch = (c: string, id: string, body: Record<string, unknown>) => pb.admin(`/api/collections/${c}/records/${id}`, { method: "PATCH", body: JSON.stringify(body) })
const del = (c: string, id: string) => pb.admin(`/api/collections/${c}/records/${id}`, { method: "DELETE" })
const firstId = async (c: string): Promise<string> => ((await (await pb.admin(`/api/collections/${c}/records?perPage=1`)).json()) as { items: Rec[] }).items[0]!.id
const post = { date: "2026-10-08 00:00:00.000Z", summary: "x", body: "<p>x</p>" }

describe("içerik tohumlandı", () => {
  test("anonim okuyucu beklenen sayıda kayıt görür", async () => {
    expect((await list("settings")).total).toBe(1)
    expect((await list("posts")).total).toBe(content.posts.length)
    expect((await list("redirects")).total).toBe(content.redirects.length)
    expect((await list("pages")).total).toBe(content.pages.filter((p) => p.published).length)
  })
})

describe("taslak sızıntısı", () => {
  test("yayında olmayan yazı anonim listede ve id ile görünmez", async () => {
    const res = await create("posts", { ...post, title: "Taslak", published: false })
    expect(res.status).toBe(200)
    const id = ((await res.json()) as Rec).id
    expect((await list("posts", "filter=" + encodeURIComponent("published = false"))).total).toBe(0)
    expect((await pb.api(`/api/collections/posts/records/${id}`)).status).toBe(404)
  })
})

describe("panel korumaları", () => {
  test("ziyaret sayacı anahtarı boş ya da 32 onaltılı karakter olur", async () => {
    const id = await firstId("settings")
    expect((await patch("settings", id, { cf_analytics_token: "<script>" })).status).toBe(400)
    expect((await patch("settings", id, { cf_analytics_token: "0123456789abcdef0123456789abcdef" })).status).toBe(200)
    expect((await patch("settings", id, { cf_analytics_token: "" })).status).toBe(200)
  })
  test("Site Ayarları tek kayıttır ve silinemez", async () => {
    expect((await create("settings", { company_name: "x", hero_title: "x" })).status).toBe(400)
    expect((await del("settings", await firstId("settings"))).status).toBe(400)
  })
  test("yazı adresi Türkçe başlıktan üretilir, benzersizdir ve sonra değiştirilemez", async () => {
    const a = (await (await create("posts", { ...post, title: "Şubat'ta İğdır Gezisi", published: true })).json()) as Rec
    expect(a.slug).toBe("subatta-igdir-gezisi")
    const b = (await (await create("posts", { ...post, title: "Şubat'ta İğdır Gezisi", published: true })).json()) as Rec
    expect(b.slug).toBe("subatta-igdir-gezisi-2")
    expect((await patch("posts", a.id, { slug: "baska" })).status).toBe(400)
    expect((await patch("posts", a.id, { title: "Yeni başlık" })).status).toBe(200)
  })
})

describe("yönlendirmeler", () => {
  test("biçimsiz, tekrarlanan ve döngü kuran kayıt panelde reddedilir", async () => {
    const r = (from: string, to: string) => create("redirects", { from, to, code: "301", published: true })
    expect((await r("eski-adres", "/")).status).toBe(400)
    expect((await r("/x", "ornek.com")).status).toBe(400)
    expect((await r("/kampanya", "/yazilar/")).status).toBe(200)
    expect((await r("/kampanya/", "/")).status).toBe(400)
    expect((await r("/dongu-a", "/dongu-b/")).status).toBe(200)
    expect((await r("/dongu-b", "/dongu-a")).status).toBe(400)
    const res = await r("/dongu-c", "/yazilar/")
    expect(res.status).toBe(200)
    const id = ((await res.json()) as Rec).id
    expect((await patch("redirects", id, { to: "/dongu-c/" })).status).toBe(400)
  })
  test("yayında olmayan yönlendirme anonim listede görünmez", async () => {
    const before = (await list("redirects")).total
    expect((await create("redirects", { from: "/taslak", to: "/", code: "302", published: false })).status).toBe(200)
    expect((await list("redirects")).total).toBe(before)
  })
})

describe("sayfalar (yasal metinler)", () => {
  test("taslak sayfa anonim okuyucuya görünmez; adres başlıktan üretilir ve kilitlenir", async () => {
    const res = await create("pages", { title: "Kullanım Koşulları", body: "<p>x</p>", published: false })
    expect(res.status).toBe(200)
    const page = (await res.json()) as Rec
    expect(page.slug).toBe("kullanim-kosullari")
    expect((await pb.api(`/api/collections/pages/records/${page.id}`)).status).toBe(404)
    expect((await patch("pages", page.id, { slug: "kosullar" })).status).toBe(400)
  })
})
