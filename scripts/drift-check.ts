// ORTAK (core): template'ten gelir, sitede elle değiştirilmez (bun run core:sync).
// Sunucudaki PB'nin hook dosyalarını ve uygulanmış migration'larını repoyla karşılaştırır (GET /api/<ID>/core-version).
// Kullanım: PB_URL=https://cms.ornek.com bun scripts/drift-check.ts  → fark yoksa 0, varsa Markdown rapor ve 1, ulaşılamazsa 2.
import { createHash } from "node:crypto"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

const out = (line: string) => process.stdout.write(`${line}\n`)
const ROOT = join(import.meta.dir, "..")
const HOOKS = join(ROOT, "pb", "pb_hooks")
const MIGRATIONS = join(ROOT, "pb", "pb_migrations")
const ID = (require(join(HOOKS, "site.js")) as { ID: string }).ID

export type Snapshot = { hooks: Record<string, string>; migrations: string[] }

/** pb/lib/version.js ile aynı kural: nokta ile başlayanlar ve types.d.ts sayılmaz. */
export function localHooks(dir = HOOKS, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {}
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith(".") || name === "types.d.ts") continue
    const path = join(dir, name)
    const rel = prefix ? `${prefix}/${name}` : name
    if (statSync(path).isDirectory()) Object.assign(result, localHooks(path, rel))
    else result[rel] = createHash("sha256").update(readFileSync(path)).digest("hex")
  }
  return result
}

export function localMigrations(dir = MIGRATIONS): string[] {
  return readdirSync(dir).filter((f) => f.endsWith(".js")).sort()
}

/** Farkları Markdown satırları olarak döndürür; boş dizi = sunucu repoyla aynı. */
export function compare(local: Snapshot, remote: Snapshot): string[] {
  const lines: string[] = []
  for (const [file, sha] of Object.entries(local.hooks)) {
    if (!(file in remote.hooks)) lines.push(`- \`pb_hooks/${file}\` sunucuda yok`)
    else if (remote.hooks[file] !== sha) lines.push(`- \`pb_hooks/${file}\` sunucuda farklı`)
  }
  for (const file of Object.keys(remote.hooks)) {
    if (!(file in local.hooks)) lines.push(`- \`pb_hooks/${file}\` yalnız sunucuda var`)
  }
  const applied = new Set(remote.migrations)
  for (const file of local.migrations) {
    if (!applied.has(file)) lines.push(`- migration \`${file}\` sunucuda uygulanmamış`)
  }
  return lines
}

if (import.meta.main) {
  const base = (process.env.PB_URL ?? "").replace(/\/$/, "")
  if (!base) {
    out("PB_URL tanımlı değil, kontrol atlandı")
    process.exit(0)
  }
  let remote: Snapshot
  try {
    const res = await fetch(`${base}/api/${ID}/core-version`, { signal: AbortSignal.timeout(20_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    remote = (await res.json()) as Snapshot
  } catch (err) {
    out(`Sunucuya ulaşılamadı (${base}/api/${ID}/core-version): ${String(err)}`)
    out("Caddy izin listesinde bu yol açık mı ve ops.pb.js sunucuya kopyalandı mı?")
    process.exit(2)
  }
  const diff = compare({ hooks: localHooks(), migrations: localMigrations() }, remote)
  if (!diff.length) {
    out("Sunucu repoyla aynı")
    process.exit(0)
  }
  out(`Sunucudaki PocketBase (${base}) repodaki \`pb/\` klasöründen farklı:\n\n${diff.join("\n")}\n`)
  out("Düzeltme: repodaki `pb/pb_hooks` ve yeni migration'lar sunucuya kopyalanır, PB yeniden başlatılır (deploy/server/README.md).")
  process.exit(1)
}
