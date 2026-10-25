import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

// "Use this template" ile açılan repoyu yeni müşteri sitesine çevirir (bir kez çalışır):
//   bun run new-site -- --id <id> --domain <alan-adı> --name "<Kurum Adı>" [--port N] [--repo aburakt/<repo>] [--force]
// Siteye özel değerleri yazar (site.js ID, panel adı için yeni migration, .env.example, fixture kurum adı ve verify
// kontrolleri), deploy/server/ altına bu sitenin unit/Caddy/.env dosyalarını ve doldurulmuş kurulum listesini üretir,
// kalan elle adımları komutlarıyla yazdırır. Sunucuya, GitHub'a ya da Cloudflare'e kendisi hiçbir şey göndermez.

const ROOT = join(import.meta.dir, "..")
const VPS = "178.105.148.70"
const AGENCY_EMAIL = "info@aburakt.com"
const TEMPLATE_ID = "ornek"
// Sunucuda kullanılan portlar (8095 expertup, 8096 jci, 8097 ebs, 8098 idealist, 8099 keyfince); yenisi 8100'den başlar.
const TAKEN_PORTS = [8095, 8096, 8097, 8098, 8099]
const FIRST_FREE_PORT = 8100
const MIGRATION_MARK = "new-site: panel adı"
// GlitchTip -> n8n (GlitchTip sunucusunun iç ağı) -> "GlitchTip Website hata düzeltici" routine'i
const AUTOFIX_URL = "http://n8n:5678/webhook/glitchtip"
const AUTOFIX_ALERT = "Claude otomatik düzeltme"

const out = (s = "") => process.stdout.write(s + "\n")
const fail = (msg: string): never => {
  process.stderr.write(`new-site: ${msg}\n`)
  process.exit(1)
}
const path = (...p: string[]) => join(ROOT, ...p)
const read = (...p: string[]) => readFileSync(path(...p), "utf8")
const write = (rel: string, text: string) => {
  writeFileSync(path(rel), text)
  out(`  yazıldı: ${rel}`)
}

// ---------- argümanlar ----------
type Args = { id: string; domain: string; name: string; port?: number; repo?: string; force: boolean }
function parseArgs(argv: string[]): Args {
  const v: Record<string, string> = {}
  let force = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === "--") continue
    if (a === "--force") { force = true; continue }
    const m = /^--(id|domain|name|port|repo)(?:=(.*))?$/.exec(a)
    if (!m) fail(`bilinmeyen argüman: ${a}`)
    const val = m![2] ?? argv[++i]
    if (val === undefined) fail(`${a} için değer yok`)
    v[m![1]!] = val!
  }
  for (const k of ["id", "domain", "name"]) if (!v[k]) fail(`--${k} gerekli\nkullanım: bun run new-site -- --id <id> --domain <alan-adı> --name "<Kurum Adı>" [--port N] [--repo aburakt/<repo>] [--force]`)
  const id = v.id!
  if (!/^[a-z][a-z0-9-]{1,29}$/.test(id) || id.endsWith("-")) fail(`--id yalnız küçük harf, rakam ve tire (harfle başlar, 2-30 karakter): ${id}`)
  if (id === TEMPLATE_ID) fail(`--id "${TEMPLATE_ID}" template'in kendisidir; sitenin kısa adını verin`)
  const domain = v.domain!.toLowerCase().replace(/^www\./, "")
  if (!/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) fail(`--domain alan adı olmalı (şema ve yol olmadan, ör. ornek.com.tr): ${v.domain}`)
  const name = v.name!.trim().replace(/\s+/g, " ")
  if (name.length < 2 || name.length > 120) fail("--name 2-120 karakter olmalı")
  // HTML'de kaçışlanan karakterler verify kontrollerini ("has" düz metin arar) bozar.
  if (/[&<>"'`\\]/.test(name)) fail(`--name içinde & < > " ' \` \\ kullanılmaz: ${name}`)
  let port: number | undefined
  if (v.port !== undefined) {
    port = Number(v.port)
    if (!Number.isInteger(port) || port < 1024 || port > 55535) fail(`--port 1024-55535 arası tam sayı olmalı: ${v.port}`)
    if (TAKEN_PORTS.includes(port)) fail(`--port ${port} başka sitede kullanılıyor (${TAKEN_PORTS.join(", ")})`)
  }
  const repo = v.repo
  if (repo !== undefined && !/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repo)) fail(`--repo sahip/ad biçiminde olmalı: ${repo}`)
  return { id, domain, name, port, repo, force }
}

