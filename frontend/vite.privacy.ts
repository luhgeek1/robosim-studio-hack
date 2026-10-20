import type { Plugin, PreviewServer, ViteDevServer } from 'vite'

function mountPrivacyPage(server: ViteDevServer | PreviewServer) {
  server.middlewares.use((request, _response, next) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    if (url.pathname === '/privacy' || url.pathname === '/privacy/') {
      request.url = `/privacy/index.html${url.search}`
    }
    next()
  })
}

export function privacyPage(): Plugin {
  return {
    name: 'public-privacy-page',
    configureServer: mountPrivacyPage,
    configurePreviewServer: mountPrivacyPage,
  }
}
