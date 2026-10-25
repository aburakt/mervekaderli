/// <reference path="../.astro/types.d.ts" />
// ORTAK (core): template'ten gelir, sitede elle değiştirilmez (bun run core:sync).
interface ImportMetaEnv {
  readonly PB_URL?: string
  readonly PUBLIC_SITE_URL?: string
  readonly NOINDEX?: string
  readonly CONTENT_SOURCE?: string
  readonly PUBLIC_GLITCHTIP_DSN?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
