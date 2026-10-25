// ORTAK (core): template'ten gelir, sitede elle değiştirilmez (bun run core:sync).
// PocketBase yönetim panelinin Türkçe katmanı. panel-tr.pb.js bunu /_/extensions.js olarak sunar.
// Yalnız ekrandaki yazıyı değiştirir: veriye, API'ye ve kayıt içeriğine dokunmaz. Sözlükte olmayan metin İngilizce kalır.
// Kapsam müşterinin gördüğü ekranlardır (giriş, içerik listesi, kayıt formu, onay ve bildirimler); Ayarlar ve Loglar çevrilmez.
// Site etiketleri (koleksiyon ve alan adlarının Türkçesi) window.PB_TR_LABELS ile gelir: { collections: {}, fields: {} }.

const UI = {
  // giriş ve parola
  "Superuser login": "Yönetici girişi", "Email": "E-posta", "Password": "Parola", "Login": "Giriş yap",
  "Forgotten password": "Parolamı unuttum", "Forgotten password?": "Parolamı unuttum", "Forgotten superuser password": "Parolamı unuttum",
  "Show password": "Parolayı göster", "Hide password": "Parolayı gizle", "Back to login": "Girişe dön",
  "Enter the email associated with your account and we'll send you a recovery link:": "Hesabınızın e-posta adresini yazın, size parola sıfırlama bağlantısı gönderelim:",
  "Send recovery link": "Bağlantıyı gönder", "Send": "Gönder", "Set new password": "Yeni parolayı kaydet",
  "New password": "Yeni parola", "New password confirm": "Yeni parola (tekrar)", "Password confirm": "Parola (tekrar)",
  "Confirm password reset": "Parola sıfırlama", "The password was successfully changed.": "Parolanız değiştirildi.",
  "You can go back to sign in with your new password.": "Yeni parolanızla giriş yapabilirsiniz.",
  "Invalid login credentials.": "E-posta ya da parola hatalı.", "One-time password": "Tek kullanımlık şifre",
  "Send OTP": "Şifre gönder", "Request another OTP": "Yeni şifre iste", "Recommended at least 10 characters.": "En az 10 karakter önerilir.",
  "Invalid or expired password reset token.": "Parola sıfırlama bağlantısının süresi dolmuş ya da geçersiz.",
  // üst menü ve kenar çubuğu
  "Collections": "İçerik", "Logs": "Loglar", "Settings": "Ayarlar", "Logout": "Çıkış", "Manage superusers": "Yöneticiler",
  "Color scheme": "Görünüm", "Light": "Açık", "Dark": "Koyu", "Auto": "Otomatik", "Pinned": "Sabitlenenler", "Others": "Diğer",
  "System": "Sistem", "Search collections...": "İçerik ara...", "No collections found.": "İçerik türü bulunamadı.",
  "Pin": "Sabitle", "Unpin": "Sabitlemeyi kaldır", "Toggle sidebar": "Menüyü aç/kapa", "Docs": "Belgeler",
  "Select collection from the sidebar.": "Soldan bir içerik türü seçin.", "Select collection": "İçerik türü seçin",
  // liste
  "New record": "Yeni kayıt", "Add new record": "Yeni kayıt ekle", "New": "Yeni", "Refresh": "Yenile",
  "Collection settings": "İçerik türü ayarları", "Toggle columns": "Sütunlar", "Search term or filter...": "Ara...",
  "Search": "Ara", "Search...": "Ara...", "Search history": "Arama geçmişi", "Clear search": "Aramayı temizle",
  "Your recent searches will show up here.": "Son aramalarınız burada görünür.", "No records found.": "Kayıt bulunamadı.",
  "No items found": "Sonuç yok", "Load more": "Daha fazla göster", "Total:": "Toplam:", "Selected": "Seçili",
  "record": "kayıt", "records": "kayıt", "Reset": "Seçimi kaldır", "Delete": "Sil", "Copy": "Kopyala", "Copied": "Kopyalandı",
  "Failed to copy.": "Kopyalanamadı.", "Loading...": "Yükleniyor...", "Please wait...": "Lütfen bekleyin...",
  "Shift + Click": "Shift + Tık", "Open in new tab": "Yeni sekmede aç", "Download": "İndir", "Preview": "Önizleme",
  "Cannot preview the file.": "Dosya önizlenemiyor.", "Has unsaved changes": "Kaydedilmemiş değişiklik var",
  // kayıt formu
  "Edit": "Düzenle", "Create": "Oluştur", "Save changes": "Kaydet", "Save and continue": "Kaydet ve açık kalsın",
  "Create and continue": "Oluştur ve açık kalsın", "Save options": "Kaydetme seçenekleri", "More options": "Diğer seçenekler",
  "Close": "Kapat", "Cancel": "Vazgeç", "Reset form": "Formu sıfırla", "Copy JSON": "JSON olarak kopyala",
  "Download JSON": "JSON olarak indir", "Duplicate": "Kopyasını oluştur", "Delete record": "Kaydı sil",
  "Unlock to save": "Kaydetmek için kilidi aç", "Restore": "Geri al", "Remove": "Kaldır", "Remove file": "Dosyayı kaldır",
  "Upload or drop new file": "Dosya seçin ya da buraya sürükleyin", "Max allowed files reached": "Dosya sınırına ulaşıldı",
  "can't add more files - max allowed files reached": "Daha fazla dosya eklenemez, sınıra ulaşıldı.",
  "Leave empty to autogenerate...": "Boş bırakılırsa otomatik oluşur...", "Select": "Seç", "- Select -": "- Seçin -",
  "Set selection": "Seçimi uygula", "Open records picker": "Kayıt seç", "Edit relation record": "Bağlı kaydı düzenle",
  "No selected records.": "Seçili kayıt yok.", "Unset": "Boşalt", "Insert": "Ekle", "Item": "Öge",
  "No records with selectable files found.": "Seçilebilir dosyası olan kayıt yok.", "Valid JSON": "Geçerli JSON",
  "Invalid JSON": "Geçersiz JSON", "Latitude:": "Enlem:", "Longitude:": "Boylam:", "True": "Evet", "False": "Hayır",
  "Yes": "Evet", "No": "Hayır", "On": "Açık", "Off": "Kapalı", "Confirm": "Onayla", "Enter": "Enter", "Escape": "Esc",
  "Restore draft": "Taslağı geri yükle", "Discard draft": "Taslağı sil", "Yes, discard": "Evet, vazgeç",
  "The record has previous unsaved changes.": "Bu kayıtta daha önce kaydedilmemiş değişiklikler var.",
  "You have unsaved changes. Do you really want to discard them?": "Kaydedilmemiş değişiklikler var. Vazgeçmek istediğinize emin misiniz?",
  "Do you really want to delete the selected record?": "Bu kaydı silmek istediğinize emin misiniz?",
  "Do you really want to delete the selected records?": "Seçili kayıtları silmek istediğinize emin misiniz?",
  "Record copied to clipboard!": "Kayıt panoya kopyalandı.", "Failed to load record.": "Kayıt yüklenemedi.",
  "Failed to save record.": "Kayıt kaydedilemedi.", "Predefined colors": "Hazır renkler", "Clear": "Temizle",
  "App logo": "Logo", "API preview": "API önizleme", "New collection": "Yeni içerik türü", "(you)": "(siz)",
  "Insert media": "Görsel ya da dosya ekle", "Collections overview": "İçerik türlerine genel bakış",
  // API hata iletileri
  "Cannot be blank.": "Boş bırakılamaz.", "Invalid value format.": "Değer biçimi geçersiz.", "Invalid value format": "Değer biçimi geçersiz.",
  "Must be a valid url": "Geçerli bir web adresi olmalı (https://...).", "Must be a valid json value": "Geçerli bir JSON olmalı.",
  "Must be a valid email address.": "Geçerli bir e-posta adresi olmalı.", "must be a valid email address": "Geçerli bir e-posta adresi olmalı.",
  "Value must be unique": "Bu değer başka bir kayıtta var; farklı olmalı.", "Values don't match.": "Değerler eşleşmiyor.",
  "Decimal numbers are not allowed": "Ondalıklı sayı girilemez.", "The submitted number is not properly formatted": "Sayı biçimi geçersiz.",
  "Invalid field value.": "Alan değeri geçersiz.", "Unknown or invalid field.": "Bilinmeyen ya da geçersiz alan.",
  "Failed to find all relation records with the provided ids": "Seçilen bağlı kayıtlardan bazıları bulunamadı.",
  "Relation connection is missing or cannot be accessed": "Bağlı kayıt bulunamadı ya da erişilemiyor.",
  "Failed to create record.": "Kayıt oluşturulamadı.", "Failed to create record": "Kayıt oluşturulamadı.", "Failed to update record.": "Kayıt güncellenemedi.",
  "Failed to delete record. Make sure that the record is not part of a required relation reference.": "Kayıt silinemedi. Başka bir kayıt buna bağlı olabilir.",
  "An error occurred while validating the submitted data.": "Gönderilen bilgilerde hata var; işaretli alanlara bakın.",
  "An error occurred while loading the submitted data.": "Gönderilen bilgiler okunamadı.",
  "Something went wrong while processing your request.": "İstek işlenirken bir sorun oluştu.",
  "The requested resource wasn't found.": "Aranan kayıt bulunamadı.", "Missing or invalid record.": "Kayıt bulunamadı.",
  "You are not allowed to perform this request.": "Bu işlem için yetkiniz yok.",
  "Only superusers can perform this action.": "Bu işlemi yalnız yöneticiler yapabilir.",
  "Insufficient permissions to access the resource.": "Bu kayda erişim yetkiniz yok.",
  "The request requires valid record authorization token.": "Oturumunuzun süresi doldu; yeniden giriş yapın.",
  "Too many requests.": "Çok fazla istek gönderildi; biraz bekleyip yeniden deneyin.",
}

