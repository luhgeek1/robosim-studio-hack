import { motion } from 'framer-motion'
import { Share2 } from 'lucide-react'
import { STEPS, useStore } from '../store'
import { project } from '../data/project'
import { Button } from './ui'

function Logo() {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
        <rect x="1" y="1" width="20" height="20" rx="6" fill="#17171a" />
        <circle cx="11" cy="11" r="4.2" stroke="#fff" strokeWidth="1.8" />
        <path d="M11 3.5v3M11 15.5v3M3.5 11h3M15.5 11h3" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <span className="text-[15px] font-semibold tracking-[-0.02em]">RoboScope</span>
    </div>
  )
}

export function TopBar() {
  const step = useStore((s) => s.step)
  const setStep = useStore((s) => s.setStep)
  const setConfidenceOpen = useStore((s) => s.setConfidenceOpen)
  const toast = useStore((s) => s.toast)
  return (
    <header className="sticky top-0 z-30 h-14 shrink-0 border-b border-line bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-[1440px] items-center gap-6 px-6">
        <Logo />
        <div className="h-5 w-px bg-line-2" />
        <button
          type="button"
          onClick={() => setConfidenceOpen(true)}
          className="group flex items-center gap-3 rounded-md px-1 py-1 -mx-1 transition-colors hover:bg-black/[0.04]"
          title="Открыть качество данных"
        >
          <span className="text-[14px] font-medium">{project.name}</span>
          <span className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
            <ConfidenceRing value={project.confidence} />
            <span>
              достоверность данных <span className="text-ink font-medium num">{project.confidence} %</span>
            </span>
          </span>
        </button>

        <nav className="ml-auto hidden items-center gap-1 lg:flex" aria-label="Этапы">
          {STEPS.map((s, i) => {
            const active = s.id === step
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setStep(s.id)}
                className={`relative h-8 rounded-md px-3 text-[13px] font-medium transition-colors ${
                  active ? 'text-ink' : 'text-ink-3 hover:text-ink hover:bg-black/[0.04]'
                }`}
              >
                {active && (
                  <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-md bg-black/[0.06]" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  <span className={`num text-[11px] ${active ? 'text-ink-2' : 'text-ink-4'}`}>{i + 1}</span>
                  {s.label}
                </span>
              </button>
            )
          })}
        </nav>

        <Button size="sm" variant="ghost" icon={<Share2 size={14} />} onClick={() => toast('Ссылка на проект скопирована')}>
          Поделиться
        </Button>
      </div>
    </header>
  )
}

export function ConfidenceRing({ value, size = 18 }: { value: number; size?: number }) {
  const r = (size - 3) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(0,0,0,0.08)" strokeWidth="2.5" fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="#1f8f5a"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${(c * value) / 100} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  )
}
