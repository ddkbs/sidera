// Builds the Sidera Draw iPad companion (src/companion) into ONE self-contained HTML file: inline JS + CSS,
// no external requests. The main process imports it with `?raw` (bundled into out/main), so there is nothing
// extra to package. Output: out/companion/sidera-draw.html (generated, not committed).
import { build } from 'esbuild'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'src/companion')
const outFile = join(root, 'out/companion/sidera-draw.html')

const appName = /APP_NAME\s*=\s*'([^']+)'/.exec(readFileSync(join(root, 'src/shared/brand.ts'), 'utf8'))?.[1]
if (!appName) throw new Error('APP_NAME not found in src/shared/brand.ts')

const js = await build({
  entryPoints: [join(src, 'main.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  // iPadOS 16+ Safari
  target: ['safari16'],
  minify: true,
  legalComments: 'none',
  charset: 'utf8'
})
const css = await build({ entryPoints: [join(src, 'style.css')], bundle: true, write: false, minify: true, target: ['safari16'], loader: { '.css': 'css' } })

// never let bundled code terminate the inline <script>/<style> early
const script = js.outputFiles[0].text.trim().replace(/<\/script/gi, '<\\/script')
const style = css.outputFiles[0].text.trim().replace(/<\/style/gi, '<\\/style')

const html = readFileSync(join(src, 'index.html'), 'utf8')
  .replaceAll('{{APP_NAME}}', appName)
  .replace('<!--STYLE-->', () => `<style>${style}</style>`)
  .replace('<!--SCRIPT-->', () => `<script>${script}</script>`)

if (/\b(src|href)=["']?(https?:)?\/\//i.test(html)) throw new Error('companion must not reference external resources')

mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, html)
console.log(`companion → ${outFile.slice(root.length + 1)} (${(html.length / 1024).toFixed(1)} KB)`)
