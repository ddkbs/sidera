// Writes build/THIRD_PARTY_NOTICES.txt: name, version, license and license text of every npm package that ends up in
// the app — runtime `dependencies` plus every package imported from src/ (bundled by Vite), with their transitive
// dependencies. Shipped inside the app (extraResources) because MIT/BSD/ISC require the notice to travel with copies.
const { readFileSync, readdirSync, writeFileSync, existsSync, statSync } = require('node:fs')
const { join, dirname } = require('node:path')

const root = join(__dirname, '..')
const pkg = require(join(root, 'package.json'))

/** Package names imported anywhere in src/ ('react', '@tiptap/core', …; relative and alias imports skipped). */
function importedPackages() {
  const names = new Set()
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.(ts|tsx|js|mjs|cjs|css)$/.test(e)) {
        const src = readFileSync(p, 'utf8')
        for (const m of src.matchAll(/(?:from|import|require\(|@import)\s*['"]([^'"./@~][^'"]*|@[^'"/]+\/[^'"]+)['"]/g)) {
          const spec = m[1]
          if (spec.startsWith('@/') || spec.startsWith('@shared') || spec.startsWith('node:')) continue
          const parts = spec.split('/')
          names.add(spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0])
        }
      }
    }
  }
  walk(join(root, 'src'))
  return names
}

/** Resolve a package dir the way Node does, starting from `from` (a package dir). */
function resolveDir(name, from) {
  let dir = from
  for (;;) {
    const candidate = join(dir, 'node_modules', name)
    if (existsSync(join(candidate, 'package.json'))) return candidate
    const up = dirname(dir)
    if (up === dir) return null
    dir = up
  }
}

const LICENSE_FILE = /^(licen[sc]e|copying|notice)(\.|$|-)/i
const seen = new Map() // dir → entry

function visit(name, from) {
  const dir = resolveDir(name, from)
  if (!dir || seen.has(dir)) return
  const meta = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const files = readdirSync(dir).filter((f) => LICENSE_FILE.test(f))
  const text = files.map((f) => readFileSync(join(dir, f), 'utf8').trim()).join('\n\n')
  const license = typeof meta.license === 'string' ? meta.license : meta.license?.type ?? (meta.licenses ?? []).map((l) => l.type).join(' OR ')
  seen.set(dir, { name: meta.name ?? name, version: meta.version, license: license || 'UNKNOWN', text })
  for (const dep of Object.keys({ ...meta.dependencies, ...meta.optionalDependencies })) visit(dep, dir)
}

const builtins = new Set(require('node:module').builtinModules)
const direct = new Set([...Object.keys(pkg.dependencies ?? {}), ...importedPackages()].filter((n) => !builtins.has(n) && n !== 'electron'))
for (const name of direct) visit(name, root)

const entries = [...seen.values()].filter((e) => e.name !== pkg.name).sort((a, b) => a.name.localeCompare(b.name) || String(a.version).localeCompare(String(b.version)))
const sep = '\n\n' + '-'.repeat(80) + '\n\n'
const header =
  `${pkg.productName} includes the following third-party open-source software.\n` +
  `Each package is listed with its version, license and the license text it ships with.\n`
const body = entries.map((e) => `${e.name}@${e.version} — ${e.license}\n\n${e.text || '(no license file shipped in the package; see the license field above)'}`).join(sep)
writeFileSync(join(root, 'build', 'THIRD_PARTY_NOTICES.txt'), header + sep + body + '\n')
console.log(`third-party notices: ${entries.length} packages → build/THIRD_PARTY_NOTICES.txt`)
