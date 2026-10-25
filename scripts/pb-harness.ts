import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ensurePocketBase } from "./pb-binary"

// ORTAK (core): template'ten gelir, sitede elle değiştirilmez.
const ROOT = join(import.meta.dir, "..")
/** pb/pb_hooks/site.js içindeki kısa site adı (test dizini ve hesap öneki). */
export const SITE_ID: string = (require(join(ROOT, "pb", "pb_hooks", "site.js")) as { ID: string }).ID

export type Pb = {
  url: string
  dir: string
  token: string
  /** ajans (test) superuser e-postası */
  email: string
  api(path: string, init?: RequestInit): Promise<Response>
  admin(path: string, init?: RequestInit): Promise<Response>
  stop(): Promise<void>
}

function freePort(): number {
  const s = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } })
  const port = s.port
  s.stop(true)
  return port
}

function withJson(init: RequestInit = {}, token?: string): RequestInit {
  const headers = new Headers(init.headers)
  if (typeof init.body === "string" && !headers.has("content-type")) headers.set("content-type", "application/json")
  if (token) headers.set("authorization", token)
  return { ...init, headers }
}

export type StartOptions = {
  /** site.js yerine geçecek değerler (test için ör. SHOP açık): hook'lar geçici dizine kopyalanıp site.js yeniden yazılır. */
  site?: Record<string, unknown>
  /** repodaki migration'lara eklenecek dosyalar (ör. pb/shop/1792200000_shop.js) */
  migrations?: string[]
}

/** Geçici dizinde, repodaki migration ve hook'larla bir PocketBase başlatır. */
export async function startPb(env: Record<string, string> = {}, opts: StartOptions = {}): Promise<Pb> {
  const bin = await ensurePocketBase()
  const dir = mkdtempSync(join(tmpdir(), `${SITE_ID}-pb-`))
  const dataDir = join(dir, "pb_data")
  let hooksDir = join(ROOT, "pb", "pb_hooks")
  let migrationsDir = join(ROOT, "pb", "pb_migrations")
  if (opts.site) {
    hooksDir = join(dir, "pb_hooks")
    cpSync(join(ROOT, "pb", "pb_hooks"), hooksDir, { recursive: true })
    const site = require(join(ROOT, "pb", "pb_hooks", "site.js")) as Record<string, unknown>
    writeFileSync(join(hooksDir, "site.js"), `module.exports = ${JSON.stringify({ ...site, ...opts.site })}\n`)
  }
  if (opts.migrations?.length) {
    migrationsDir = join(dir, "pb_migrations")
    cpSync(join(ROOT, "pb", "pb_migrations"), migrationsDir, { recursive: true })
    for (const file of opts.migrations) cpSync(join(ROOT, file), join(migrationsDir, file.split("/").pop()!))
  }
  const common = [
    "--dir", dataDir,
    "--migrationsDir", migrationsDir,
    "--hooksDir", hooksDir,
  ]
  const email = `verify@${SITE_ID}.test`
  const password = `Verify-${crypto.randomUUID()}`

  const up = Bun.spawnSync([bin, "superuser", "upsert", email, password, ...common])
  if (up.exitCode !== 0) throw new Error(`superuser upsert başarısız: ${up.stderr.toString()}`)

  const port = freePort()
  const url = `http://127.0.0.1:${port}`
  const proc = Bun.spawn([bin, "serve", `--http=127.0.0.1:${port}`, "--automigrate=false", ...common], {
    // Test hesabı ajans hesabıdır (lib/guard.js); kısıtlı müşteri hesabı testlerde ayrıca açılır.
    env: { ...process.env, PB_AGENCY_EMAILS: email, ...env },
    // PB_DEBUG=1: PB çıktısını göster (hook/migration hatası ayıklamak için)
    stdout: process.env.PB_DEBUG ? "inherit" : "pipe",
    stderr: process.env.PB_DEBUG ? "inherit" : "pipe",
  })

  let ready = false
  for (let i = 0; i < 100 && !ready; i++) {
    try {
      ready = (await fetch(`${url}/api/health`)).ok
    } catch {}
    if (!ready) await Bun.sleep(200)
  }
  if (!ready) {
    proc.kill()
    throw new Error(`PocketBase açılmadı (${url})`)
  }

  const auth = await fetch(`${url}/api/collections/_superusers/auth-with-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identity: email, password }),
  })
  if (!auth.ok) throw new Error(`superuser girişi başarısız: ${auth.status}`)
  const token = ((await auth.json()) as { token: string }).token

  return {
    url,
    dir,
    token,
    email,
    api: (path, init) => fetch(`${url}${path}`, withJson(init)),
    admin: (path, init) => fetch(`${url}${path}`, withJson(init, token)),
    async stop() {
      proc.kill()
      await proc.exited
      rmSync(dir, { recursive: true, force: true })
    },
  }
}
