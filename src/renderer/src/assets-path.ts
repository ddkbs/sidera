// Must run before any Excalidraw module loads: self-hosted fonts (copied by scripts/copy-assets.cjs) instead of the CDN.
;(window as unknown as { EXCALIDRAW_ASSET_PATH: string }).EXCALIDRAW_ASSET_PATH = new URL('./excalidraw/', window.location.href).toString()
export {}
