import { Pause, Play, RotateCcw } from 'lucide-react'
import { useEffect } from 'react'
import { SPEEDS, usePlayback } from '@/twin/playback'
import { Button, Segmented } from '../ui'

export const clock = (seconds: number) => {
  const m = Math.floor(seconds / 60)
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

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

// ТЗ 3.6.3: start, stop, restart, playback speed. Scenario choice lives in the run panel above the twin.
export function PlayerBar() {
  const playing = usePlayback((s) => s.playing)
  const speed = usePlayback((s) => s.speed)
  const total = usePlayback((s) => s.total)
  const minute = usePlayback((s) => Math.floor(s.t / 20))
  const { setPlaying, setSpeed, setT } = usePlayback.getState()
  const t = usePlayback.getState().t
  return (
    <div className="absolute bottom-4 left-1/2 z-10 flex w-[min(760px,calc(100%-32px))] -translate-x-1/2 items-center gap-3 rounded-[14px] border border-line bg-white/95 p-2 shadow-card backdrop-blur">
      <Button
        variant="primary"
        size="sm"
        onClick={() => setPlaying(!playing)}
        className="!px-2.5"
        aria-label={playing ? 'Пауза' : 'Запустить'}
      >
        {playing ? <Pause size={15} /> : <Play size={15} />}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setT(0)} className="!px-2" aria-label="С начала">
        <RotateCcw size={14} />
      </Button>
      <input
        type="range"
        min={0}
        max={Math.max(1, total)}
        step={1}
        value={t}
        data-minute={minute}
        onChange={(e) => setT(Number(e.target.value))}
        className="h-1 min-w-0 flex-1 cursor-pointer accent-ink"
        aria-label="Время имитации"
      />
      <span className="num w-[92px] shrink-0 text-center text-[12.5px] text-ink-2">
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
