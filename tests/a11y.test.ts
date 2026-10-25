// ORTAK (core): template'ten gelir, sitede elle değiştirilmez. verify.ts'teki erişilebilirlik denetiminin kendi testi.
import { expect, test } from "bun:test"
import { a11yProblems } from "../scripts/verify"

const page = (body: string) => `<!doctype html><html lang="tr"><head><title>x</title></head><body>${body}</body></html>`
const rules = (html: string) => a11yProblems(html).map(([r]) => r)

test("temiz sayfada sorun yok", () => {
  const html = page(`<h1>Başlık</h1><h2>Alt</h2><h3>Daha alt</h3><h2>Yine</h2>
    <img src="/a.webp" alt=""><a href="/">Ana sayfa</a><a href="/x" aria-label="X"><svg></svg></a>
    <a href="/y"><img src="/y.webp" alt="Y"></a><button type="button"><span>Menü</span></button>
    <label>Ad <input name="ad"></label><label for="e">E-posta</label><input id="e" type="email">
    <select aria-label="Seç"><option>1</option></select><input type="hidden" name="h"><input type="submit" value="Gönder">
    <!-- <h1>yorum</h1> --><script type="application/ld+json">{"a":"<h1>"}</script>`)
  expect(a11yProblems(html)).toEqual([])
})

test("her kural yakalanır", () => {
  const html = `<html><body><h1>a</h1><h1>b</h1><h4>c</h4><img src="/a.webp"><a href="/z"><svg aria-hidden="true"></svg></a>
    <button></button><input name="q" placeholder="Ara"><textarea></textarea><p id="d"></p><p id="d"></p></body></html>`
  expect(rules(html).sort()).toEqual(["<html lang>", "a adı", "button adı", "başlık sırası", "form etiketi", "form etiketi", "img alt", "tek h1", "tekrarlanan id"].sort())
})
