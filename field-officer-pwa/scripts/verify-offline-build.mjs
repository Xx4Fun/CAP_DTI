import { readFile } from 'node:fs/promises'

const serviceWorker = await readFile(new URL('../dist/sw.js', import.meta.url), 'utf8')
const required = [
  ['navigation fallback', /createHandlerBoundToURL\("\/index\.html"\)/],
  ['pre-cached app shell', /url:"index\.html"/],
  ['pre-cached local font', /url:"[^"]+\.woff2"/],
]

for (const [name, pattern] of required) {
  if (!pattern.test(serviceWorker)) throw new Error(`Offline build is missing ${name}.`)
}