// Dinamik metinler: [desen, karşılık]
const PATTERNS = [
  [/^Total found: (\d+)$/, "Toplam $1"],
  [/^Selected \((\d+) of max (\d+)\)$/, "Seçili ($1 / en çok $2)"],
  [/^Successfully (created|updated) \S+ "(\w+)"\.$/, (_, a) => (a === "created" ? "Kayıt oluşturuldu." : "Değişiklikler kaydedildi.")],
  [/^Successfully deleted record "\w+"\.$/, "Kayıt silindi."],
  [/^Successfully deleted (\d+) records?\.$/, "$1 kayıt silindi."],
  [/^Must be at least (\d+) character\(s\)\.$/, "En az $1 karakter olmalı."],
  [/^Must be no more than (\d+) character\(s\)\.$/, "En çok $1 karakter olabilir."],
  [/^Must be greater or equal than (.+)$/, "$1 ya da daha büyük olmalı."],
  [/^Must be less or equal than (.+)$/, "$1 ya da daha küçük olmalı."],
  [/^Select at least (\d+)$/, "En az $1 seçim yapın."],
  [/^Select no more than (\d+)$/, "En çok $1 seçim yapılabilir."],
  [/^The maximum allowed files is (\d+)$/, "En çok $1 dosya yüklenebilir."],
  [/^Failed to upload (.+) - the maximum allowed file size is (\d+) bytes\.$/, (_, f, n) => `${f} yüklenemedi: dosya en çok ${(n / 1048576).toFixed(0)} MB olabilir.`],
  [/^Failed to upload (.+) due to unsupported file type\.$/, "$1 yüklenemedi: bu dosya türü kabul edilmiyor."],
  [/^Invalid new files: (.+)\.$/, "Geçersiz dosyalar: $1."],
  [/^Thumb of (.+)$/, "$1 küçük görseli"],
  [/^Preview (.+)$/, "Önizleme: $1"],
  [/^Refresh\n\(list changed\)$/, "Yenile\n(liste değişti)"],
  [/^PocketBase (v[\d.]+)$/, "PocketBase $1"],
]

