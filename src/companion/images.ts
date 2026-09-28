/**
 * Image import for the Sidera Draw companion: decode whatever the iPad hands us (Photos, camera, Files, paste,
 * drag & drop — Safari decodes HEIC), then always RE-ENCODE through a canvas. That downscales (long edge ≤ 2048 px),
 * bakes in the EXIF orientation and drops every metadata block (EXIF / GPS / maker notes), so only pixels are sent.
 * Also a tiny IndexedDB store so inserted images survive a reload of the tab (sessionStorage is far too small).
 */
import { DRAW_LIMITS, type DrawImageMime } from '../shared/drawProtocol'

export const MAX_IMAGE_EDGE = 2048
/** transparent images stay PNG only below this size (otherwise WebP, which keeps alpha, or a flattened JPEG) */
const SMALL_PNG_BYTES = 1.5 * 1024 * 1024

export interface EncodedImage {
  mime: DrawImageMime
  /** standard base64, no data: prefix */
  data: string
  width: number
  height: number
  /** ready to draw */
  source: HTMLCanvasElement | HTMLImageElement
}

interface Decoded {
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
}

/**
 * <img> first: WebKit reliably applies the EXIF orientation to <img> (CSS `image-orientation: from-image`) and decodes
 * HEIC; createImageBitmap with `imageOrientation: 'from-image'` is the fallback (e.g. very large images whose <img>
 * decode is refused).
 */
async function decode(blob: Blob): Promise<Decoded> {
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    if (!img.naturalWidth || !img.naturalHeight) throw new Error('empty image')
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) }
  } catch (e) {
    URL.revokeObjectURL(url)
    if (typeof createImageBitmap !== 'function') throw e
    const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' })
    return { source: bmp, width: bmp.width, height: bmp.height, release: () => bmp.close() }
  }
}

const toBlob = (c: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> =>
  new Promise((resolve) => {
    try {
      c.toBlob(resolve, type, quality)
    } catch {
      resolve(null)
    }
  })

function hasTransparency(canvas: HTMLCanvasElement): boolean {
  // sample a small copy: fast even for a 2048 px image
  const s = document.createElement('canvas')
  const k = Math.min(1, 256 / Math.max(canvas.width, canvas.height))
  s.width = Math.max(1, Math.round(canvas.width * k))
  s.height = Math.max(1, Math.round(canvas.height * k))
  const ctx = s.getContext('2d', { willReadFrequently: true })
  if (!ctx) return false
  ctx.drawImage(canvas, 0, 0, s.width, s.height)
  try {
    const px = ctx.getImageData(0, 0, s.width, s.height).data
    for (let i = 3; i < px.length; i += 4) if (px[i] < 250) return true
  } catch {
    return false
  }
  return false
}

function draw(src: CanvasImageSource, w: number, h: number, background?: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('no canvas')
  if (background) {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, w, h)
  }
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, w, h)
  return c
}

export const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).slice(String(r.result).indexOf(',') + 1))
    r.onerror = () => reject(r.error ?? new Error('read failed'))
    r.readAsDataURL(blob)
  })

/** Decodes and re-encodes one image. Throws when it can't be read or can't be made small enough. */
export async function encodeImage(file: Blob): Promise<EncodedImage> {
  const d = await decode(file)
  try {
    const opaqueSource = /^image\/(jpeg|heic|heif)$/i.test(file.type)
    let edge = MAX_IMAGE_EDGE
    let quality = 0.85
    for (let attempt = 0; attempt < 5; attempt++) {
      const k = Math.min(1, edge / Math.max(d.width, d.height))
      const w = Math.max(1, Math.round(d.width * k))
      const h = Math.max(1, Math.round(d.height * k))
      const canvas = draw(d.source, w, h)
      const alpha = !opaqueSource && hasTransparency(canvas)
      let blob: Blob | null = null
      if (alpha) {
        const png = await toBlob(canvas, 'image/png')
        if (png && png.size <= SMALL_PNG_BYTES) blob = png
        else {
          const webp = await toBlob(canvas, 'image/webp', 0.9)
          blob = webp?.type === 'image/webp' ? webp : png && png.size <= DRAW_LIMITS.maxImageBytes ? png : null
        }
      }
      if (!blob) {
        // Safari can't encode WebP from a canvas (toBlob silently falls back to PNG): check the type we got
        const webp = alpha ? null : await toBlob(canvas, 'image/webp', quality)
        blob = webp?.type === 'image/webp' ? webp : await toBlob(alpha ? draw(canvas, w, h, '#ffffff') : canvas, 'image/jpeg', quality)
      }
      if (blob && blob.size <= DRAW_LIMITS.maxImageBytes && (blob.type === 'image/png' || blob.type === 'image/jpeg' || blob.type === 'image/webp')) {
        return { mime: blob.type, data: await blobToBase64(blob), width: w, height: h, source: canvas }
      }
      edge = Math.round(edge * 0.75)
      quality = Math.max(0.6, quality - 0.08)
    }
    throw new Error('image too large')
  } finally {
    d.release()
  }
}

/** Turns stored base64 back into something drawable. */
export async function imageFromBase64(mime: string, data: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.src = `data:${mime};base64,${data}`
  await img.decode()
  return img
}

// ─── IndexedDB persistence ──────────────────────────────────────────────────────────────────────────

interface Row {
  key: string
  session: string
  mime: DrawImageMime
  data: string
  t: number
}

const DB_NAME = 'sidera-draw'
const STORE = 'images'
/** rows of other (long finished) sessions are dropped after this */
const MAX_AGE_MS = 24 * 60 * 60 * 1000

let dbPromise: Promise<IDBDatabase | null> | null = null
function db(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' })
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return db().then(
    (d) =>
      new Promise<T | undefined>((resolve, reject) => {
        if (!d) return reject(new Error('no indexeddb'))
        const tx = d.transaction(STORE, mode)
        const req = fn(tx.objectStore(STORE))
        tx.oncomplete = () => resolve(req ? req.result : undefined)
        tx.onerror = () => reject(tx.error ?? new Error('indexeddb error'))
        tx.onabort = () => reject(tx.error ?? new Error('indexeddb abort'))
      })
  )
}

export const imageStore = {
  /** Resolves false when the image could not be stored (quota, private mode, no IndexedDB) — never throws. */
  async put(session: string, id: string, mime: DrawImageMime, data: string): Promise<boolean> {
    try {
      await run('readwrite', (s) => s.put({ key: `${session}/${id}`, session, mime, data, t: Date.now() } satisfies Row))
      return true
    } catch {
      return false
    }
  },
  async get(session: string, id: string): Promise<{ mime: DrawImageMime; data: string } | null> {
    try {
      const row = (await run<Row>('readonly', (s) => s.get(`${session}/${id}`) as IDBRequest<Row>)) ?? null
      return row ? { mime: row.mime, data: row.data } : null
    } catch {
      return null
    }
  },
  /** Deletes this session's rows (after sending) and anything older than a day. */
  async prune(session: string, all = false): Promise<void> {
    try {
      const cutoff = Date.now() - MAX_AGE_MS
      await run('readwrite', (s) => {
        const cur = s.openCursor()
        cur.onsuccess = () => {
          const c = cur.result
          if (!c) return
          const row = c.value as Row
          if (row.t < cutoff || (all && row.session === session)) c.delete()
          c.continue()
        }
      })
    } catch {
      /* best effort */
    }
  }
}
