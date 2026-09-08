/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OVERLAY_URL?: string
  readonly VITE_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
