import { GitCompareArrows, X } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/shared/ui/button'
import { COMPARE_LIMIT, compareUrl, useCompareSelection } from './model'

export function CompareSelectionBar() {
  const selection = useCompareSelection()
  if (selection.items.length === 0) return null
  const enough = selection.items.length >= 2

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-30 flex justify-center px-4">
      <div className="glass pointer-events-auto flex w-full max-w-4xl items-center gap-3 rounded-[18px] py-2 pr-2 pl-4">
        <div className="shrink-0 text-[12.5px] leading-tight text-ink-3">
          Сравнение
          <div className="num text-[14px] font-semibold text-ink">
            {selection.items.length} <span className="font-normal text-ink-4">из {COMPARE_LIMIT}</span>
          </div>
        </div>
        <div className="h-8 w-px shrink-0 bg-line" />
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {selection.items.map((item) => (
            <span
              key={item.id}
              className="inline-flex max-w-56 items-center gap-1 rounded-lg bg-black/5 py-1 pr-1 pl-2.5 text-[12.5px] text-ink-2"
            >
              <Link to={`/catalog/${item.id}`} className="truncate hover:text-ink" title={item.name}>
                {item.name}
              </Link>
              <button
                type="button"
                onClick={() => selection.remove(item.id)}
                className="rounded-md p-0.5 text-ink-3 transition-colors hover:bg-black/8 hover:text-ink"
                aria-label={`Убрать «${item.name}» из сравнения`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
        <Button variant="ghost" size="sm" className="rounded-lg text-ink-3" onClick={() => selection.clear()}>
          Очистить
        </Button>
        {enough ? (
          <Button asChild className="rounded-[12px]">
            <Link to={compareUrl(selection.ids)}>
              <GitCompareArrows /> Сравнить
            </Link>
          </Button>
        ) : (
          <Button className="rounded-[12px]" disabled title="Выберите ещё хотя бы одно решение">
            <GitCompareArrows /> Сравнить
          </Button>
        )}
      </div>
    </div>
  )
}
