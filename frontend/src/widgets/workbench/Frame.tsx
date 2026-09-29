import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { PROJECT_STEPS, stepIndex } from '@/entities/project'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import type { Panels } from './Workbench'

// Полуширина плашки шагов с зазором: края строки заголовка заканчиваются там, где начинается плашка.
const DOCK_GAP_PX = 12
const DOCK_FALLBACK_HALF_PX = 470
// Уже этой ширины по бокам от плашки заголовок и действия не помещаются — строка заголовка уходит под плашку.
const MIN_SIDE_PX = 160

function useDockHalf() {
  const [half, setHalf] = useState(DOCK_FALLBACK_HALF_PX)
  const [width, setWidth] = useState(() => window.innerWidth)
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    const dock = document.querySelector<HTMLElement>('nav[aria-label="Шаги оценки"]')
    if (!dock) return () => window.removeEventListener('resize', onResize)
    const measure = () => setHalf(Math.ceil(dock.getBoundingClientRect().width / 2) + DOCK_GAP_PX)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(dock)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', onResize)
    }
  }, [])
  return { half, stacked: width / 2 - half < MIN_SIDE_PX }
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
  actions,
  inFlow = false,
  children,
}: {
  projectId: string
  step: string
  title: ReactNode
  titleHint?: string
  actions?: ReactNode
  inFlow?: boolean
  children: ReactNode
}) {
  const { half: dockHalf, stacked } = useDockHalf()
  const idx = stepIndex(step)
  const prev = PROJECT_STEPS[idx - 1]
  const next = PROJECT_STEPS[idx + 1]
  const heading = (
    <>
      <div className="hud flex items-center gap-1.5 whitespace-nowrap">
        <span className="size-1.5 shrink-0 rounded-full bg-signal" aria-hidden />
        Шаг {pad(idx + 1)} / {pad(PROJECT_STEPS.length)}
      </div>
      <h1 className="truncate text-[14px] font-semibold tracking-[-0.01em]" title={titleHint}>
        {title}
      </h1>
    </>
  )
  const frame = (
    <div
      className={cn(
        'flex flex-col bg-card',
        inFlow
          ? // Под шапкой, поверх распорки плашки шагов (66 px) и верхнего отступа страницы проекта (20 px).
            // На узком экране панели идут столбиком, и рамка растёт по содержимому: прокрутка — одна, у страницы.
            '-mx-4 -mt-[5.375rem] sm:-mx-6 lg:h-[calc(100dvh-3.5rem)] shrink-0 border-b border-line'
          : 'fixed inset-x-0 top-14 bottom-0 z-20',
      )}
      style={{ '--dock-half': `${dockHalf}px` } as CSSProperties}
    >
      {stacked ? (
        <>
          {/* Плашка шагов на узком экране занимает всю ширину: под ней пустая полоса, заголовок — строкой ниже. */}
          <div className="h-[4.125rem] shrink-0 border-b border-line bg-surface-2" aria-hidden />
          <div className="flex min-h-13 shrink-0 items-center gap-1 border-b border-line bg-surface-2 px-1.5 py-1.5">
            {prev && (
              <Button variant="ghost" size="icon-sm" className="size-9" asChild title={`Назад: ${prev.label}`}>
                <Link to={`/projects/${projectId}/${prev.id}`} aria-label={`Назад: ${prev.label}`}>
                  <ArrowLeft />
                </Link>
              </Button>
            )}
            <div className="min-w-0 flex-1 px-0.5">{heading}</div>
            {actions && <div className="flex max-w-[48%] min-w-0 items-center gap-1.5">{actions}</div>}
            {next && (
              <Button variant="ghost" size="icon-sm" className="size-9" asChild title={`Далее: ${next.label}`}>
                <Link to={`/projects/${projectId}/${next.id}`} aria-label={`Далее: ${next.label}`}>
                  <ArrowRight />
                </Link>
              </Button>
            )}
          </div>
        </>
      ) : (
        <div className="flex h-[4.125rem] shrink-0 items-center justify-between gap-3 border-b border-line bg-surface-2 px-2">
          <div className="flex max-w-[calc(50%-var(--dock-half))] min-w-0 items-center gap-1.5">
            {prev && (
              <Button variant="ghost" size="icon-sm" asChild title={`Назад: ${prev.label}`}>
                <Link to={`/projects/${projectId}/${prev.id}`} aria-label={`Назад: ${prev.label}`}>
                  <ArrowLeft />
                </Link>
              </Button>
            )}
            <div className="min-w-0">{heading}</div>
          </div>
          <div className="flex max-w-[calc(50%-var(--dock-half))] min-w-0 items-center gap-1.5">
            <div className="flex min-w-0 items-center gap-1.5">{actions}</div>
            {next && (
              <Button variant="ghost" size="icon-sm" asChild title={`Далее: ${next.label}`}>
                <Link to={`/projects/${projectId}/${next.id}`} aria-label={`Далее: ${next.label}`}>
                  <ArrowRight />
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}
      {children}
    </div>
  )
  return inFlow ? frame : createPortal(frame, document.body)
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
  return (
    <div
      style={
        {
          '--cols': `${panels.left ? `${leftWidth}px` : '0px'} minmax(0,1fr) ${panels.right ? `${rightWidth}px` : '0px'}`,
          '--left-w': `${leftWidth}px`,
          '--right-w': `${rightWidth}px`,
        } as CSSProperties
      }
      // Ниже lg панели идут столбиком: сцена, под ней её управление (нижняя панель), затем левая и правая панели во
      // всю высоту содержимого (на планшете — рядом), строка состояния прилипает к низу.
      className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-2 transition-[grid-template-columns] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:grid-cols-(--cols) lg:grid-rows-[minmax(0,1fr)_auto_auto] lg:overflow-hidden"
    >
      <aside
        className={cn(
          'order-3 min-w-0 border-t border-line bg-surface-2 md:max-lg:border-r lg:order-none lg:row-span-2 lg:min-h-0 lg:overflow-hidden lg:border-t-0',
          panels.left && 'lg:border-r lg:border-line',
        )}
      >
        <div className="scroll-thin flex flex-col lg:h-full lg:w-(--left-w) lg:overflow-y-auto">{left}</div>
      </aside>
      <main className="relative order-1 h-[55dvh] min-h-72 min-w-0 md:max-lg:col-span-2 lg:order-none lg:h-auto lg:min-h-0">
        {center}
      </main>
      <aside
        className={cn(
          'order-4 min-w-0 border-t border-line bg-surface-2 lg:order-none lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:min-h-0 lg:overflow-hidden lg:border-t-0',
          panels.right && 'lg:border-l lg:border-line',
        )}
      >
        <div className="scroll-thin flex flex-col lg:h-full lg:w-(--right-w) lg:overflow-y-auto">{right}</div>
      </aside>
      {panels.bottom && bottom && (
        <section className="order-2 min-w-0 border-t border-line bg-card md:max-lg:col-span-2 lg:order-none lg:col-start-2 lg:row-start-2">
          {bottom}
        </section>
      )}
      {status}
    </div>
  )
}
