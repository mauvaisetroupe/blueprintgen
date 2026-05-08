/// <reference types="vite/client" />

declare const __GIT_COMMIT__: string
declare const __BUILD_TIME__: string

interface AppConfig {
  appName: string
  logoPath: string | null
  homeUrl: string | null
}

interface Window {
  __APP_CONFIG__?: AppConfig
}
