import { useLayoutEffect, useRef, useState } from 'react'
import { motion, type Transition } from 'framer-motion'
import { cn } from '@/shared/lib/utils'

const SPRING: Transition = { type: 'spring', stiffness: 500, damping: 40 }

type Box = { x: number; y: number; w: number; h: number }

/* Место подсветки внутри активного пункта: невидимый блок, чью геометрию повторяет SlideHighlight. */
export function SlideMark({ className = 'absolute inset-0' }: { className?: string }) {
  return <span data-slide-mark aria-hidden className={cn('pointer-events-none invisible', className)} />
}

/* Подсветка, которая переезжает к SlideMark активного пункта. Ставится первым ребёнком позиционированного
   контейнера. Координаты считаются относительно контейнера, а не страницы: общий layoutId framer брал позицию
   до смены прокрутки, и при смене вкладки с другой высотой контента подсветка прилетала сверху или снизу. */
export function SlideHighlight({ className, transition = SPRING }: { className?: string; transition?: Transition }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [box, setBox] = useState<Box | null>(null)

  useLayoutEffect(() => {
    const root = ref.current?.parentElement
    if (!root) return
    root.setAttribute('data-slide-root', '')
    const measure = () => {
      const mark = [...root.querySelectorAll<HTMLElement>('[data-slide-mark]')].find(
        (m) => m.closest('[data-slide-root]') === root,
      )
      if (!mark) return setBox(null)
      // Layout-смещения, а не getBoundingClientRect: их не искажают transform-анимации предков (zoom диалога).
      let x = 0
      let y = 0
      let node: HTMLElement | null = mark
      while (node && node !== root) {
        x += node.offsetLeft
        y += node.offsetTop
        node = node.offsetParent as HTMLElement | null
      }
      if (node !== root) return
      const next = { x, y, w: mark.offsetWidth, h: mark.offsetHeight }
      setBox((prev) =>
        prev && prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h ? prev : next,
      )
    }
    measure()
    const resize = new ResizeObserver(measure)
    resize.observe(root)
    const mutations = new MutationObserver(measure)
    mutations.observe(root, { subtree: true, childList: true, characterData: true })
    return () => {
      resize.disconnect()
      mutations.disconnect()
    }
  }, [])

  return (
    <span ref={ref} aria-hidden className="pointer-events-none absolute top-0 left-0">
      {box && (
        <motion.span
          className={cn('absolute top-0 left-0 block', className)}
          initial={false}
          animate={{ x: box.x, y: box.y, width: box.w, height: box.h }}
          transition={transition}
        />
      )}
    </span>
  )
}
