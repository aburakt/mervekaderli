// ORTAK (core): template'ten gelir, sitede elle değiştirilmez (bun run core:sync).
// WebMCP bildirimsel API öznitelikleri (https://github.com/webmachinelearning/webmcp, declarative-api-explainer.md):
// <form toolname tooldescription [toolautosubmit]>, alanlarda toolparamdescription. Rehber docs/geo-webmcp.md.
declare namespace astroHTML.JSX {
  interface FormHTMLAttributes {
    toolname?: string
    tooldescription?: string
    toolautosubmit?: boolean
  }
  interface HTMLAttributes {
    toolparamdescription?: string
  }
}
