# GEO ve WebMCP

SEO arama motorları içindir. **GEO** (generative engine optimization) ise yapay zekâ arama motorları ve asistanlar (ChatGPT, Perplexity, Claude, Google AI Overviews) içindir: siteyi doğru okumaları ve kaynak olarak doğru adresi göstermeleri hedeflenir. **WebMCP** ise tarayıcıdaki yapay zekâ ajanına siteyi okuyabileceği araçlar tanıtır.

Hepsi build'de, sayfalarla aynı veriden (PB ya da fixture) üretilir. Sunucu tarafında ek bir şey çalışmaz.

## Parçalar

| Çıktı | Ne işe yarar | Üreten |
|---|---|---|
| `/llms.txt` | [llmstxt.org](https://llmstxt.org) biçiminde özet: kurum adı (H1), tek cümlelik özet, künye, bölümlere ayrılmış önemli sayfalar (her biri tek satır açıklamalı) ve iletişim yolları | `pages/[geo].txt.ts`, `lib/llms.ts` |
| `/llms-full.txt` | İçeriği olan bütün sayfaların düz metni tek dosyada. Her bölümde kaynak adresi ve tarih bulunur | aynı |
| `/<yol>/index.md` | Her içerik sayfasının markdown eşi (`/index.md`, `/yazilar/x/index.md`). HTML sayfa `<link rel="alternate" type="text/markdown">` ile bu dosyayı gösterir | `pages/[...geo].md.ts`, `components/Geo.astro` |
| `/robots.txt` | Herkese açık. Yapay zekâ cevap botları ayrıca açıkça izinlidir. Eğitim tarayıcıları site ayarına bağlıdır. Sitemap ve llms.txt adreslerini gösterir | `pages/[geo].txt.ts` |
| JSON-LD | Sayfa düzeyi `WebPage`, `Article`, `FAQPage`, `BreadcrumbList` ve `dateModified` yardımcıları. Kurum verisi (Organization/LocalBusiness) `lib/seo.ts`'te kalır, yardımcılar ona `/#organization` kimliğiyle bağlanır | `lib/jsonld.ts` |
| `/webmcp.json` + WebMCP betiği | Tarayıcı WebMCP sunuyorsa salt okuyan araçlar kaydedilir | `pages/[geo].json.ts`, `lib/webmcp.ts`, `scripts/webmcp.ts` |
| İletişim formu öznitelikleri | Bildirimsel WebMCP: `toolname`, `tooldescription`, `toolparamdescription` | `components/ContactForm.astro` (siteye ait örnek) |

**Core** dosyaları: `lib/llms.ts`, `lib/jsonld.ts`, `lib/webmcp.ts`, `lib/geo-load.ts`, `scripts/webmcp.ts`, `components/Geo.astro`, `pages/[geo].txt.ts`, `pages/[geo].json.ts`, `pages/[...geo].md.ts`, `src/webmcp.d.ts`, `scripts/geo-check.ts`, `tests/geo.test.ts` ve `tests/webmcp.test.ts`.

**Siteye ait** dosya: `site/src/lib/geo.ts`. Hangi sayfaların gireceğini ve neyin yazılacağını bu dosya belirler.

`lib/geo.ts` yoksa bu çıktıların hiçbiri üretilmez ve build kırılmaz. Böylece `core:sync` ile gelen bir site, kendi `geo.ts`'ini ekleyene kadar eskisi gibi çalışır.

## Sitede açmak

1. `site/src/lib/geo.ts` dosyasını yazın: `export async function geo(): Promise<GeoSite>`. Template'teki örnek yol gösterir. İçerik `loadSite()`'tan gelir, böylece PB ile fixture aynı metni verir.
   - `name`, `summary`: kurum adı ve tek cümlelik özet (`settings.seoDescription` uygundur).
   - `facts`: telefon, e-posta, adres, çalışma saatleri gibi künye bilgileri. Boş değerler yazılmaz.
   - `sections`: `{ title, pages: [{ path, title, description, content?, date? }] }`. `content` markdown'dır. Panel HTML'i `htmlToMarkdown(html)` ile çevrilir. Ana sayfa listede olmalıdır (verify bunu ölçer). İçeriği olan sayfanın markdown eşi de üretilir. Önemsiz sayfalar için llmstxt.org'un `Optional` adlı bölümü kullanılabilir.
   - `contact`: form, Google Forms, WhatsApp, telefon bağlantıları (`kind`). WebMCP bunları yalnız bağlantı olarak verir.
   - `aiTraining`: eğitim tarayıcıları (GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, CCBot, meta-externalagent). Varsayılan `true`. Müşteri istemezse `false` yapılır. Cevap ve arama botları her durumda izinli kalır, çünkü ziyaretçinin sorusuna cevap verirken siteyi kaynak gösteren onlardır.
   - `robots: false`: robots.txt'i site kendisi verir. Core üretmez, ama verify yine yapay zekâ bölümünü arar.
   - `markdown: false`: markdown eşleri üretilmez.
   - `disallow`: robots.txt'te her gruba yazılacak yasak yollar (ör. `/k/`).
2. Layout'un `<head>`'ine tek satır ekleyin: `<Geo path={path} />` (`import Geo from "../components/Geo.astro"`). Bu satır markdown eşi bağlantısını ve WebMCP betiğini ekler.
3. `public/robots.txt` ya da kendi `robots.txt.ts`'iniz varsa silin, robots.txt artık core'dan gelir. Kendi dosyanızı tutmak istiyorsanız `robots: false` verin ve yapay zekâ bölümünü elle yazın.
4. `site.config.ts`: `import { GEO_CHECKS } from "./scripts/geo-check"` ve `checks: [...GEO_CHECKS, ...]`. Siteye özel içerik kontrolleri de eklenebilir (ör. llms.txt'te bir hizmet adı).
5. Sayfalarda JSON-LD için yardımcıları kullanın. Örnek:

   ```ts
   graph(article({ site: Astro.site!, path, name, description, datePublished, dateModified: rec.updated }), breadcrumbList([...], Astro.site!))
   ```

   SSS bölümü olan sayfada `faqPage(items)` kullanılır. Kurum sayfası için `webPage({ type: "AboutPage" | "ContactPage", ... })` kullanılır. `dateModified` için PB kaydının `updated` alanı yükleyicide okunur. Fixture'da bu alan yoksa yayın tarihi kullanılır.

## WebMCP

Hedeflenen API, W3C Web Machine Learning Community Group taslağıdır ([WebMCP Draft CG Report, 9 Ekim 2026](https://webmachinelearning.github.io/webmcp/)): `document.modelContext.registerTool(tool, { signal })`. `tool` şu alanları taşır: `name`, `title`, `description`, `inputSchema`, `execute(input, { signal })` ve `annotations.readOnlyHint`. Chrome'un erken önizlemesi (146) aynı nesneyi `navigator.modelContext` olarak sundu. Chrome 150'den beri bu ad eskimiş bir takma addır. Betik önce `document`'i, sonra `navigator`'ı dener. `provideContext`/`clearContext` güncel taslakta yok, bu yüzden kullanılmaz.

- **Araçlar**: hepsi salt okur, hepsi `readOnlyHint: true`.
  - `site_info`: özet ve künye.
  - `list_pages`: isteğe bağlı bölüm süzgeciyle sayfa listesi.
  - `search_content`: Türkçe duyarlı arama. "ısı", "ISI" ve "isi" aynı sonucu verir.
  - `get_page`: bir sayfanın düz metni.
  - `contact_links`: yalnız `contact` doluysa kaydedilir ve yalnız bağlantı döndürür.
- **Sınırlar**: Hiçbir araç form göndermez, kayıt açmaz ya da ziyaretçi adına işlem yapmaz.
- **Güvenlik ve sessizlik**:
  - Betik `/_astro/` altında paketlenmiş bir dış dosyadır. Veri aynı kökenden `/webmcp.json` olarak gelir, bu yüzden CSP `script-src 'self'` ve `connect-src 'self'` yeterlidir.
  - Tarayıcıda API yoksa betik hiçbir şey yapmaz, veriyi bile indirmez.
  - Kayıt hataları (aynı ad, `Permissions-Policy: tools=()`) sessizce yutulur, konsola hata düşmez.
  - `_headers`'taki `Permissions-Policy`'ye `tools=()` eklenirse WebMCP kapanır.
- **Dönüş biçimi**: Taslak `execute` dönüşünü JSON'a çevirir. Chrome'un erken sürümü ise MCP biçimini (`{ content: [{ type: "text", text }] }`) bekler. Araçlar bu yüzden MCP biçiminde döner, metin alanında JSON taşır. Her iki taraf da okuyabilir.
- **Bildirimsel form**:
  - `<form toolname="contact_message" tooldescription="...">` ve alanlarda `toolparamdescription` kullanılır ([açıklama](https://github.com/webmachinelearning/webmcp/blob/main/declarative-api-explainer.md)).
  - `toolautosubmit` **yoktur**. Ajan formu doldurabilir, ama gönder düğmesine ve KVKK onayına ziyaretçi kendisi basar.
  - Google Forms ya da WhatsApp kullanan sitede form sitede değildir, bu yüzden yalnız `contact_links` vardır.
  - Öznitelik tipleri `site/src/webmcp.d.ts`'te tanımlıdır, bu sayede astro check hata vermez.

## Kontrol

```bash
bun run verify                         # GEO_CHECKS: llms.txt, llms-full.txt, robots AI bölümü + sitemap, webmcp.json, dış WebMCP betiği, /index.md
bun test tests/geo.test.ts tests/webmcp.test.ts

curl -s https://<alan-adı>/llms.txt
curl -s https://<alan-adı>/llms-full.txt | head -40
curl -s https://<alan-adı>/robots.txt
curl -s https://<alan-adı>/yazilar/<slug>/index.md
curl -sI https://<alan-adı>/webmcp.json   # 200, application/json
```

JSON-LD'yi denetlemek için: [Google Rich Results Test](https://search.google.com/test/rich-results) ya da [validator.schema.org](https://validator.schema.org/).

WebMCP'yi Chrome'da denemek için:

1. `chrome://flags/#enable-webmcp-testing` bayrağını açın ve Chrome'u yeniden başlatın.
2. Chrome Web Mağazası'ndan "Model Context Tool Inspector" uzantısını kurun.
3. Siteyi HTTPS'te ya da `localhost`'ta açın (`bun run preview`). Uzantı `site_info`, `list_pages`, `search_content`, `get_page` ve `contact_links` araçlarını listelemelidir.
4. Konsolda `document.modelContext ?? navigator.modelContext` ifadesi nesne döndürmelidir. Bayrak kapalıyken `undefined` döner ve sayfada hiçbir şey değişmez.

Bayraksız ziyaretçiler için Chrome origin trial anahtarı istenirse `<meta http-equiv="origin-trial" content="...">` satırı siteye eklenir. Bu bir veri satırıdır, inline betik sayılmaz.

## Notlar

- `.md` eşleri sitemap'te yoktur. Kanonik adres HTML sayfadır, llms.txt de HTML adreslerini listeler. Yapay zekâ bu sayede doğru adresi kaynak gösterir.
- Tek dilli sitede hepsi TR'dir. Çok dilli sitede (`docs/i18n.md`) `geo.ts` her dil için ayrı bölüm verebilir. `/en/` sayfaları da `sections` içine yazılır.
- PB/fixture paritesi HTML'in görünen metnini karşılaştırır. GEO dosyaları da aynı veriden üretilir, `GEO_CHECKS` ve site kontrolleri PB build'inde çalışır.
