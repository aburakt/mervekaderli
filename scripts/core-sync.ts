import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

// ORTAK (core): template'ten gelir, sitede elle değiştirilmez.
//
// Ortak dosyaları (core.json'daki liste) template reposundan siteye kopyalar ve core.lock'a sürüm ile sha256'larını yazar.
// tests/core.test.ts core dosyalarının elle değiştirilmediğini bu kilitle ölçer.
//
//   bun run core:sync            template'in main dalından
//   bun run core:sync v1.2.0     etiketten ya da daldan
//   CORE_SOURCE=../astro-pb-template bun run core:sync   yerel kopyadan (template'i denerken)
//   bun run core:lock            yalnız template reposunda: kilidi yerel dosyalardan yeniden yazar

export const TEMPLATE = "https://github.com/aburakt/astro-pb-template"
const ROOT = join(import.meta.dir, "..")

type Manifest = { files: string[] }
type Lock = { source: string; ref: string; commit: string; files: Record<string, string> }

const sha256 = (path: string): string => new Bun.CryptoHasher("sha256").update(readFileSync(path)).digest("hex")
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T
const out = (line: string) => process.stdout.write(`${line}\n`)

/** Kilitteki dosyalardan eksik ya da elle değişmiş olanların listesi (boşsa her şey yerinde). */
export function checkLock(root: string): string[] {
  const lockPath = join(root, "core.lock")
  if (!existsSync(lockPath)) return ["core.lock yok: `bun run core:sync` çalıştırın"]
  const lock = readJson<Lock>(lockPath)
  return Object.entries(lock.files).flatMap(([file, hash]) => {
    const p = join(root, file)
    if (!existsSync(p)) return [`${file}: eksik`]
    return sha256(p) === hash ? [] : [`${file}: elle değişmiş`]
  })
}

function git(args: string[], cwd?: string): string {
  const r = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" })
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr.toString().trim()}`)
  return r.stdout.toString().trim()
}

function writeLock(root: string, manifest: Manifest, source: string, ref: string, commit: string) {
  const files = Object.fromEntries(manifest.files.map((f) => [f, sha256(join(root, f))]))
  const lock: Lock = { source, ref, commit, files }
  writeFileSync(join(root, "core.lock"), `${JSON.stringify(lock, null, 2)}\n`)
}

function sync(ref: string) {
  const local = process.env.CORE_SOURCE
  let src = local ? join(process.cwd(), local) : ""
  let tmp = ""
  if (!local) {
    tmp = mkdtempSync(join(tmpdir(), "core-sync-"))
    src = join(tmp, "template")
    git(["clone", "--quiet", "--depth", "1", "--branch", ref, TEMPLATE, src])
  }
  try {
    const commit = existsSync(join(src, ".git")) ? git(["rev-parse", "HEAD"], src) : "local"
    const manifest = readJson<Manifest>(join(src, "core.json"))
    const old = existsSync(join(ROOT, "core.lock")) ? readJson<Lock>(join(ROOT, "core.lock")) : undefined
    const changed: string[] = []
    for (const f of manifest.files) {
      const from = join(src, f)
      if (!existsSync(from)) throw new Error(`template'te ${f} yok (core.json ile dosyalar uyuşmuyor)`)
      const to = join(ROOT, f)
      if (!existsSync(to) || sha256(to) !== sha256(from)) changed.push(f)
      mkdirSync(dirname(to), { recursive: true })
      cpSync(from, to)
    }
    // core'dan çıkarılan dosyalar sitede de kalkar
    const removed = Object.keys(old?.files ?? {}).filter((f) => !manifest.files.includes(f) && existsSync(join(ROOT, f)))
    for (const f of removed) rmSync(join(ROOT, f))
    writeLock(ROOT, manifest, local ? `local:${local}` : TEMPLATE, local ? "local" : ref, commit)
    out(`core ${local ? "yerel kopyadan" : `${ref} (${commit.slice(0, 7)})`} alındı: ${changed.length} dosya değişti, ${removed.length} dosya kaldırıldı`)
    for (const f of changed) out(`  ~ ${f}`)
    for (const f of removed) out(`  - ${f}`)
    if (changed.length || removed.length) out("Sonra: bun install && bunx oxlint && bun run check && bun test && bun run verify")
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true })
  }
}

if (import.meta.main) {
  const arg = process.argv[2] ?? "main"
  if (arg === "--lock") {
    writeLock(ROOT, readJson<Manifest>(join(ROOT, "core.json")), TEMPLATE, "template", "template")
    out("core.lock yerel dosyalardan yeniden yazıldı")
  } else {
    sync(arg)
  }
}
