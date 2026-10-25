// ORTAK (core): GlitchTip istemci kurulumu; ErrorTracking.astro yalnız DSN varken dinamik import eder.
// Named import SDK'nın tree-shake edilmesini sağlar (namespace import replay/feedback dahil her şeyi paketler).
// KVKK: SDK v11 varsayılan olarak IP, çerez vb. kişisel veri göndermez.
import { init } from "@sentry/browser"

export function initErrorTracking(dsn: string): void {
  init({
    dsn,
    environment: "production",
    // Yalnız hata; performans olayları kotayı doldurmaz.
    tracesSampleRate: 0,
    // Tarayıcı eklentisi ve üçüncü taraf betik gürültüsü alınmaz.
    allowUrls: [window.location.origin],
  })
}
