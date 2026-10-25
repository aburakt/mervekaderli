import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { startPb, type Pb } from "../scripts/pb-harness"
import * as site from "../scripts/seed"
import { connect, type SeedModule, seedRemote, settingsEmpty } from "../scripts/seed-remote"

// ORTAK (core): template'ten gelir, sitede elle değiştirilmez. scripts/seed-remote.ts'in güvenlik davranışı her sitede:
// boş PB tohumlanır; dolu PB'de panelde yazılan ezilmez (fillEmpty yoksa reddedilir); kimlik bilgisi hata mesajına girmez.
const mod: SeedModule = site
const isEmpty = (p: Pb) => (mod.isEmpty ?? settingsEmpty)(p)
let pb: Pb
let remote: Pb
const password = `Seed-${crypto.randomUUID()}`
beforeAll(async () => {
  pb = await startPb()
  // canlıdaki gibi ayrı bir hesapla bağlanılır
  const email = `seed-remote@${pb.email.split("@")[1]}`
  const res = await pb.admin("/api/collections/_superusers/records", {
    method: "POST",
    body: JSON.stringify({ email, password, passwordConfirm: password }),
  })
  if (!res.ok) throw new Error(`superuser açılamadı: ${res.status} ${await res.text()}`)
  remote = await connect(`${pb.url}/`, email, password)
}, 300_000)
afterAll(async () => {
  await pb?.stop()
})

type Rec = Record<string, unknown> & { id: string }
const firstSettings = async (): Promise<Rec> =>
  ((await (await pb.admin("/api/collections/settings/records?perPage=1&sort=created")).json()) as { items: Rec[] }).items[0]!

describe("seed-remote", () => {
  test("yanlış parola: yalnız durum kodu, parola mesajda yok", async () => {
    const wrong = `Yanlis-${crypto.randomUUID()}`
    const err = await connect(pb.url, remote.email, wrong).then(() => undefined, (e: Error) => e)
    expect(err?.message).toMatch(/^giriş başarısız: \d+$/)
    expect(err?.message).not.toContain(wrong)
  })

  test("boş PB tohumlanır", async () => {
    expect(await isEmpty(remote)).toBe(true)
    expect(await seedRemote(remote, mod)).toBe("tohumlama tamam")
    expect(await isEmpty(remote)).toBe(false)
  }, 120_000)

  test("dolu PB'de panelde yazılan ezilmez", async () => {
    const before = await firstSettings()
    // panelde düzenlenmiş gibi: dolu bir düz metin alanı değiştirilir
    const schema = (await (await pb.admin("/api/collections/settings")).json()) as { fields: { name: string; type: string; system: boolean }[] }
    const field = schema.fields.find((f) => f.type === "text" && !f.system && typeof before[f.name] === "string" && before[f.name] !== "")?.name
    expect(field).toBeDefined()
    const edited = "panelde yazıldı"
    const patch = await pb.admin(`/api/collections/settings/records/${before.id}`, { method: "PATCH", body: JSON.stringify({ [field!]: edited }) })
    expect(patch.ok).toBe(true)
    const counts = async () => ((await (await pb.admin("/api/collections/settings/records?perPage=1")).json()) as { totalItems: number }).totalItems

    const n = await counts()
    if (mod.fillEmpty) expect(await seedRemote(remote, mod)).toBe("PB dolu: yalnız boş alanlar dolduruldu")
    else await expect(seedRemote(remote, mod)).rejects.toThrow(/PB dolu/)
    const after = await firstSettings()
    expect(after[field!]).toBe(edited)
    expect(await counts()).toBe(n)
  }, 120_000)
})