/** Kardeş repolardaki üretilmiş unit dosyalarından da kullanılan portları toplar; ilk boşu önerir. */
function suggestPort(): number {
  const used = new Set(TAKEN_PORTS)
  const parent = dirname(ROOT)
  try {
    for (const d of readdirSync(parent)) {
      const dir = join(parent, d, "deploy", "server")
      if (d === ROOT.split("/").pop() || !existsSync(dir)) continue
      for (const f of readdirSync(dir)) {
        if (!/^pb-.*\.service$/.test(f)) continue
        const m = /127\.0\.0\.1:(\d+)/.exec(readFileSync(join(dir, f), "utf8"))
        if (m) used.add(Number(m[1]))
      }
    }
  } catch { /* üst dizin okunamıyorsa yalnız bilinen liste */ }
  let p = FIRST_FREE_PORT
  while (used.has(p)) p++
  return p
}

function repoFromGit(): string | undefined {
  const r = Bun.spawnSync(["git", "remote", "get-url", "origin"], { cwd: ROOT, stdout: "pipe", stderr: "ignore" })
  const m = /github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?$/.exec(r.stdout.toString().trim())
  return m && !m[1]!.endsWith("/astro-pb-template") ? m[1] : undefined
}

// ---------- mevcut değerler ----------
const replaceOnce = (text: string, re: RegExp, to: string, what: string): string => {
  if (!re.test(text)) fail(`${what} bulunamadı (${re}); dosya template'ten çok farklıysa elle düzenleyin`)
  return text.replace(re, to)
}
const q = (s: string) => JSON.stringify(s)

const args = parseArgs(process.argv.slice(2))
const siteJs = read("pb", "pb_hooks", "site.js")
const oldId = /\bID:\s*"([^"]*)"/.exec(siteJs)?.[1] ?? fail("pb/pb_hooks/site.js içinde ID yok")
if (oldId !== TEMPLATE_ID && !args.force) {
  fail(`site zaten kurulmuş (site.js ID = "${oldId}"). Değerleri yeniden yazmak ve deploy/server dosyalarını yeniden üretmek için --force ekleyin.`)
}

const { id, domain, name } = args
const port = args.port ?? suggestPort()
const repo = args.repo ?? repoFromGit() ?? `aburakt/${id}`
const siteUrl = `https://www.${domain}`
const cmsHost = `cms.${domain}`
const appName = `${name} Yönetimi`
const dir = `/opt/pb-${id}`
const unit = `pb-${id}`
const tunnel = port + 10000
const pbVersion = read("PB_VERSION").trim()

type SiteModule = { FORMS?: string[] }
const site = require(path("pb", "pb_hooks", "site.js")) as SiteModule
const forms = [...(site.FORMS ?? [])]

out(`new-site: ${name} (${id}) · ${siteUrl} · ${cmsHost} → 127.0.0.1:${port} · ${repo}`)

