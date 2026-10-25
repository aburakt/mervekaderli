import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

// scripts/new-site.ts: repo geçici kopyada yeni siteye çevrilir; çıktılar ve verify'ın dayandığı fixture tutarlılığı ölçülür.
// Site kurulduktan sonra (site.js ID artık "ornek" değil) bu test atlanır: betik template'ten yeni site açarken çalışır.
const ROOT = join(import.meta.dir, "..")
const isTemplate = (require(join(ROOT, "pb", "pb_hooks", "site.js")) as { ID: string }).ID === "ornek"
const SKIP = new Set(["node_modules", ".git", "dist", ".astro", ".cache", "pb_data"])

let dir = ""
const run = (...args: string[]) => {
  const r = Bun.spawnSync(["bun", "scripts/new-site.ts", ...args], { cwd: dir, stdout: "pipe", stderr: "pipe" })
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() }
}
const read = (p: string) => readFileSync(join(dir, p), "utf8")
const ARGS = ["--id", "deneme-site", "--domain", "www.deneme.com.tr", "--name", "Deneme Şirketi A.Ş.", "--port", "8123", "--repo", "aburakt/deneme"]

beforeAll(() => {
  if (!isTemplate) return
  dir = mkdtempSync(join(tmpdir(), "new-site-"))
  cpSync(ROOT, dir, { recursive: true, filter: (src) => !SKIP.has(src.split("/").pop()!) })
})
afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe.skipIf(!isTemplate)("new-site", () => {
  test("hatalı girdiyi reddeder, dosyalara dokunmaz", () => {
    expect(run("--id", "Kötü_ID", "--domain", "deneme.com.tr", "--name", "X Y").code).not.toBe(0)
    expect(run("--id", "deneme", "--domain", "https://deneme", "--name", "X Y").code).not.toBe(0)
    expect(run("--id", "deneme", "--domain", "deneme.com.tr", "--name", "A & B").code).not.toBe(0)
    expect(run("--id", "deneme", "--domain", "deneme.com.tr", "--name", "X Y", "--port", "8096").code).not.toBe(0)
    expect(read("pb/pb_hooks/site.js")).toContain('ID: "ornek"')
  })

  test("siteye özel değerleri yazar, deploy/server dosyalarını üretir", () => {
    const r = run(...ARGS)
    expect(r.err).toBe("")
    expect(r.code).toBe(0)
    expect(read("pb/pb_hooks/site.js")).toContain('ID: "deneme-site"')
    // marka: ad ve adres yazılır, renk template'inki kalır (site tasarlanınca elle)
    const brand = (require(join(dir, "pb/pb_hooks/site.js")) as { BRAND: { name: string; url: string; color: string; icon: string } }).BRAND
    expect(brand.name).toBe("Deneme Şirketi A.Ş.")
    expect(brand.url).toBe("https://www.deneme.com.tr")
    expect(brand.icon).toBe("https://www.deneme.com.tr/brand/icon.png")
    expect(brand.color).toMatch(/^#[0-9a-f]{6}$/)
    expect(read(".env.example")).toContain("PUBLIC_SITE_URL=https://www.deneme.com.tr\n")
    expect(read("site/astro.config.mjs")).toContain('"https://www.deneme.com.tr"')

    // yayına çıkmış init migration'ı değişmez; panel adı yeni migration'da
    expect(read("pb/pb_migrations/1791800000_init.js")).toContain('"Örnek Site Yönetimi"')
    const migs = readdirSync(join(dir, "pb/pb_migrations")).filter((f) => f.endsWith("_app_name.js"))
    expect(migs).toHaveLength(1)
    expect(read(`pb/pb_migrations/${migs[0]}`)).toContain('s.meta.appName = "Deneme Şirketi A.Ş. Yönetimi"')

    // verify: PB build'i content.json'dan tohumlanır, kontroller aynı adı arar
    const content = JSON.parse(read("site/src/data/content.json")) as { settings: { companyName: string; email: string; seoDescription: string } }
    expect(content.settings.companyName).toBe("Deneme Şirketi A.Ş.")
    expect(content.settings.email).toBe("info@deneme.com.tr")
    expect(content.settings.seoDescription).not.toContain("Örnek Kurum")
    const cfg = read("site.config.ts")
    expect(cfg).toContain('"Deneme Şirketi A.Ş."')
    expect(cfg).not.toContain("Örnek Kurum")

    const unit = read("deploy/server/pb-deneme-site.service")
    for (const s of ["--http=127.0.0.1:8123", "/opt/pb-deneme-site/pb_data", "MemoryMax=512M", "CPUQuota=50%", "EnvironmentFile=/opt/pb-deneme-site/.env"]) expect(unit).toContain(s)
    const caddy = read("deploy/server/Caddyfile.snippet")
    expect(caddy).toContain("cms.deneme.com.tr {")
    expect(caddy).toContain("reverse_proxy 127.0.0.1:8123")
    expect(caddy).toContain('X-Robots-Tag "noindex, nofollow"')
    expect(caddy).not.toContain("respond")
    expect(caddy).toContain("mevcut bloklarla karşılaştırın")
    const env = read("deploy/server/env.example")
    for (const k of ["CF_PAGES_DEPLOY_HOOK=", "DEPLOY_QUIET_MS=45000", "PB_ENCRYPTION_KEY=\n", "PB_AGENCY_EMAILS=info@aburakt.com", "GLITCHTIP_DSN=\n", "FORM_NOTIFY_TO=\n"]) expect(env).toContain(k)
    const readme = read("deploy/server/README.md")
    for (const s of ["gh repo edit aburakt/deneme --add-topic astro-pb", 'read -rs "TOKEN?Token: "', "ssh -N -L 18123:127.0.0.1:8123", "CONTENT_SOURCE=fixture", "https://cms.deneme.com.tr/api/health", "http://n8n:5678/webhook/glitchtip?repo=aburakt/deneme", "/projects/$ORG/deneme-site/alerts/", "(ZORUNLU)", "Repositories'e aburakt/deneme eklenir", "https://www.deneme.com.tr/brand/logo-mail.png"]) expect(readme).toContain(s)
    expect(r.out).toContain("Kalan elle adımlar")
  })

  test("ikinci çalıştırma --force olmadan reddeder; --force aynı migration'ı yeniden yazar", () => {
    const again = run(...ARGS)
    expect(again.code).not.toBe(0)
    expect(again.err).toContain("--force")
    const forced = run(...ARGS.slice(0, 5), "Başka Kurum", "--port", "8124", "--force")
    expect(forced.code).toBe(0)
    expect(readdirSync(join(dir, "pb/pb_migrations")).filter((f) => f.endsWith("_app_name.js"))).toHaveLength(1)
    expect(JSON.parse(read("site/src/data/content.json")).settings.companyName).toBe("Başka Kurum")
    expect(read("site.config.ts")).toContain('"Başka Kurum"')
    expect(read("pb/pb_hooks/site.js")).toContain('name: "Başka Kurum"')
    expect(read("deploy/server/pb-deneme-site.service")).toContain("127.0.0.1:8124")
    expect(existsSync(join(dir, "deploy/server/pb-ornek.service"))).toBe(false)
  })
})
