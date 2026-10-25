import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { startPb, type Pb } from "../scripts/pb-harness"
import { SITE } from "../site.config"

// ORTAK (core): template'ten gelir, sitede elle değiştirilmez. Kısıtlı superuser (pb_hooks/lib/guard.js).
let pb: Pb
let client = ""
let clientId = ""
const password = `Musteri-${crypto.randomUUID()}`
const as = (token: string, path: string, init: RequestInit = {}) =>
  pb.api(path, { ...init, headers: { ...(init.headers as Record<string, string>), authorization: token } })

beforeAll(async () => {
  pb = await startPb()
  const res = await pb.admin("/api/collections/_superusers/records", {
    method: "POST",
    body: JSON.stringify({ email: "musteri@ornek.test", password, passwordConfirm: password }),
  })
  expect(res.status).toBe(200)
  clientId = ((await res.json()) as { id: string }).id
  const auth = await pb.api("/api/collections/_superusers/auth-with-password", {
    method: "POST",
    body: JSON.stringify({ identity: "musteri@ornek.test", password }),
  })
  expect(auth.status).toBe(200)
  client = ((await auth.json()) as { token: string }).token
}, 120_000)
afterAll(async () => {
  await pb?.stop()
})

describe("müşteri (kısıtlı superuser)", () => {
  test("içerik kaydı ekler, düzenler, siler", async () => {
    const { collection, create, update } = SITE.hookSample
    const res = await as(client, `/api/collections/${collection}/records`, { method: "POST", body: JSON.stringify(create) })
    expect(res.status).toBe(200)
    const id = ((await res.json()) as { id: string }).id
    expect((await as(client, `/api/collections/${collection}/records/${id}`, { method: "PATCH", body: JSON.stringify(update(1)) })).status).toBe(200)
    expect((await as(client, `/api/collections/${collection}/records/${id}`, { method: "DELETE" })).status).toBe(204)
  })
  test("oturumunu yeniler ve kendi şifresini değiştirir, e-postasını değiştiremez", async () => {
    expect((await as(client, "/api/collections/_superusers/auth-refresh", { method: "POST" })).status).toBe(200)
    const next = `Yeni-${crypto.randomUUID()}`
    const pw = await as(client, `/api/collections/_superusers/records/${clientId}`, {
      method: "PATCH",
      body: JSON.stringify({ oldPassword: password, password: next, passwordConfirm: next }),
    })
    expect(pw.status).toBe(200)
    const auth = await pb.api("/api/collections/_superusers/auth-with-password", {
      method: "POST",
      body: JSON.stringify({ identity: "musteri@ornek.test", password: next }),
    })
    client = ((await auth.json()) as { token: string }).token
    expect((await as(client, `/api/collections/_superusers/records/${clientId}`, { method: "PATCH", body: JSON.stringify({ email: pb.email }) })).status).toBe(403)
  })
  test("şema, ayar, yedek ve hesap yönetimi kapalı", async () => {
    const { collection } = SITE.hookSample
    const blocked: [string, string, unknown?][] = [
      ["POST", "/api/collections", { name: "deneme", type: "base" }],
      ["PATCH", `/api/collections/${collection}`, { listRule: "" }],
      ["DELETE", `/api/collections/${collection}`],
      ["DELETE", `/api/collections/${collection}/truncate`],
      ["PUT", "/api/collections/import", { collections: [] }],
      ["PATCH", "/api/settings", { meta: { appName: "x" } }],
      ["POST", "/api/backups", { name: "x.zip" }],
      ["POST", "/api/collections/_superusers/records", { email: "ikinci@ornek.test", password, passwordConfirm: password }],
      ["DELETE", `/api/collections/_superusers/records/${clientId}`],
    ]
    for (const [method, path, body] of blocked) {
      const res = await as(client, path, { method, body: body === undefined ? undefined : JSON.stringify(body) })
      expect(`${method} ${path} ${res.status}`).toBe(`${method} ${path} 403`)
    }
    // okuma serbest: panel açılır
    expect((await as(client, "/api/collections?perPage=1")).status).toBe(200)
    expect((await as(client, "/api/settings")).status).toBe(200)
  })
  test("ajans hesabı yönetimi yapabilir", async () => {
    expect((await pb.admin("/api/settings", { method: "PATCH", body: JSON.stringify({}) })).status).toBe(200)
    expect((await pb.admin(`/api/collections/_superusers/records/${clientId}`, { method: "DELETE" })).status).toBe(204)
  })
})
