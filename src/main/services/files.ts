// Storing imported files in the data folder's `files/` dir — shared by the file dialog / paste IPC handlers
// (session.ts) and MCP (`add_file`). Plain Node, no Electron.
import { copyFileSync, mkdirSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { nanoid } from 'nanoid'
import type { FileRecord } from '@shared/types'

/** Extensions importable from disk (file dialog, drag & drop, MCP path) → mime. */
export const IMPORT_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown',
  '.txt': 'text/plain'
}

/** Raw bytes (paste/drop of a clipboard image, MCP base64) accept the same mimes plus a few more image types. */
export const EXT_BY_MIME: Record<string, string> = {
  ...Object.fromEntries(Object.entries(IMPORT_MIME).map(([ext, mime]) => [mime, ext])),
  'image/bmp': '.bmp',
  'image/heic': '.heic',
  'image/heif': '.heif'
}
export const DATA_MIME_ALLOWLIST = new Set([...Object.values(IMPORT_MIME), 'image/bmp', 'image/heic', 'image/heif'])
export const MAX_IMPORT_BYTES = 25 * 1024 * 1024

type Register = (input: Omit<FileRecord, 'id' | 'createdAt'>) => FileRecord

/** Copy a file from disk into `filesDir` (only importable extensions, regular files up to 25 MB). */
export function storeFileFromPath(filesDir: string, path: string, register: Register): FileRecord {
  const ext = extname(path).toLowerCase()
  const mime = IMPORT_MIME[ext]
  if (!mime) throw new Error(`Unsupported file type: ${ext || basename(path)} (allowed: ${Object.keys(IMPORT_MIME).join(', ')})`)
  // a symlink named x.txt must not smuggle in another file type: the resolved target needs an importable extension too
  const real = realpathSync(path)
  if (!IMPORT_MIME[extname(real).toLowerCase()]) throw new Error(`Unsupported file type: ${basename(real)}`)
  const info = statSync(real)
  if (!info.isFile()) throw new Error(`Not a file: ${path}`)
  if (info.size > MAX_IMPORT_BYTES) throw new Error('File too large (max 25 MB)')
  mkdirSync(filesDir, { recursive: true })
  const dest = join(filesDir, nanoid() + ext)
  copyFileSync(real, dest)
  return register({ name: basename(path), mime, path: dest, size: info.size })
}

/** Write raw bytes into `filesDir` (allow-listed mimes, 25 MB) and register them. */
export function storeFileBytes(filesDir: string, input: { name?: string; mime: string; bytes: Buffer }, register: Register): FileRecord {
  const { mime, bytes } = input
  if (!DATA_MIME_ALLOWLIST.has(mime)) throw new Error(`Unsupported file type: ${mime}`)
  if (bytes.length > MAX_IMPORT_BYTES) throw new Error('File too large (max 25 MB)')
  const ext = extname(input.name || '').toLowerCase() || EXT_BY_MIME[mime] || ''
  mkdirSync(filesDir, { recursive: true })
  const dest = join(filesDir, nanoid() + ext)
  writeFileSync(dest, bytes)
  return register({ name: input.name?.trim() || `pasted${ext}`, mime, path: dest, size: bytes.length })
}

/** Does the content start like the declared type? (raster images and PDFs; text/SVG are not sniffed) */
export function contentMatchesMime(mime: string, bytes: Buffer): boolean {
  const starts = (...sig: number[]): boolean => sig.every((b, i) => bytes[i] === b)
  switch (mime) {
    case 'image/png':
      return starts(0x89, 0x50, 0x4e, 0x47)
    case 'image/jpeg':
      return starts(0xff, 0xd8, 0xff)
    case 'image/gif':
      return starts(0x47, 0x49, 0x46, 0x38)
    case 'image/webp':
      return starts(0x52, 0x49, 0x46, 0x46) && bytes.subarray(8, 12).toString('latin1') === 'WEBP'
    case 'image/bmp':
      return starts(0x42, 0x4d)
    case 'image/heic':
    case 'image/heif':
      return bytes.subarray(4, 8).toString('latin1') === 'ftyp'
    case 'application/pdf':
      return starts(0x25, 0x50, 0x44, 0x46)
    default:
      return true
  }
}
