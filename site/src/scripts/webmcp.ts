// ORTAK (core): template'ten gelir, sitede elle değiştirilmez (bun run core:sync). Rehber docs/geo-webmcp.md.
// WebMCP: tarayıcı API'yi sunuyorsa (document.modelContext ya da erken Chrome'da navigator.modelContext) siteyi okuyan
// araçları kaydeder. API yoksa hiçbir şey yapmaz (veri bile indirilmez). Hata konsola düşmez. Paketlenmiş dış betik,
// veri aynı kökenden (/webmcp.json): CSP script-src/connect-src 'self' yeter.
import { modelContextOf, registerTools, WEBMCP_DATA_PATH, type WebmcpData, webmcpTools } from "../lib/webmcp"

const mc = modelContextOf(document, navigator)
if (mc) {
  fetch(WEBMCP_DATA_PATH, { credentials: "omit" })
    .then((res) => (res.ok ? (res.json() as Promise<WebmcpData>) : undefined))
    .then((data) => (data ? registerTools(mc, webmcpTools(data)) : undefined))
    .catch(() => undefined)
}
