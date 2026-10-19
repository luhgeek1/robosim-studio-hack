import { GitCompareArrows, X } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/shared/ui/button'
import { COMPARE_LIMIT, compareUrl, useCompareSelection } from './model'

export function CompareSelectionBar() {
  const selection = useCompareSelection()
  if (selection.items.length === 0) return null
  const enough = selection.items.length >= 2

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 flex justify-center px-3 sm:bottom-5 sm:px-4">
      <div className="glass pointer-events-auto flex w-full max-w-4xl flex-wrap items-center gap-x-3 gap-y-2 rounded-[18px] py-2 pr-2 pl-4 sm:flex-nowrap">
        <div className="shrink-0 text-[12.5px] leading-tight text-ink-3">
          <span className="max-sm:sr-only">Сравнение</span>
          <div className="num text-[14px] font-semibold text-ink">
            {selection.items.length} <span className="font-normal text-ink-4">из {COMPARE_LIMIT}</span>
          </div>
        </div>
        <div className="hidden h-8 w-px shrink-0 bg-line sm:block" />
        {/* На телефоне выбранные решения уходят вниз одной прокручиваемой строкой, кнопки остаются рядом со счётчиком. */}
        <div className="order-last flex min-w-0 basis-full flex-wrap gap-1.5 max-lg:flex-nowrap max-lg:overflow-x-auto max-lg:[scrollbar-width:none] sm:order-none sm:flex-1 sm:basis-auto">
          {selection.items.map((item) => (
            <span
              key={item.id}
              className="inline-flex max-w-56 min-w-0 items-center gap-1 rounded-lg bg-black/5 py-1 pr-1 pl-2.5 text-[12.5px] text-ink-2 max-lg:max-w-none max-lg:shrink-0"
            >
              <Link
                to={`/catalog/${item.id}`}
                className="whitespace-nowrap hover:text-ink lg:truncate"
                title={item.name}
              >
                {item.name}
              </Link>
              <button
                type="button"
                onClick={() => selection.remove(item.id)}
                className="flex items-center justify-center rounded-md p-0.5 text-ink-3 transition-colors hover:bg-black/8 hover:text-ink max-sm:size-8 max-sm:shrink-0"
                aria-label={`Убрать «${item.name}» из сравнения`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="rounded-lg text-ink-3 max-sm:ml-auto"
          onClick={() => selection.clear()}
        >
          <X className="sm:hidden" />
          <span className="max-sm:sr-only">Очистить</span>
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
