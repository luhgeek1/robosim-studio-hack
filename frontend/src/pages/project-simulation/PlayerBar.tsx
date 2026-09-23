import { Pause, Play, RotateCcw } from 'lucide-react'
import { useEffect } from 'react'
import { SPEEDS, usePlayback } from '@/entities/simulation'
import { Button } from '@/shared/ui/button'
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

// ТЗ 3.6.3: старт, стоп, перезапуск, скорость воспроизведения. Выбор сценария и условий прогона — над сценой.
export function PlayerBar() {
  const playing = usePlayback((s) => s.playing)
  const speed = usePlayback((s) => s.speed)
  const total = usePlayback((s) => s.total)
  const t = usePlayback((s) => Math.floor(s.t / 20) * 20)
  const { setPlaying, setSpeed, setT } = usePlayback.getState()
  return (
    <div className="absolute bottom-4 left-1/2 z-10 flex w-[min(760px,calc(100%-32px))] -translate-x-1/2 items-center gap-3 rounded-[14px] border border-line bg-white/95 p-2 shadow-card backdrop-blur">
      <Button size="sm" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Пауза' : 'Запустить'}>
        {playing ? <Pause /> : <Play />}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setT(0)} aria-label="С начала">
        <RotateCcw />
      </Button>
      <input
        type="range"
        min={0}
        max={Math.max(1, total)}
        step={1}
        value={t}
        onChange={(e) => setT(Number(e.target.value))}
        className="h-1 min-w-0 flex-1 cursor-pointer accent-ink"
        aria-label="Время имитации"
      />
      <span className="num w-23 shrink-0 text-center text-[12.5px] text-ink-2">
        {clock(t)} / {clock(total)}
      </span>
      <Segmented
        size="sm"
        layoutId="sim-speed"
        value={speed}
        onChange={setSpeed}
        options={SPEEDS.map((s) => ({ value: s, label: `×${s}`, hint: `1 секунда = ${s} с имитации` }))}
      />
    </div>
  )
}
