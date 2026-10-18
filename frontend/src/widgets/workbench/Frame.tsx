import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { PROJECT_STEPS, stepIndex } from '@/entities/project'
import { cn } from '@/shared/lib/utils'
import { useMediaQuery } from '@/shared/lib/media'
import { Button } from '@/shared/ui/button'
import type { Panels } from './Workbench'

// Полуширина плашки шагов с зазором: края строки заголовка заканчиваются там, где начинается плашка.
const DOCK_GAP_PX = 12
const DOCK_FALLBACK_HALF_PX = 470

function useDockHalf() {
  const [half, setHalf] = useState(DOCK_FALLBACK_HALF_PX)
  useEffect(() => {
    const dock = document.querySelector<HTMLElement>('nav[aria-label="Шаги оценки"]')
    if (!dock) return
    const measure = () => setHalf(Math.ceil(dock.getBoundingClientRect().width / 2) + DOCK_GAP_PX)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(dock)
    return () => observer.disconnect()
  }, [])
  return half
}

const pad = (n: number) => String(n).padStart(2, '0')

/* Экран шага на всё окно под шапкой: плашка шагов плавает поверх середины верхней строки, по краям — переходы,
   шаг, заголовок и действия. Портал — потому что у контейнера страницы есть анимация с transform, а внутри неё
   position: fixed отсчитывается не от окна. В режиме inFlow рамка того же размера стоит в потоке страницы, и под
   ней можно дочитать продолжение прокруткой. */
export function WorkbenchFrame({
  projectId,
  step,
  title,
  titleHint,
  eyebrow,
  actions,
  inFlow = false,
  navigation,
  className,
  children,
}: {
  projectId: string
  step: string
  title: ReactNode
  titleHint?: string
  eyebrow?: ReactNode
  actions?: ReactNode
  inFlow?: boolean
  navigation?: {
    index: number
    total: number
    previous?: { label: string; to: string }
    next?: { label: string; to: string }
  }
  className?: string
  children: ReactNode
}) {
  const dockHalf = useDockHalf()
  const mobile = useMediaQuery('(max-width: 1023px)')
  const idx = navigation?.index ?? stepIndex(step)
  const total = navigation?.total ?? PROJECT_STEPS.length
  const mainPrevious = PROJECT_STEPS[idx - 1]
  const mainNext = PROJECT_STEPS[idx + 1]
  const prev = navigation
    ? navigation.previous
    : mainPrevious
      ? { label: mainPrevious.label, to: `/projects/${projectId}/${mainPrevious.id}` }
      : undefined
  const next = navigation
    ? navigation.next
    : mainNext
      ? { label: mainNext.label, to: `/projects/${projectId}/${mainNext.id}` }
      : undefined
  const frame = (
    <div
      data-slot="workbench-frame"
      className={cn(
        'flex flex-col bg-card',
        mobile
          ? '-mx-4 -mt-5 min-h-[calc(100svh-7.625rem)] border-b border-line sm:-mx-6'
          : inFlow
            ? // Под шапкой, поверх распорки плашки шагов (66 px) и верхнего отступа страницы проекта (20 px).
              '-mx-6 -mt-[5.375rem] h-[calc(100dvh-3.5rem)] shrink-0 border-b border-line'
            : 'fixed inset-x-0 top-14 bottom-0 z-20',
        className,
      )}
      style={{ '--dock-half': `${dockHalf}px` } as CSSProperties}
    >
      <div className="flex min-h-[4.125rem] shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2 px-2 py-2 lg:h-[4.125rem] lg:flex-nowrap lg:py-0">
        <div
          className={cn(
            'flex min-w-0 items-center gap-1.5 max-lg:flex-1 lg:max-w-[calc(50%-var(--dock-half))]',
            eyebrow && 'max-xl:max-w-[calc(100%-3rem)]',
          )}
        >
          {prev && (
            <Button variant="ghost" size="icon-sm" asChild title={`Назад: ${prev.label}`}>
              <Link to={prev.to} aria-label={`Назад: ${prev.label}`}>
                <ArrowLeft />
              </Link>
            </Button>
          )}
          <div className="min-w-0">
            {eyebrow ?? (
              <div className="hud flex items-center gap-1.5">
                <span className="size-1.5 shrink-0 rounded-full bg-signal" aria-hidden />
                Шаг {pad(idx + 1)} / {pad(total)}
              </div>
            )}
            <h1 className="truncate text-[14px] font-semibold tracking-[-0.01em]" title={titleHint}>
              {title}
            </h1>
          </div>
        </div>
        <div
          className={cn(
            'flex min-w-0 items-center gap-1.5 lg:max-w-[calc(50%-var(--dock-half))]',
            actions && 'max-lg:basis-full',
            eyebrow && 'max-xl:max-w-none',
          )}
        >
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{actions}</div>
          {next && (
            <Button variant="ghost" size="icon-sm" asChild title={`Далее: ${next.label}`}>
              <Link to={next.to} aria-label={`Далее: ${next.label}`}>
                <ArrowRight />
              </Link>
            </Button>
          )}
        </div>
      </div>
      {children}
    </div>
  )
  return inFlow || mobile ? frame : createPortal(frame, document.body)
}

/* Сетка как в IDE: боковые панели на всю высоту, центр, нижняя панель под центром, строка состояния под всем.
   Панели сворачиваются плавным изменением ширины колонок. */
export function WorkbenchGrid({
  panels,
  leftWidth,
  rightWidth,
  left,
  center,
  right,
  bottom,
  status,
}: {
  panels: Panels
  leftWidth: number
  rightWidth: number
  left: ReactNode
  center: ReactNode
  right: ReactNode
  bottom?: ReactNode
  status: ReactNode
}) {
  const mobile = useMediaQuery('(max-width: 1023px)')
  return (
    <div
      style={
        {
          '--cols': `${panels.left ? `${leftWidth}px` : '0px'} minmax(0,1fr) ${panels.right ? `${rightWidth}px` : '0px'}`,
          '--left-w': `${leftWidth}px`,
          '--right-w': `${rightWidth}px`,
        } as CSSProperties
      }
      className="grid min-h-0 flex-1 grid-cols-1 auto-rows-max transition-[grid-template-columns] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:auto-rows-auto lg:grid-cols-(--cols) lg:grid-rows-[minmax(0,1fr)_auto_auto] lg:overflow-hidden"
    >
      <aside
        className={cn(
          'order-3 min-h-0 min-w-0 overflow-hidden bg-surface-2 lg:order-none lg:row-span-2',
          panels.left && 'lg:border-r lg:border-line',
        )}
      >
        <div className="scroll-thin flex flex-col lg:h-full lg:w-(--left-w) lg:overflow-y-auto">{left}</div>
      </aside>
      <main className="relative order-1 h-[clamp(18rem,48svh,30rem)] min-h-0 min-w-0 sm:h-[60svh] lg:order-none lg:h-auto">
        {center}
      </main>
      <aside
        className={cn(
          'order-4 min-h-0 min-w-0 overflow-hidden bg-surface-2 lg:order-none lg:col-start-3 lg:row-span-2 lg:row-start-1',
          panels.right && 'lg:border-l lg:border-line',
        )}
      >
        <div className="scroll-thin flex flex-col lg:h-full lg:w-(--right-w) lg:overflow-y-auto">{right}</div>
      </aside>
      {(panels.bottom || mobile) && bottom && (
        <section className="order-2 min-w-0 border-t border-line bg-card lg:order-none lg:col-start-2 lg:row-start-2">
          {bottom}
        </section>
      )}
      {status}
    </div>
  )
}
