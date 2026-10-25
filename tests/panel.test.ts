// ORTAK (core): template'ten gelir, sitede elle değiştirilmez (bun run core:sync).
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { join } from "node:path"
import { startPb, type Pb } from "../scripts/pb-harness"

// Türkçe panel: /_/extensions.js hook'tan gelir; her koleksiyonun ve alanın Türkçe etiketi vardır.
const HOOKS = join(import.meta.dir, "..", "pb", "pb_hooks")

let pb: Pb
beforeAll(async () => {
  pb = await startPb()
}, 300_000)
afterAll(async () => {
  await pb?.stop()
})

type Labels = { collections: Record<string, string>; fields: Record<string, string> }
type Collection = { name: string; system: boolean; fields: { name: string; hidden: boolean }[] }

describe("Türkçe panel", () => {
  test("panel çeviri dosyasını site etiketleriyle alır", async () => {
    const res = await pb.api("/_/extensions.js")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("javascript")
    const js = await res.text()
    expect(js.startsWith("window.PB_TR_LABELS = {")).toBe(true)
    expect(js).toContain("MutationObserver")
  })

  test("her koleksiyonun ve görünen her alanın Türkçe etiketi var", async () => {
    const site = (await Bun.file(join(HOOKS, "panel", "labels.json")).json()) as Labels
    const core = (await Bun.file(join(HOOKS, "panel", "core-labels.json")).json()) as Labels
    const labels: Labels = { collections: { ...core.collections, ...site.collections }, fields: { ...core.fields, ...site.fields } }
    const tr = await Bun.file(join(HOOKS, "panel", "tr.js")).text()
    const block = tr.slice(tr.indexOf("const COMMON_FIELDS = {"), tr.indexOf("\n}", tr.indexOf("const COMMON_FIELDS = {")))
    const common = new Set([...block.matchAll(/\b(\w+): "/g)].map((m) => m[1]))
    const { items } = (await (await pb.admin("/api/collections?perPage=200")).json()) as { items: Collection[] }
    const missing: string[] = []
    for (const c of items.filter((x) => !x.system)) {
      if (!labels.collections[c.name]) missing.push(c.name)
      for (const f of c.fields.filter((x) => !x.hidden)) {
        if (!labels.fields[`${c.name}.${f.name}`] && !labels.fields[f.name] && !common.has(f.name)) missing.push(`${c.name}.${f.name}`)
      }
    }
    expect(missing).toEqual([])
  })
})
