import { Link, useRouteError } from 'react-router'
import { Button } from '@/shared/ui/button'

// Any render error lands here instead of the router's English stack trace; the header stays usable.
export function RouteError() {
  const error = useRouteError()
  const detail = error instanceof Error ? error.message : null
  return (
    <div className="mx-auto flex max-w-140 flex-1 flex-col items-center justify-center gap-4 px-6 py-20 text-center">
      <h1 className="h2">Экран не открылся</h1>
      <p className="text-[14px] leading-relaxed text-ink-2">
        Произошла ошибка в интерфейсе. Данные проекта не пострадали: обновите страницу или вернитесь к списку проектов.
      </p>
      {detail && <p className="meta max-w-full truncate">Техническая причина: {detail}</p>}
      <div className="flex gap-2">
        <Button onClick={() => window.location.reload()}>Обновить страницу</Button>
        <Button variant="outline" asChild>
          <Link to="/projects">К проектам</Link>
        </Button>
      </div>
    </div>
  )
}
