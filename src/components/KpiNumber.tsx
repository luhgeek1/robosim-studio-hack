import { useEffect, useRef, useState } from 'react'
import { animate } from 'framer-motion'

/**
 * Number that glides between values. Used for every KPI so a change of
 * configuration reads as the system re-computing, not as a page reload.
 */
export function KpiNumber({
  value,
  digits = 0,
  duration = 0.7,
  className = '',
  prefix = '',
  suffix = '',
  format,
}: {
  value: number
  digits?: number
  duration?: number
  className?: string
  prefix?: string
  suffix?: string
  format?: (v: number) => string
}) {
  const [shown, setShown] = useState(value)
  const prev = useRef(value)
  useEffect(() => {
    const from = prev.current
    prev.current = value
    if (from === value) return
    const controls = animate(from, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setShown(v),
    })
    return () => controls.stop()
  }, [value, duration])
  const text = format
    ? format(shown)
    : shown.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  return (
    <span className={`num ${className}`}>
      {prefix}
      {text}
      {suffix}
    </span>
  )
}
