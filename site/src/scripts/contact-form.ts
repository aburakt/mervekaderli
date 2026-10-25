// SİTEYE ÖZEL (örnek): ContactForm.astro gönderimi. Form verisi JSON olarak PB kayıt adresine gider;
// "website" spam tuzağıdır (PB doluysa kaydı spam işaretler). Sayfada inline betik yok (CSP script-src 'self').
for (const form of document.querySelectorAll<HTMLFormElement>("form[data-contact-form]")) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault()
    const status = form.querySelector<HTMLElement>("[data-form-status]")
    const button = form.querySelector<HTMLButtonElement>("button[type=submit]")
    const data = new FormData(form)
    const body = {
      name: data.get("name"),
      email: data.get("email"),
      phone: data.get("phone") ?? "",
      message: data.get("message"),
      kvkk_consent: data.get("kvkk_consent") === "on",
      website: data.get("website") ?? "",
    }
    if (button) button.disabled = true
    try {
      const res = await fetch(form.dataset.endpoint ?? "", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(String(res.status))
      if (status) status.textContent = form.dataset.ok ?? ""
      form.reset()
    } catch {
      if (status) status.textContent = form.dataset.fail ?? ""
    } finally {
      if (button) button.disabled = false
    }
  })
}