const LABELS = window.PB_TR_LABELS || { collections: {}, fields: {} }
// Sık kullanılan alan adları; site etiketleri bunları ezer.
const COMMON_FIELDS = {
  id: "Kimlik", created: "Oluşturulma", updated: "Güncellenme", title: "Başlık", name: "Ad", slug: "Adres (slug)",
  published: "Yayında", position: "Sıra", sort: "Sıra", order: "Sıra", summary: "Özet", body: "Metin", image: "Görsel",
  images: "Görseller", cover: "Kapak görseli", email: "E-posta", phone: "Telefon", address: "Adres", url: "Bağlantı",
  date: "Tarih", description: "Açıklama", caption: "Açıklama", icon: "Simge", featured: "Öne çıkan", category: "Kategori",
  seo_description: "Arama motoru açıklaması", share_image: "Paylaşım görseli", password: "Parola", passwordConfirm: "Parola (tekrar)",
  emailVisibility: "E-posta herkese açık", verified: "Doğrulanmış", key: "Anahtar", file: "Dosya", alt: "Alternatif metin",
  company_name: "Firma adı", legal_name: "Ticari unvan", tagline: "Slogan", hero_title: "Ana başlık", hero_text: "Ana başlık açıklaması",
  hero_image: "Ana görsel", footer_text: "Sayfa altı yazısı", map_url: "Harita (embed) adresi", whatsapp: "WhatsApp",
  whatsapp_url: "WhatsApp bağlantısı", instagram_url: "Instagram adresi", linkedin_url: "LinkedIn adresi", facebook_url: "Facebook adresi",
  x_url: "X (Twitter) adresi", youtube_url: "YouTube adresi", about_title: "Hakkımızda başlığı", about_text: "Hakkımızda metni",
  announcement: "Duyuru", logo: "Logo", excerpt: "Kısa özet", value: "Değer", label: "Etiket", question: "Soru", answer: "Cevap",
  title_en: "Başlık (İngilizce)", year: "Yıl", location: "Konum", phone2: "Telefon 2", fax: "Faks", website: "Web sitesi",
  role: "Görev", photo: "Fotoğraf", company: "Kurum", message: "Mesaj", text: "Metin", status: "Durum", gallery: "Galeri",
  lang: "Dil", subtitle: "Alt başlık", seo_title: "Arama motoru başlığı", og_image: "Paylaşım görseli", place: "Yer",
  source_url: "Kaynak adresi", features: "Özellikler", items: "Maddeler", badge: "Rozet", color: "Renk", intro: "Giriş metni",
  content: "İçerik", link: "Bağlantı", city: "Şehir", country: "Ülke", start_date: "Başlangıç tarihi", end_date: "Bitiş tarihi",
}
const activeCollection = () => window.app?.store?.activeCollection?.name
const fieldLabel = (k) => LABELS.fields?.[`${activeCollection()}.${k}`] ?? LABELS.fields?.[k] ?? COMMON_FIELDS[k]
const collectionLabel = (k) => LABELS.collections?.[k]

