import { describe, expect, test } from "bun:test"
import { lower, softCase, titleCase, upper } from "../site/src/lib/tr"

// ORTAK (core): template'ten gelir, sitede elle değiştirilmez. Türkçe büyük/küçük harf (site/src/lib/tr.ts).
// Örnekler sitelerin gerçek kullanımından: zirve sponsor kademeleri ve bölüm başlıkları (jciankara), baş harfler (expertup).

describe("lower / upper", () => {
  test("İ/ı ve I/i Türkçe eşleşir", () => {
    expect(lower("İ")).toBe("i")
    expect(lower("I")).toBe("ı")
    expect(upper("i")).toBe("İ")
    expect(upper("ı")).toBe("I")
    expect(lower("IĞDIR İLİ")).toBe("ığdır ili")
    expect(upper("istanbul ılgaz")).toBe("İSTANBUL ILGAZ")
  })
  test("ŞİŞLİ gidiş-dönüş bozulmaz", () => {
    expect(lower("ŞİŞLİ")).toBe("şişli")
    expect(upper(lower("ŞİŞLİ"))).toBe("ŞİŞLİ")
    // yerel ayarsız dönüşümün bozduğu durum: tr.ts'in var olma sebebi
    expect("ŞİŞLİ".toLowerCase()).not.toBe("şişli")
  })
  test("İngilizce yerel ayar I/i'yi İngilizce eşler", () => {
    expect(lower("TICKET INFO", "en")).toBe("ticket info")
    expect(upper("ticket info", "en")).toBe("TICKET INFO")
  })
})

describe("titleCase", () => {
  test("kademe adları (TAMAMEN BÜYÜK kaynak)", () => {
    expect(titleCase("PLATİN SPONSOR")).toBe("Platin Sponsor")
    expect(titleCase("ALTIN SPONSOR")).toBe("Altın Sponsor")
    expect(titleCase("KATKI & DESTEK SPONSORLARI")).toBe("Katkı & Destek Sponsorları")
    expect(titleCase("ŞİŞLİ")).toBe("Şişli")
  })
  test("küçük harfle başlayan ı/i", () => {
    expect(titleCase("ıspanak işi")).toBe("Ispanak İşi")
    expect(titleCase("istanbul ılgaz")).toBe("İstanbul Ilgaz")
  })
  test("kesme işaretinden sonraki ek küçük kalır (düz ve kıvrık kesme)", () => {
    expect(titleCase("ANKARA'NIN GENÇLERİ")).toBe("Ankara'nın Gençleri")
    expect(titleCase("TÜRKİYE’DE İLK")).toBe("Türkiye’de İlk")
    expect(titleCase("2025'TE ZİRVE")).toBe("2025'te Zirve")
  })
  test("kısaltmalar ve rakamlı kelimeler büyük kalır", () => {
    const acronyms = new Set(["JCI", "GLZ", "ECM", "TÖK"])
    expect(titleCase("JCI ANKARA", "tr", acronyms)).toBe("JCI Ankara")
    expect(titleCase("JCI'NIN ZİRVESİ", "tr", acronyms)).toBe("JCI'nın Zirvesi")
    expect(titleCase("tök üyeleri", "tr", acronyms)).toBe("TÖK Üyeleri")
    expect(titleCase("cop31 hazırlığı")).toBe("COP31 Hazırlığı")
    // kısaltma listesi verilmezse sıradan kelime
    expect(titleCase("JCI ANKARA")).toBe("Jcı Ankara")
  })
  test("ayraçlar ve boşluklar korunur", () => {
    expect(titleCase("GİRİŞİMCİLİK-LİDERLİK  ZİRVESİ / 2026")).toBe("Girişimcilik-Liderlik  Zirvesi / 2026")
    expect(titleCase("")).toBe("")
  })
  test("İngilizce yerel ayar", () => {
    expect(titleCase("TICKET INFO", "en")).toBe("Ticket Info")
    expect(titleCase("ECM 2025 CAPPADOCIA PROGRAM", "en", new Set(["ECM"]))).toBe("ECM 2025 Cappadocia Program")
  })
})

describe("softCase", () => {
  const acronyms = new Set(["ECM", "GLZ", "FAQ"])
  test("TAMAMEN BÜYÜK başlık yumuşar", () => {
    expect(softCase("ZİRVE HAKKINDA")).toBe("Zirve Hakkında")
    expect(softCase("GLZ HAKKINDA", "tr", acronyms)).toBe("GLZ Hakkında")
    expect(softCase("TICKET INFO", "en")).toBe("Ticket Info")
  })
  test("karışık yazılmış ve harfsiz metin olduğu gibi kalır", () => {
    expect(softCase("Girişimcilik ve Liderlik Zirvesi Nedir?")).toBe("Girişimcilik ve Liderlik Zirvesi Nedir?")
    expect(softCase("Ankara'nın İlk Zirvesi")).toBe("Ankara'nın İlk Zirvesi")
    expect(softCase("2025")).toBe("2025")
    expect(softCase("ECM 2025 FAQ", "en", acronyms)).toBe("ECM 2025 FAQ")
  })
})
