import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

const fallback = `<noscript><iframe title="РобоМера — статичная версия" src="/design-lab/immersive/static.html" style="position:fixed;inset:0;width:100%;height:100%;border:0;background:#171d1e"></iframe></noscript>`

export function immersiveFallback(): Plugin {
  let outputDirectory = ''
  let building = false
  return {
    name: 'immersive-static-fallback',
    configResolved(config) {
      outputDirectory = resolve(config.root, config.build.outDir)
      building = config.command === 'build'
    },
    transformIndexHtml(html, context) {
      if (context.server && /^\/design-lab\/immersive\/?(?:\?|$)/.test(context.originalUrl ?? context.path)) {
        return html.replace('</body>', `${fallback}</body>`)
      }
    },
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!/^\/design-lab\/immersive(?:\?|$)/.test(request.url ?? '')) return next()
        response.statusCode = 302
        response.setHeader('Location', request.url!.replace('/immersive', '/immersive/'))
        response.end()
      })
    },
    async closeBundle() {
      if (!building) return
      const html = await readFile(resolve(outputDirectory, 'index.html'), 'utf8')
      const directory = resolve(outputDirectory, 'design-lab/immersive')
      await mkdir(directory, { recursive: true })
      await writeFile(resolve(directory, 'index.html'), html.replace('</body>', `${fallback}</body>`))
    },
  }
}
