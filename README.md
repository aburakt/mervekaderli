# astro-pb-template

Astro (statik) + PocketBase siteleri için başlangıç şablonu ve ortak çekirdek. İçerik müşterinin Türkçe panelinden düzenlenir; her kayıt değişikliğinden sonra PocketBase Cloudflare Pages'e yeniden yayın komutu gönderir.

## Yeni site
1. GitHub'da "Use this template" ile repo açın, klonlayın, `bun install`.
2. `bun run new-site -- --id <id> --domain <alan-adı> --name "<Kurum Adı>" [--port N] [--repo aburakt/<repo>]`: site.js `ID`, panel adı (yeni migration), `PUBLIC_SITE_URL`, fixture kurum adı ve verify kontrolleri; `deploy/server/` altına unit, Caddy bloğu, sunucu `.env` şablonu ve doldurulmuş kurulum listesi. Kalan elle adımları komutlarıyla yazdırır. İkinci kez yalnız `--force` ile çalışır.
3. `pb/pb_hooks/site.js`: `CONTENT`, `RULES`. `site.config.ts`: sayfa kontrolleri ve hook testi kaydı.
4. `pb/pb_migrations/1791800000_init.js` yerine sitenin şeması; `panel/labels.json` etiketleri; `scripts/seed.ts` ve `site/src/data/content.json` içeriği; `site/src/` sayfa ve tasarım.
5. `bunx oxlint && bun run check && bun test && bun run verify`
6. Sunucu ve yayın: [deploy/server/README.md](deploy/server/README.md). Müşteri rehberi: [docs/panel-rehberi.md](docs/panel-rehberi.md).

GEO ve WebMCP (yapay zekâ arama/asistanları için llms.txt, markdown eşleri, robots AI politikası, sayfa JSON-LD'si, tarayıcı ajan araçları): [docs/geo-webmcp.md](docs/geo-webmcp.md). Sitede `site/src/lib/geo.ts` ile açılır.

İkinci dil (isteğe bağlı): [docs/i18n.md](docs/i18n.md). Template tek dillidir; açma listesi şema, ayar, rota ve hreflang adımlarını sırayla verir.

Önizleme: `CONTENT_SOURCE=fixture bun run --filter '@site/web' dev`

## Mevcut siteyi güncellemek (core:sync)
Ortak dosyalar `core.json`'da listelidir. Bir standart değiştiğinde burada düzeltilir ve etiketlenir; her sitede:

```bash
bun run core:sync v1.2.0      # ya da dal adı; varsayılan main
bun install && bunx oxlint && bun run check && bun test && bun run verify
```

`core.lock` hangi sürümün alındığını ve dosyaların sha256'sını tutar. `tests/core.test.ts` core dosyası sitede elle değiştirilirse kırmızı olur. Template'i yerel kopyadan denemek için: `CORE_SOURCE=../astro-pb-template bun run core:sync`.

Sunucudaki PB'ye `pb/pb_hooks/` klasörü (alt klasörleriyle) kopyalanır; hook'lar izlendiği için PB kendini yeniden yükler.

## Yönlendirmeler (`_redirects`)
Build `dist/_redirects` dosyasını (Cloudflare Pages biçimi) kendisi yazar: `site/src/pages/[redirects].ts`.
- Kaynaklar: önce `site/src/data/redirects.txt` (isteğe bağlı, elle yazılan sabit satırlar: eski siteden gelen toplu adresler), sonra paneldeki **Yönlendirmeler** (`redirects`: eski adres, yeni adres, 301/302, sıra, yayında). Panel kaydı sonunda `/` olan ve olmayan hâliyle iki satır yazılır.
- Kontrol: eski adres `/` ile başlar, aynı adres iki kez yok, kendine ya da zincirle dönen yönlendirme yok, Cloudflare sınırı (2000 sabit + 100 `*`/`:` içeren). Panelde hatalı kayıt kaydedilmez (`pb_hooks/redirects.pb.js`, `lib/redirects.js`); build'deki son kontrol (`site/src/lib/redirects.ts`) hata varsa build'i kırar. Test: `tests/redirects.test.ts`.
- Elle yazılmış `site/public/_redirects` olan site: dosya olduğu gibi çalışmaya devam eder; Astro `[redirects].ts`'i atlar ve build çıktısında "Skipping src/pages/[redirects].ts because a file with the same name exists in the public folder" uyarısı verir. Bu durumda panel yönlendirmeleri yayına çıkmaz. Birleştirmek için dosya `site/src/data/redirects.txt`'ye taşınır (biçim aynı; testler yeni yolu okur).

## SEO varsayılanları
- Ana sayfada Site Ayarları'ndan kurum verisi (JSON-LD, `site/src/lib/seo.ts`): adres ya da telefon doluysa `LocalBusiness`, değilse `Organization` (ad, adres, açıklama, telefon `+90…`, e-posta, paylaşım görseli). Sayfa kendi verisini `<Base jsonLd={…}>` ile ekler. `<script type="application/ld+json">` veri bloğudur, tarayıcı çalıştırmaz: CSP `script-src 'self'` engellemez, verify inline betik saymaz. Metindeki `<` kaçırılır.
- Sitemap `lastmod`: tarihi olan sayfa build sırasında `recordLastmod(yol, tarih)` çağırır (örnek: yazılar), `astro.config.mjs` sitemap `serialize` okur. Tarihsiz sayfa `lastmod`'suz yazılır (build tarihi yazılmaz; Google tutarsız `lastmod`'u yok sayar).

