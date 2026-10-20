import { build } from 'esbuild'
import { copyFile, mkdir } from 'node:fs/promises'
const runtime = '../../public/design-lab/system'
await mkdir(`${runtime}/assets/licenses`, { recursive: true })
await build({
  entryPoints: ['src/app.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  outfile: `${runtime}/assets/app.js`,
  legalComments: 'eof',
})
await copyFile('src/styles.css', `${runtime}/assets/landing.css`)
await copyFile('index.html', `${runtime}/index.html`)
await copyFile('node_modules/three/LICENSE', `${runtime}/assets/licenses/Three-MIT.txt`)
console.log('Built the standalone platform landing with local assets.')
