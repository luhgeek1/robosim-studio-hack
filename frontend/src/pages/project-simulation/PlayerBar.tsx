import { Pause, Play, RotateCcw } from 'lucide-react'
import { useEffect } from 'react'
import { SPEEDS, usePlayback } from '@/entities/simulation'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/utils'
import { Segmented } from '@/shared/ui/v0'

export const clock = (seconds: number) => {
  const m = Math.floor(seconds / 60)
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

// One animation loop advances the shared clock; the 2D plan, the 3D twin and the KPI panel only read it.
export function usePlaybackDriver() {
  const tick = usePlayback((s) => s.tick)
  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const loop = (now: number) => {
      tick(Math.min(0.1, (now - last) / 1000))
      last = now
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [tick])
}

// ТЗ 3.6.3: старт, стоп, перезапуск, скорость воспроизведения — первая строка нижней панели, под картой.
export function PlayerBar({ disabled = false }: { disabled?: boolean }) {
  const playing = usePlayback((s) => s.playing)
  const speed = usePlayback((s) => s.speed)
  const total = usePlayback((s) => s.total)
  const t = usePlayback((s) => Math.floor(s.t / 20) * 20)
  const { setPlaying, setSpeed, setT } = usePlayback.getState()
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2', disabled && 'pointer-events-none opacity-45')}>
      <Button
        size="icon-sm"
        className="rounded-full max-lg:size-9"
        onClick={() => setPlaying(!playing)}
        aria-label={playing ? 'Пауза' : 'Запустить'}
      >
        {playing ? <Pause /> : <Play />}
      </Button>
      <Button variant="ghost" size="icon-sm" className="max-lg:size-9" onClick={() => setT(0)} aria-label="С начала">
        <RotateCcw />
      </Button>
      <input
        type="range"
        min={0}
        max={Math.max(1, total)}
        step={1}
        value={t}
        onChange={(e) => setT(Number(e.target.value))}
        className="h-1 min-w-24 flex-1 cursor-pointer accent-ink max-lg:h-6"
        aria-label="Время имитации"
      />
      <span className="num w-23 shrink-0 text-center font-mono text-[12px] text-ink-2 max-sm:w-auto">
        {clock(t)} / {clock(total)}
      </span>
      <Segmented
        size="sm"
        value={speed}
        onChange={setSpeed}
        options={SPEEDS.map((s) => ({ value: s, label: `×${s}`, hint: `1 секунда = ${s} с имитации` }))}
      />
    </div>
  )
}
