# Sunucu ve yayın (178.105.148.70)

Diğer sitelerle aynı düzen. `<id>` = `pb/pb_hooks/site.js` ID. Port: boş olanı seçin (`ss -ltnp | grep 809`; 8095 expertup, 8096 jci, 8097 ebs, 8098 idealist, 8099 keyfince).

## 1. PocketBase (VPS)
1. `/opt/pb-<id>/` altına PB binary'si (`PB_VERSION`), repodan `pb/pb_migrations/` ve `pb/pb_hooks/` (lib/ ve panel/ dahil, site.js ile birlikte).
2. `/opt/pb-<id>/.env` (root, 600): `CF_PAGES_DEPLOY_HOOK=…`, `DEPLOY_QUIET_MS=45000`, `PB_ENCRYPTION_KEY=…`, `PB_AGENCY_EMAILS=<ajans e-postaları, virgülle>`, `GLITCHTIP_DSN=<müşterinin GlitchTip org'undaki proje DSN'i>`. Ziyaretçi formu varsa (site.js FORMS) `FORM_NOTIFY_TO=<bildirim adresi>` (panelde Site Ayarları > Form bildirim adresi doluysa o kullanılır) ve panelde SMTP ayarı.
3. systemd `pb-<id>.service`: `pocketbase serve --http=127.0.0.1:<port> --dir /opt/pb-<id>/pb_data --migrationsDir … --hooksDir …` (diğer unit'lerin kopyası, MemoryMax/CPUQuota dahil).
4. Superuser: `pocketbase superuser upsert <e-posta> <parola> --dir /opt/pb-<id>/pb_data`; parola `/root/.pb-secrets`. Ajans hesabının e-postası `PB_AGENCY_EMAILS`'te olmalı. Müşteriye ayrı superuser açılır (panelden ya da aynı komutla); listede olmadığı için kısıtlıdır: yalnız içerik kayıtlarını ve kendi şifresini düzenler, şema/ayar/yedek/hesap yönetimine giremez (`pb_hooks/lib/guard.js`).
5. Caddy: `cms.<alan-adı>` → `127.0.0.1:<port>`, `header X-Robots-Tag "noindex, nofollow"`, izin listesi yok: panel `https://cms.<alan-adı>/_/` adresinden açık (12 Eki 2026 kararı). Müşteri hesabı `guard.js` ile yalnız içerik düzenler; superuser girişleri MFA ile korunur, bunun için PB'de SMTP ayarlı olmalı (yoksa MFA açılmaz, hesap kilitlenir).
6. Yedek: `/etc/cron.d/pb-offsite` listesine `<id>` eklenir.
7. E-posta: panelde SMTP ve gönderen adı/adresi. Sistem e-postaları (parola sıfırlama, tek kullanımlık şifre, yeni konumdan giriş) ve form bildirimi `site.js` BRAND ile markalı gelir (`brand.pb.js`, her açılışta). Panelden "Parolamı unuttum" ile deneyin; logo `BRAND.logo` adresinden (sitenin `/brand/logo-mail.png`'i) yüklenir, site yayında olmalı.

8. Otomatik deploy: ajans makinesinden bir kez `bash deploy/server/deploy-setup.sh <id>=<sahip>/<repo>` (sunucuya `pb-deploy` ve `pbdeploy` kullanıcısını kurar, siteye kısıtlı anahtarı repo sırrı `DEPLOY_SSH_KEY` yapar). Sonra main'deki her `pb/pb_hooks`/`pb/pb_migrations` değişikliği `deploy` iş akışıyla yüklenir; elle: Actions > deploy > Run workflow. Yayındaki migration değişmişse reddeder, `/api/health` gelmezse geri alır, yedekler `<hooksDir>.bak-*` (son 5) ve yeni migration'da `pb_data/data.db.bak-*`.

## 2. İçerik
SSH tüneli (`ssh -L 1<port>:127.0.0.1:<port> root@178.105.148.70`) üzerinden:
`PB_URL=http://127.0.0.1:1<port> PB_ADMIN_EMAIL=… PB_ADMIN_PASSWORD=… bun scripts/seed-remote.ts`
Yalnız boş PB'ye çalışır (settings kaydı varsa durur).

## 3. Cloudflare Pages
- Proje: kök dizin `site`, build `bun run build`, çıktı `dist`.
- Production ortamı: `PB_URL=https://cms.<alan-adı>`, `PUBLIC_SITE_URL=https://www.<alan-adı>`. PB hazır olana kadar `CONTENT_SOURCE=fixture` (noindex).
- Preview ortamı: `CONTENT_SOURCE=fixture` (Settings'in üstündeki ortam seçicisinden Preview seçilerek eklenir); yoksa PR önizlemeleri kırılır.
- Deploy hook oluşturulup VPS `.env`'ine yazılır. PB her kayıt değişikliğinde (45 sn sessizlikten sonra) yeniden yayınlatır; elle: `POST /api/<id>/deploy` (superuser).

## 4. İzleme
- GlitchTip (glitchtip.aburakt.com): müşteri grubunun org'unda (ör. aburakt, expertup, rlog-media) site için proje açılır, e-posta alarmı eklenir, DSN `.env`'e `GLITCHTIP_DSN` olarak yazılır. Hook hataları (deploy hook, değişiklik kaydı) oraya gider (`pb_hooks/lib/report.js`).
- Aynı org'da site ve `https://cms.<alan-adı>/api/health` için 5 dakikalık uptime izlemesi.
- Otomatik düzeltme (ZORUNLU, site bunsuz yayına alınmaz): (1) projeye "Claude otomatik düzeltme" adlı webhook alarmı eklenir, adres `http://n8n:5678/webhook/glitchtip?repo=<sahip>/<repo>` (n8n GlitchTip sunucusunun iç ağında; `bun run new-site` komutu yazdırır); (2) claude.ai/code/routines > "GlitchTip Website hata düzeltici" > Edit > Repositories'e repo eklenir. Hata gelince n8n routine'i tetikler; routine issue'yu doğrular, repoyu alarmın adresinden okur, düzeltip PR açar, CI yeşilse merge eder (Pages yayınlar); sunucuya ve PB verisine dokunmaz. Repo routine'de yoksa "repo rutine eklenmeli" deyip durur.
- Sapma kontrolü: repo değişkeni `PB_URL=https://cms.<alan-adı>`; `drift` iş akışı haftalık sunucuyu repoyla karşılaştırır, fark varsa issue açar.