// ---------- 1. siteye özel değerler ----------
// Marka (e-posta ve panel): ad ve adres buradan; renk ve logo site tasarlanınca elle (site.js BRAND açıklaması).
let siteJsOut = replaceOnce(siteJs, /(\bID:\s*)"[^"]*"/, `$1${q(id)}`, "site.js ID")
siteJsOut = replaceOnce(siteJsOut, /(\bBRAND:\s*\{[^}]*?\bname:\s*)"[^"]*"/, `$1${q(name)}`, "site.js BRAND.name")
siteJsOut = replaceOnce(siteJsOut, /(\bBRAND:\s*\{[^}]*?\burl:\s*)"[^"]*"/, `$1${q(siteUrl)}`, "site.js BRAND.url")
// sekme simgesi template'in favicon'undan; site kendi favicon'unu koyunca adres aynı kalır (yoksa boşaltılır, test ölçer)
siteJsOut = replaceOnce(siteJsOut, /(\bBRAND:\s*\{[^}]*?\bicon:\s*)"[^"]*"/, `$1${q(`${siteUrl}/brand/icon.png`)}`, "site.js BRAND.icon")
write("pb/pb_hooks/site.js", siteJsOut)

const envEx = read(".env.example")
const oldSiteUrl = /^PUBLIC_SITE_URL=(.*)$/m.exec(envEx)?.[1] ?? ""
write(".env.example", replaceOnce(envEx, /^PUBLIC_SITE_URL=.*$/m, `PUBLIC_SITE_URL=${siteUrl}`, ".env.example PUBLIC_SITE_URL"))

