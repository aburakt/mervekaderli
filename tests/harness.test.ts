// ORTAK (core): template'ten gelir, sitede elle değiştirilmez (bun run core:sync).
import { afterAll, beforeAll, expect, test } from "bun:test"
import { startPb, type Pb } from "../scripts/pb-harness"

let pb: Pb
beforeAll(async () => {
  pb = await startPb()
}, 120_000)
afterAll(async () => {
  await pb?.stop()
})

test("PB açılır, sağlıklı ve superuser token'ı var", async () => {
  const res = await pb.api("/api/health")
  expect(res.status).toBe(200)
  expect(pb.token.length).toBeGreaterThan(20)
})

test("anonim istek superuser uçlarına giremez", async () => {
  const res = await pb.api("/api/collections")
  expect([401, 403]).toContain(res.status)
  const ok = await pb.admin("/api/collections")
  expect(ok.status).toBe(200)
})
