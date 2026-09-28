// Custom protocol used to serve imported files (avatars, PDFs, images) to the renderer.
export const FILE_PROTOCOL = 'sidera-file'
// Scheme from before the CanvasCL → Sidera rename. Existing cards/whiteboards can have this scheme
// baked into their stored Tiptap JSON (e.g. image `src`), so it must keep resolving — new URLs are
// always generated with FILE_PROTOCOL. Referenced only where that legacy content is served.
export const LEGACY_FILE_PROTOCOL = 'canvascl-file'

export const fileUrl = (id: string): string => `${FILE_PROTOCOL}://files/${encodeURIComponent(id)}`
