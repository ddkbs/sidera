import { pdfjs } from 'react-pdf'

// The renderer CSP only allows local sources: the worker is bundled by Vite, never fetched from a CDN.
pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

export { pdfjs }
