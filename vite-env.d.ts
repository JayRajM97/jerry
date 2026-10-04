/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional Turso cloud-sync URL. Unset = LocalStorage-only mode. */
  readonly VITE_TURSO_URL?: string;
  /** Optional Turso auth token. Unset = LocalStorage-only mode. */
  readonly VITE_TURSO_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