## Yasal sayfalar
- Paneldeki **Sayfalar** (`pages`: başlık, adres, metin, arama açıklaması, sıra, yayında) `/<adres>/` altında yayınlanır (`site/src/pages/[page].astro`); yayındaki her sayfanın bağlantısı sayfa altında görünür. Taslak sayfa ne sitede ne sayfa altında görünür.
- Template iki taslakla gelir (`content.json`, seed): **KVKK Aydınlatma Metni** (`/kvkk-aydinlatma-metni/`) ve **Gizlilik ve Çerez Politikası** (`/gizlilik-politikasi/`). Metinler geneldir, başında "Taslak metin, gözden geçirilmeli" notu ve köşeli parantezli yer tutucular vardır: yayına almadan önce müşterinin hukuk/KVKK danışmanı düzenler ve not silinir. Yeni sitede gerçek metin gelene kadar `published: false` yapılabilir (o zaman verify kontrolleri de çıkarılır).
- Sayfa adresi başlıktan üretilir ve kilitlenir (`site.js` RULES). Sitenin sabit bir sayfasıyla aynı adres verilmemelidir.

## Marka: e-posta şablonları ve panel logosu
- Siteye özel değerler `pb/pb_hooks/site.js` `BRAND`: `name`, `color` (sitenin vurgu rengi), `ink`/`paper` (metin ve zemin), `url` (PUBLIC_SITE_URL), `logo`. Renkler `#rrggbb` (oklch kullanan sitede hex karşılığı). `bun run new-site` ad ve adresi yazar; renk ve logo site tasarlanınca elle.
- Logo: `site/public/logo.svg` varsa build `/brand/logo-mail.png` üretir (400×80 şeffaf PNG, e-postada 200×40; Gmail ve Outlook SVG göstermez); `BRAND.logo` = `<url>/brand/logo-mail.png`. Logo yoksa `logo: ""`: e-postada ad marka renginde yazı, panelde rozet + ad.
- PB sistem e-postaları (yönetim paneli hesapları: parola sıfırlama, tek kullanımlık şifre, e-posta değişikliği, doğrulama, yeni konumdan giriş) Türkçe ve markalı; `brand.pb.js` her açılışta `lib/mail.js` şablonlarını yazar (fark varsa). Panelden değiştirilen şablon sonraki açılışta geri gelir. Form bildirimi de aynı düzende, "Panelde aç" düğmesiyle.
- Panel: giriş ekranı ve üst çubuk logosu, sekme simgesi ve vurgu rengi markadan (`panel/brand.js`, `/_/extensions.js` içinde). Vurgu rengi panelde beyaz yazıyla okunacak kadar koyulaştırılır. PB yapısı değişirse panel PocketBase logosuyla açılır.
- Test: `tests/mail.test.ts` (BRAND biçimi, kaçışlama, logo/yazı, kontrast, gerçek SMTP ile parola sıfırlama e-postası, panel verisi, PNG).

## Ziyaret istatistiği (Cloudflare Web Analytics, çerezsiz)
- Cloudflare panelinde Analytics & Logs > Web Analytics > Add a site (alan adı) ile site eklenir; verilen koddaki `token` değeri (32 onaltılı karakter) panelde **Site ayarları > Ziyaret istatistiği anahtarı** (`cf_analytics_token`) alanına yazılır. Kayıt yeniden yayın tetikler.
- Anahtar doluysa layout `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"…"}'>` ekler (`site/src/lib/seo.ts` `cfBeacon`): dış betik, inline kod yok. Önizleme (fixture) build'inde eklenmez. Boşsa ya da biçimsizse sayaç yoktur.
- CSP (`site/public/_headers`): `script-src 'self' https://static.cloudflareinsights.com`, `connect-src 'self' https://cloudflareinsights.com`.
- Cloudflare Pages'in "otomatik kurulum" (Web Analytics'i Pages projesinden açma) seçeneği kullanılmaz: betiği HTML'e kendisi ekler ve token yönetimi panelden çıkar. Çerez kullanılmadığı için çerez onay bandı gerekmez; gizlilik ve çerez politikası taslağı bunu anlatır.
