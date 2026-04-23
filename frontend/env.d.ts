/// <reference types="vite/client" />

interface AppConfig {
  appName: string
  logoPath: string | null
  homeUrl: string | null
}

interface Window {
  __APP_CONFIG__: AppConfig
}