const astroCfg = read("site", "astro.config.mjs")
write("site/astro.config.mjs", replaceOnce(astroCfg, /(process\.env\.PUBLIC_SITE_URL \?\? )"[^"]*"/, `$1${q(siteUrl)}`, "astro.config.mjs varsayılan site adresi"))

// Fixture (content.json) kurum adı ve verify kontrolleri birlikte değişir; PB build'i aynı dosyadan tohumlandığı için parite korunur.
const contentRel = "site/src/data/content.json"
const fixture = JSON.parse(read(contentRel)) as { settings?: { companyName?: string; email?: string; seoDescription?: string } }
const oldName = fixture.settings?.companyName
if (oldName) {
  const s = fixture.settings!
  s.companyName = name
  if (s.seoDescription) s.seoDescription = s.seoDescription.split(oldName).join(name)
  const oldDomain = oldSiteUrl.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "")
  if (s.email && (s.email === "info@ornek.com.tr" || s.email === `info@${oldDomain}`)) s.email = `info@${domain}`
  write(contentRel, JSON.stringify(fixture, null, 2) + "\n")

  const cfg = read("site.config.ts")
  if (oldName !== name) {
    const lit = (s: string) => q(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const re = new RegExp(lit(oldName), "g")
    if (!re.test(cfg)) out(`  uyarı: site.config.ts kontrollerinde ${q(oldName)} yok; kurum adı kontrolünü elle ekleyin`)
    write("site.config.ts", cfg.replace(re, q(name)))
  }
} else {
  out(`  uyarı: ${contentRel} içinde settings.companyName yok; fixture ve site.config.ts kontrolleri elle güncellenir`)
}

// Panel adı: yayına çıkmış migration düzenlenmez; ayrı küçük migration yazılır (--force'ta aynı dosya yeniden yazılır).
const migDir = path("pb", "pb_migrations")
const migs = readdirSync(migDir).filter((f) => /^\d+_.*\.js$/.test(f)).sort()
const ownMig = migs.find((f) => readFileSync(join(migDir, f), "utf8").includes(MIGRATION_MARK))
const prevAppName = migs
  .filter((f) => f !== ownMig)
  .map((f) => /meta\.appName\s*=\s*("[^"]*")/.exec(readFileSync(join(migDir, f), "utf8"))?.[1])
  .filter(Boolean)
  .pop() ?? q("PocketBase")
const lastTs = Math.max(...migs.filter((f) => f !== ownMig).map((f) => Number(f.split("_")[0])))
const migName = ownMig ?? `${lastTs + 1}_app_name.js`
if (ownMig) out(`  not: ${migName} yeniden yazılıyor; sunucuda uygulandıysa yeni ad için yeni migration ekleyin`)
write(`pb/pb_migrations/${migName}`, `/// <reference path="../pb_data/types.d.ts" />

// ${MIGRATION_MARK}. scripts/new-site.ts üretti. Yayına çıktıktan sonra düzenlenmez; ad değişirse yeni migration eklenir.
migrate((app) => {
  const s = app.settings()
  s.meta.appName = ${q(appName)}
  app.save(s)
}, (app) => {
  const s = app.settings()
  s.meta.appName = ${prevAppName}
  app.save(s)
})
`)

// ---------- 2. deploy/server ----------
if (oldId !== id && existsSync(path("deploy", "server", `pb-${oldId}.service`))) {
  rmSync(path("deploy", "server", `pb-${oldId}.service`))
  out(`  silindi: deploy/server/pb-${oldId}.service`)
}

write(`deploy/server/${unit}.service`, `# /etc/systemd/system/${unit}.service — ${name} PocketBase. scripts/new-site.ts üretti.
# Sunucudaki diğer unit'lerle karşılaştırın: systemctl cat pb-keyfince
[Unit]
Description=PocketBase ${id} (${cmsHost})
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${dir}
EnvironmentFile=${dir}/.env
ExecStart=${dir}/pocketbase serve --http=127.0.0.1:${port} --dir ${dir}/pb_data --migrationsDir ${dir}/pb_migrations --hooksDir ${dir}/pb_hooks --encryptionEnv=PB_ENCRYPTION_KEY
Restart=always
RestartSec=5
LimitNOFILE=4096
MemoryMax=512M
CPUQuota=50%
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
`)

write("deploy/server/Caddyfile.snippet", `# ${name}: /etc/caddy/pocketbase.caddy içine eklenir. scripts/new-site.ts üretti.
# !!! Sunucudaki mevcut bloklarla karşılaştırın (grep -n -A6 '^cms\\.' /etc/caddy/pocketbase.caddy): "import pocketbase" snippet adı aynı olmalı.
# Panel doğrudan açık (https://${cmsHost}/_/): müşteri hesabı guard.js ile yalnız içerik düzenler; superuser girişleri MFA ile korunur (SMTP gerekir).
${cmsHost} {
\timport pocketbase
\theader X-Robots-Tag "noindex, nofollow"
\treverse_proxy 127.0.0.1:${port}
}
`)

write("deploy/server/env.example", `# ${dir}/.env (root:root, 600) — systemd EnvironmentFile. scripts/new-site.ts üretti.
# Buraya gerçek değer yazılmaz; gerçek değerler Infisical'da ve yalnız sunucudaki dosyada. Yorumlar ayrı satırda kalmalı
# (systemd satır sonu yorumunu değerin parçası sayar).

# Cloudflare Pages deploy hook adresi (Pages > Settings > Builds > Deploy hooks). Boşsa yeniden yayın yapılmaz.
CF_PAGES_DEPLOY_HOOK=

# Son kayıt değişikliğinden sonra yayına kadar beklenen sessizlik (ms).
DEPLOY_QUIET_MS=45000

# PB ayar şifreleme anahtarı (tam 32 karakter): openssl rand -hex 16. Kaybolursa yedekler tam açılmaz; Infisical'a yazılır.
PB_ENCRYPTION_KEY=

# Tam yetkili (ajans) superuser e-postaları, virgülle. Listede olmayan superuser (müşteri) yalnız içerik düzenler.
PB_AGENCY_EMAILS=${AGENCY_EMAIL}

# GlitchTip DSN (bu sitenin projesi; org müşteriye göre değişir). pb_hooks/lib/report.js okur; boşsa hatalar yalnız PB logunda kalır.
GLITCHTIP_DSN=

# Form bildirimlerinin gideceği adres(ler), virgülle. Yalnız FORMS koleksiyonu olan sitede kullanılır${forms.length ? "" : " (bu sitede şimdilik yok)"}.
FORM_NOTIFY_TO=
`)

// ---------- 3. kalan elle adımlar (README ve ekran aynı metin) ----------
type Step = { title: string; text?: string[]; cmds?: string[] }
const ssh = `ssh root@${VPS}`
const steps: Step[] = [
  {
    title: "GitHub: konu etiketi ve CORE_SYNC_TOKEN",
    text: ["Token: fine-grained PAT (template ve bu repo için Contents, Pull requests, Workflows: read/write); Infisical'dan alınır. Satır zsh içindir. PB_URL değişkeni haftalık sapma kontrolü (drift) içindir."],
    cmds: [
      `gh repo edit ${repo} --add-topic astro-pb`,
      `read -rs "TOKEN?Token: " && printf %s "$TOKEN" | gh secret set CORE_SYNC_TOKEN -R ${repo}; unset TOKEN`,
      `gh variable set PB_URL -R ${repo} -b https://${cmsHost}`,
    ],
  },
  {
    title: `DNS: ${cmsHost} A kaydı → ${VPS}`,
    text: ["Proxy durumu diğer cms.* kayıtlarıyla aynı olsun. Caddy sertifikayı ilk istekte alır; kayıt yayılmadan Caddy adımına geçmeyin.", `Sonuç ${VPS} olmalı.`],
    cmds: [`dig +short ${cmsHost}`],
  },
  {
    title: `PocketBase: ${dir} ve ${unit}.service (port ${port})`,
    text: [`Port boş mu (çıktı boş olmalı), mimari amd64 mi kontrol edin; sonra binary (PB_VERSION ${pbVersion}, sha256 doğrulamalı), migration ve hook'lar, .env ve unit.`],
    cmds: [
      `${ssh} 'ss -ltnp | grep ":${port} "; uname -m'`,
      `${ssh} 'set -e; mkdir -p ${dir} && cd ${dir} && B=https://github.com/pocketbase/pocketbase/releases/download/v${pbVersion} Z=pocketbase_${pbVersion}_linux_amd64.zip && curl -fsSLO "$B/$Z" && curl -fsSL "$B/checksums.txt" | grep " $Z$" | sha256sum -c - && unzip -o "$Z" pocketbase && rm "$Z" && ./pocketbase --version'`,
      `rsync -a --delete pb/pb_migrations pb/pb_hooks root@${VPS}:${dir}/`,
      `scp deploy/server/env.example root@${VPS}:${dir}/.env && ${ssh} 'chmod 600 ${dir}/.env && sed -i "s|^PB_ENCRYPTION_KEY=.*|PB_ENCRYPTION_KEY=$(openssl rand -hex 16)|" ${dir}/.env && grep PB_ENCRYPTION_KEY ${dir}/.env'`,
      `scp deploy/server/${unit}.service root@${VPS}:/etc/systemd/system/ && ${ssh} 'systemctl daemon-reload && systemctl enable --now ${unit} && sleep 2 && curl -fsS http://127.0.0.1:${port}/api/health && journalctl -u ${unit} -n 20 --no-pager'`,
    ],
  },
  {
    title: "Superuser (ajans, sonra müşteri)",
    text: [
      `Parola /root/.pb-secrets ve Infisical'a. Ajans e-postası (${AGENCY_EMAIL}) PB_AGENCY_EMAILS'te olduğu için tam yetkili.`,
      "Müşteri için aynı komut müşteri e-postasıyla: listede olmadığı için kısıtlıdır (yalnız içerik ve kendi şifresi).",
    ],
    cmds: [
      `${ssh} -t 'cd ${dir} && set -a && . ./.env && set +a && read -rs -p "Parola: " P && echo && ./pocketbase superuser upsert ${AGENCY_EMAIL} "$P" --dir ${dir}/pb_data --encryptionEnv=PB_ENCRYPTION_KEY; unset P'`,
    ],
  },
  {
    title: `Caddy: ${cmsHost} bloğu`,
    text: ["deploy/server/Caddyfile.snippet'i önce sunucudaki mevcut bloklarla karşılaştırın (snippet adı). Ekleme yedek alır; validate geçmezse geri koyar. Sonda /api/health ve /_/ 200 dönmeli."],
    cmds: [
      `${ssh} "grep -n -A8 '^cms\\.' /etc/caddy/pocketbase.caddy"`,
      `scp deploy/server/Caddyfile.snippet root@${VPS}:/tmp/${unit}.caddy && ${ssh} 'F=/etc/caddy/pocketbase.caddy; B=$F.bak.$(date +%F-%H%M%S); cp $F $B && { printf "\\n" >> $F; cat /tmp/${unit}.caddy >> $F; } && { caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy || { cp $B $F; echo GERI ALINDI; }; }'`,
      `curl -s -o /dev/null -w '%{http_code}\\n' https://${cmsHost}/api/health`,
      `curl -s -o /dev/null -w '%{http_code}\\n' https://${cmsHost}/_/`,
    ],
  },
  {
    title: "Yedek: offsite listesine ekle",
    text: [`/etc/cron.d/pb-offsite'in çağırdığı pb-offsite.sh içindeki "for n in …" listesine ${id} eklenir (Storage Box: pb-sites/${id}/).`],
    cmds: [
      `${ssh} 'S=$(grep -o "/[^ ]*pb-offsite.sh" /etc/cron.d/pb-offsite | head -1) && grep -q " ${id}[ ;]" "$S" || sed -i "s/^for n in \\(.*\\); do/for n in \\1 ${id}; do/" "$S"; grep "for n in" "$S"'`,
    ],
  },
  {
    title: "İçerik: SSH tüneliyle tohumlama",
    text: [`Tünel komutu ayrı terminalde açık kalsın. Yalnız boş PB'ye çalışır (settings kaydı varsa durur). Tünel açıkken panel: http://127.0.0.1:${tunnel}/_/`],
    cmds: [
      `ssh -N -L ${tunnel}:127.0.0.1:${port} root@${VPS}`,
      `read -rs "PBPASS?Parola: " && PB_URL=http://127.0.0.1:${tunnel} PB_ADMIN_EMAIL=${AGENCY_EMAIL} PB_ADMIN_PASSWORD="$PBPASS" bun scripts/seed-remote.ts; unset PBPASS`,
    ],
  },
  {
    title: "Cloudflare Pages",
    text: [
      `Proje: repo ${repo}, kök dizin \`site\`, build \`bun run build\`, çıktı \`dist\`.`,
      `Production ortamı: \`PB_URL=https://${cmsHost}\`, \`PUBLIC_SITE_URL=${siteUrl}\`.`,
      "Preview ortamı (Settings'teki ortam seçicisinden Preview): `CONTENT_SOURCE=fixture`; yoksa PR önizlemeleri kırılır.",
      `Özel alan adı: www.${domain} (çıplak alan adı www'ya yönlenir).`,
      "Settings > Builds > Deploy hooks: hook oluşturun ve sunucu .env'ine yazın (aşağıdaki satır zsh içindir).",
    ],
    cmds: [
      `read -rs "HOOK?Deploy hook URL: " && ${ssh} "sed -i 's|^CF_PAGES_DEPLOY_HOOK=.*|CF_PAGES_DEPLOY_HOOK=$HOOK|' ${dir}/.env && systemctl restart ${unit}"; unset HOOK`,
    ],
  },
  {
    title: "GlitchTip: proje, DSN, uptime, otomatik düzeltme (ZORUNLU)",
    text: [
      `Müşterinin org'unda \`${id}\` projesi açın; DSN'i Infisical'a, sunucu .env'ine ve tarayıcı hataları için \`site/src/lib/monitoring.ts\` GLITCHTIP_DSN'e yazın.`,
      `Uptime monitörleri: ${siteUrl}/ ve https://${cmsHost}/api/health`,
      `ZORUNLU, site bu iki adım olmadan yayına alınmaz. 1) Otomatik düzeltme alarmı (ikinci komut): GlitchTip hatayı n8n üzerinden "GlitchTip Website hata düzeltici" routine'ine iletir; routine repoyu bu alarmın adresinden okur. 2) claude.ai/code/routines > "GlitchTip Website hata düzeltici" > Edit > Repositories'e ${repo} eklenir; eklenmezse routine "repo rutine eklenmeli" deyip durur.`,
    ],
    cmds: [
      `read -rs "DSN?GlitchTip DSN: " && ${ssh} "sed -i 's|^GLITCHTIP_DSN=.*|GLITCHTIP_DSN=$DSN|' ${dir}/.env && systemctl restart ${unit}"; unset DSN`,
      `read "ORG?GlitchTip org (aburakt, expertup, rlog-media): " && read -rs "GT?GlitchTip API token: " && curl -sf -X POST -H "Authorization: Bearer $GT" -H "Content-Type: application/json" "https://glitchtip.aburakt.com/api/0/projects/$ORG/${id}/alerts/" -d '{"name":"${AUTOFIX_ALERT}","timespanMinutes":1,"quantity":1,"uptime":false,"alertRecipients":[{"recipientType":"webhook","url":"${AUTOFIX_URL}?repo=${repo}"}]}' >/dev/null && echo "alarm eklendi"; unset GT`,
    ],
  },
  {
    title: "Son kontrol",
    text: [
      "Infisical'da: PB_ENCRYPTION_KEY, superuser parolaları, deploy hook, GlitchTip DSN.",
      `Marka: pb/pb_hooks/site.js BRAND renkleri (color, ink, paper) sitenin CSS'iyle aynı; site/public/logo.svg varsa BRAND.logo = ${siteUrl}/brand/logo-mail.png; favicon (site/public/favicon.svg ya da .png) varsa BRAND.icon = ${siteUrl}/brand/icon.png. Panelde "Parolamı unuttum" ile markalı e-postayı deneyin (SMTP gerekir).`,
      "Panelde bir kaydı kaydedin; ~45 sn sonra Pages'te yeni build başlamalı. Canlı siteyi verify kontrolleriyle ölçün:",
    ],
    cmds: [`BASE_URL=${siteUrl} bun run verify`],
  },
]

const renderSteps = (fence: boolean) =>
  steps.flatMap((s, i) => [
    `${i + 1}. ${s.title}`,
    ...(s.text ?? []).map((t) => `   ${t}`),
    ...(s.cmds?.length ? (fence ? ["   ```sh", ...s.cmds.map((c) => `   ${c}`), "   ```"] : s.cmds.map((c) => `     $ ${c}`)) : []),
    "",
  ])

write("deploy/server/README.md", [
  `# Sunucu ve yayın: ${name}`,
  "",
  `\`scripts/new-site.ts\` üretti; değerler değişirse \`bun run new-site -- --force …\` ile yeniden üretin. Diğer sitelerle aynı düzen.`,
  "",
  "| | |",
  "|---|---|",
  `| ID (site.js) | \`${id}\` |`,
  `| Site | ${siteUrl} |`,
  `| PB (Caddy) | https://${cmsHost} → \`127.0.0.1:${port}\` |`,
  `| VPS | \`${VPS}\`, \`${dir}\`, \`${unit}.service\` (MemoryMax=512M, CPUQuota=50%) |`,
  `| Panel | https://${cmsHost}/_/ (müşteri kısıtlı superuser, guard.js) |`,
  `| Repo | \`${repo}\` |`,
  `| Elle yayın | \`POST /api/${id}/deploy\` (superuser) |`,
  "",
  "Dosyalar: `" + unit + ".service` (systemd unit), `Caddyfile.snippet` (sunucudaki mevcut bloklarla karşılaştırın), `env.example` (`" + dir + "/.env` şablonu; sır yazılmaz).",
  "",
  "## Kurulum listesi",
  "",
  ...renderSteps(true),
  "## Güncelleme",
  `Hook ya da migration değişince: \`rsync -a pb/pb_migrations pb/pb_hooks root@${VPS}:${dir}/\` (hook'lar izlendiği için PB yeniden yüklenir; migration için \`systemctl restart ${unit}\`).`,
  "",
].join("\n"))

out("")
out("Kalan elle adımlar (deploy/server/README.md içinde de var):")
out("")
for (const l of renderSteps(false)) out(l)
out("Sonra: bunx oxlint && bun run check && bun test && bun run verify")
