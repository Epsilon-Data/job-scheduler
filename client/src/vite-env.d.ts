/// <reference types="vite/client" />

interface ImportMetaEnv {
  // API Configuration
  readonly VITE_ZKP_SERVICE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