// Koleksiyon ve alan adları yalnız bu bölgelerde çevrilir; kayıt içeriğinde aynı kelime geçse dokunulmaz.
const COLLECTION_SCOPE = ".sidebar-content, .collections-sidebar, .breadcrumbs, .collection-name, .modal-title, .dropdown-item, .page-header"
const FIELD_SCOPE = "thead th, label"
const SKIP = "input, textarea, code, pre, .cm-editor, .code-editor, .tox, td.col-type-text, td .txt-ellipsis"
const ATTRS = ["placeholder", "data-placeholder", "title", "aria-label", "alt"]

function translate(raw, el) {
  const key = raw.trim()
  if (!key || !/[A-Za-z]/.test(key)) return null
  let out = UI[key]
  if (out === undefined && el) {
    if (el.closest(COLLECTION_SCOPE)) out = collectionLabel(key)
    if (out === undefined && el.closest(FIELD_SCOPE)) out = fieldLabel(key)
  }
  if (out === undefined) {
    for (const [re, rep] of PATTERNS) {
      if (re.test(key)) { out = key.replace(re, rep); break }
    }
  }
  return out === undefined ? null : raw.replace(key, out)
}

function translateText(node) {
  const el = node.parentElement
  if (!el || (el.closest(SKIP) && !el.closest(".cm-placeholder"))) return
  const v = translate(node.nodeValue, el)
  if (v !== null && v !== node.nodeValue) node.nodeValue = v
}

