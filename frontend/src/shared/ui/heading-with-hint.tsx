import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { InfoHint } from './info-hint'

export function HeadingWithHint({ text, title, children }: { text: string; title: string; children: ReactNode }) {
  const containerRef = useRef<HTMLSpanElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const hintRef = useRef<HTMLSpanElement>(null)
  const [left, setLeft] = useState<number>()

  useLayoutEffect(() => {
    const container = containerRef.current
    const textElement = textRef.current
    const hint = hintRef.current
    if (!container || !textElement || !hint) return

    const positionHint = () => {
      const range = document.createRange()
      range.selectNodeContents(textElement)
      const firstLine = range.getClientRects()[0]
      if (!firstLine) return
      const bounds = container.getBoundingClientRect()
      setLeft(Math.max(0, Math.min(firstLine.right - bounds.left + 4, bounds.width - hint.offsetWidth)))
    }

    positionHint()
    const observer = new ResizeObserver(positionHint)
    observer.observe(textElement)
    let active = true
    void document.fonts.ready.then(() => {
      if (active) positionHint()
    })
    return () => {
      active = false
      observer.disconnect()
    }
  }, [text])

  return (
    <span ref={containerRef} className="relative block">
      <span ref={textRef} className="block pr-11 sm:pr-8">
        {text}
      </span>
      <span
        ref={hintRef}
        className="absolute top-0 inline-flex -translate-y-0.5 max-sm:-translate-y-1.5"
        style={{ left, right: left === undefined ? 0 : undefined }}
      >
        <InfoHint title={title} showCloseButton={false}>
          {children}
        </InfoHint>
      </span>
    </span>
  )
}
