import { GitCompareArrows, X } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/shared/ui/button'
import { COMPARE_LIMIT, compareUrl, useCompareSelection } from './model'

export function CompareSelectionBar() {
  const selection = useCompareSelection()
  if (selection.items.length === 0) return null
  const enough = selection.items.length >= 2

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
      <div className="pointer-events-auto flex w-full max-w-5xl items-center gap-3 rounded-xl border bg-card/95 px-4 py-2.5 shadow-lg backdrop-blur">
        <div className="shrink-0 text-xs text-muted-foreground">
          Сравнение
          <div className="num font-medium text-foreground">
            {selection.items.length} из {COMPARE_LIMIT}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {selection.items.map((item) => (
            <span
              key={item.id}
              className="inline-flex max-w-56 items-center gap-1 rounded-full border bg-secondary py-0.5 pr-1 pl-2.5 text-xs"
            >
              <Link to={`/catalog/${item.id}`} className="truncate hover:underline" title={item.name}>
                {item.name}
              </Link>
              <button
                type="button"
                onClick={() => selection.remove(item.id)}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={`Убрать «${item.name}» из сравнения`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={() => selection.clear()}>
          Очистить
        </Button>
        {enough ? (
          <Button asChild size="sm">
            <Link to={compareUrl(selection.ids)}>
              <GitCompareArrows /> Сравнить ({selection.items.length})
            </Link>
          </Button>
        ) : (
          <Button size="sm" disabled title="Выберите ещё хотя бы одно решение">
            <GitCompareArrows /> Сравнить ({selection.items.length})
          </Button>
        )}
      </div>
    </div>
  )
}
