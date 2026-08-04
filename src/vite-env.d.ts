/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PEER_HOST?: string
  readonly VITE_PEER_PORT?: string
  readonly VITE_PEER_PATH?: string
  readonly VITE_PEER_KEY?: string
  readonly VITE_PEER_SECURE?: string
  readonly VITE_ICE_SERVERS?: string
  readonly VITE_MQTT_BROKER?: string
  readonly VITE_MQTT_TOPIC?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