function translateAttrs(el) {
  for (const a of ATTRS) {
    const v = el.getAttribute(a)
    if (!v) continue
    const t = translate(v, el)
    if (t !== null && t !== v) el.setAttribute(a, t)
  }
}

// Birden çok parçadan kurulan cümleler: "Edit <strong>spaces</strong> record" → "Alanlar · düzenle"
function fixModalTitle(h) {
  const spans = h.querySelectorAll(":scope > span")
  if (spans.length < 2) return
  const first = spans[0], last = spans[spans.length - 1]
  const mode = first.dataset.trMode || first.textContent.trim()
  if (mode === "Edit" || mode === "Create") {
    first.dataset.trMode = mode
    if (first.textContent !== "") first.textContent = ""
    const suffix = mode === "Edit" ? " · düzenle" : " · yeni kayıt"
    if (last.textContent !== suffix) last.textContent = suffix
  }
}

function walk(root) {
  if (root.nodeType === 3) return translateText(root)
  if (root.nodeType !== 1) return
  translateAttrs(root)
  if (root.matches?.("h6.modal-title")) fixModalTitle(root)
  root.querySelectorAll?.("h6.modal-title").forEach(fixModalTitle)
  if (root.matches(SKIP)) return
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  while (w.nextNode()) {
    const n = w.currentNode
    if (n.nodeType === 3) translateText(n)
    else translateAttrs(n)
  }
}

new MutationObserver((list) => {
  for (const m of list) {
    if (m.type === "childList") m.addedNodes.forEach(walk)
    else if (m.type === "characterData") translateText(m.target)
    else translateAttrs(m.target)
    const title = m.target.nodeType === 1 ? m.target.closest?.("h6.modal-title") : m.target.parentElement?.closest("h6.modal-title")
    if (title) fixModalTitle(title)
  }
}).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS })

walk(document.body)
document.documentElement.lang = "tr"

// Onay pencereleri ve bildirimler metni doğrudan alır; çeviriyi kaynağında yapmak titremeyi önler.
if (window.app?.toasts) {
  for (const k of ["success", "error", "warning", "info"]) {
    const orig = app.toasts[k]
    if (typeof orig === "function") app.toasts[k] = (msg, ...rest) => orig.call(app.toasts, typeof msg === "string" ? translate(msg) ?? msg : msg, ...rest)
  }
}

