// ORTAK (core): template'ten gelir, sitede elle değiştirilmez (bun run core:sync).
import { chmodSync, existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(import.meta.dir, "..")

export const pbVersion = async () => (await Bun.file(join(ROOT, "PB_VERSION")).text()).trim()

function platform(): string {
  const os = process.platform === "darwin" ? "darwin" : process.platform === "linux" ? "linux" : null
  const arch = process.arch === "arm64" ? "arm64" : process.arch === "x64" ? "amd64" : null
  if (!os || !arch) throw new Error(`desteklenmeyen platform: ${process.platform}/${process.arch}`)
  return `${os}_${arch}`
}

/** Pinli PocketBase binary'sini indirir, checksums.txt ile sha256'sını doğrular, .cache altında tutar. */
export async function ensurePocketBase(): Promise<string> {
  const version = await pbVersion()
  const dir = join(ROOT, ".cache", `pocketbase-${version}`)
  const bin = join(dir, "pocketbase")
  if (existsSync(bin)) return bin

  mkdirSync(dir, { recursive: true })
  const base = `https://github.com/pocketbase/pocketbase/releases/download/v${version}`
  const name = `pocketbase_${version}_${platform()}.zip`

  const sums = await fetch(`${base}/checksums.txt`)
  if (!sums.ok) throw new Error(`checksums.txt indirilemedi: ${sums.status}`)
  const line = (await sums.text()).split("\n").find((l) => l.trim().endsWith(name))
  if (!line) throw new Error(`checksums.txt içinde ${name} yok`)
  const expected = line.trim().split(/\s+/)[0]

  const res = await fetch(`${base}/${name}`)
  if (!res.ok) throw new Error(`PocketBase indirilemedi: ${name} → ${res.status}`)
  const buf = new Uint8Array(await res.arrayBuffer())
  const actual = new Bun.CryptoHasher("sha256").update(buf).digest("hex")
  if (actual !== expected) throw new Error(`sha256 uyuşmuyor: beklenen ${expected}, gelen ${actual}`)

  const zip = join(dir, name)
  await Bun.write(zip, buf)
  const unzip = Bun.spawnSync(["unzip", "-qo", zip, "pocketbase", "-d", dir])
  if (unzip.exitCode !== 0) throw new Error(`unzip başarısız: ${unzip.stderr.toString()}`)
  chmodSync(bin, 0o755)
  return bin
}
