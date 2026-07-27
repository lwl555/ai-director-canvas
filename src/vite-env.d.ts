/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON?: string
  readonly VITE_AGNES_BASE?: string
  readonly VITE_MODEL_PROXY_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