// Zengin metin düzenleyicisi (TinyMCE): araç çubuğu ve bağlantı/görsel pencereleri.
const TINY = {
  "Paragraph": "Paragraf", "Heading 1": "Başlık 1", "Heading 2": "Başlık 2", "Heading 3": "Başlık 3", "Heading 4": "Başlık 4",
  "Heading 5": "Başlık 5", "Heading 6": "Başlık 6", "Headings": "Başlıklar", "Blocks": "Bloklar", "Inline": "Satır içi",
  "Align": "Hizalama", "Formats": "Biçimler", "Blockquote": "Alıntı", "Div": "Div", "Pre": "Ön biçimli", "Code": "Kod",
  "Bold": "Kalın", "Italic": "İtalik", "Underline": "Altı çizili", "Strikethrough": "Üstü çizili", "Superscript": "Üst simge", "Subscript": "Alt simge",
  "Align left": "Sola hizala", "Align center": "Ortala", "Align right": "Sağa hizala", "Justify": "İki yana yasla",
  "Text color": "Yazı rengi", "Background color": "Arka plan rengi", "Remove color": "Rengi kaldır", "Custom color": "Özel renk",
  "Bullet list": "Madde işaretli liste", "Numbered list": "Numaralı liste", "Insert/edit link": "Bağlantı ekle/düzenle",
  "Insert/Edit Link": "Bağlantı ekle/düzenle", "Link": "Bağlantı", "Remove link": "Bağlantıyı kaldır", "Open link": "Bağlantıyı aç",
  "URL": "Adres (URL)", "Text to display": "Görünen metin", "Title": "Başlık", "Open link in...": "Bağlantı nerede açılsın",
  "Current window": "Aynı pencere", "New window": "Yeni pencere", "None": "Yok", "Save": "Kaydet", "Cancel": "Vazgeç", "Close": "Kapat",
  "Table": "Tablo", "Insert table": "Tablo ekle", "Delete table": "Tabloyu sil", "Row": "Satır", "Column": "Sütun", "Cell": "Hücre",
  "Insert/edit code sample": "Kod örneği ekle/düzenle", "Language": "Dil", "Direction": "Yazı yönü", "Left to right": "Soldan sağa",
  "Right to left": "Sağdan sola", "Source code": "Kaynak kodu", "Fullscreen": "Tam ekran", "Undo": "Geri al", "Redo": "Yinele",
  "Insert/edit image": "Görsel ekle/düzenle", "Image": "Görsel", "Source": "Kaynak", "Alternative description": "Alternatif açıklama",
  "Image is decorative": "Görsel süs amaçlı", "Width": "Genişlik", "Height": "Yükseklik", "Constrain proportions": "Oranı koru",
  "General": "Genel", "Upload": "Yükle", "Browse for an image": "Görsel seç", "Drop an image here": "Görseli buraya bırakın",
  "Insert/edit media": "Medya ekle/düzenle", "Embed": "Gömme kodu", "Words": "Kelime", "{0} words": "{0} kelime",
  "Rich Text Area": "Zengin metin alanı", "Rich Text Area. Press ALT-0 for help.": "Zengin metin alanı. Yardım için ALT-0.",
  "Format {0}": "Biçim: {0}", "Text color {0}": "Yazı rengi: {0}", "Background color {0}": "Arka plan rengi: {0}",
  "Black": "Siyah", "White": "Beyaz", "Gray": "Gri", "Light Gray": "Açık gri", "Dark Gray": "Koyu gri", "Red": "Kırmızı",
  "Orange": "Turuncu", "Yellow": "Sarı", "Green": "Yeşil", "Blue": "Mavi", "Purple": "Mor", "Navy Blue": "Lacivert",
  "Light Green": "Açık yeşil", "Light Yellow": "Açık sarı", "Light Red": "Açık kırmızı", "Light Purple": "Açık mor", "Light Blue": "Açık mavi",
  "Dark Red": "Koyu kırmızı", "Dark Purple": "Koyu mor", "Dark Blue": "Koyu mavi", "Dark Yellow": "Koyu sarı", "Dark Turquoise": "Koyu turkuaz",
  "Turquoise": "Turkuaz", "Medium Gray": "Orta gri",
  "Reveal or hide additional toolbar items": "Diğer araçları göster/gizle", "More...": "Diğer...", "Styles": "Stiller",
}
const tinyHook = () => {
  if (!window.tinymce || window.tinymce.__tr) return false
  window.tinymce.addI18n("tr", TINY)
  window.tinymce.__tr = true
  return true
}
if (window.app?.components?.tinymce) {
  const origTiny = app.components.tinymce
  app.components.tinymce = function (props = {}) {
    const before = props.onbeforeinit
    props.onbeforeinit = function (opts) {
      tinyHook()
      opts.language = "tr"
      return before?.call(this, opts)
    }
    return origTiny.call(this, props)
  }
}
