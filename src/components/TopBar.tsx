import { motion } from 'framer-motion'
import { FolderOpen, Share2 } from 'lucide-react'
import { STEPS, useStore } from '../store'
import { Button } from './ui'

function Logo() {
  return (
    <button type="button" onClick={() => useStore.getState().setStep('projects')} className="flex items-center gap-2.5 select-none rounded-md -mx-1 px-1" title="К списку проектов">
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
        <rect x="1" y="1" width="20" height="20" rx="6" fill="#17171a" />
        <circle cx="11" cy="11" r="4.2" stroke="#fff" strokeWidth="1.8" />
        <path d="M11 3.5v3M11 15.5v3M3.5 11h3M15.5 11h3" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <span className="text-[15px] font-semibold tracking-[-0.02em]">RoboScope</span>
    </button>
  )
}

export function TopBar() {
  const step = useStore((s) => s.step)
  const project = useStore((s) => s.project)
  const setStep = useStore((s) => s.setStep)
  const setConfidenceOpen = useStore((s) => s.setConfidenceOpen)
  const toast = useStore((s) => s.toast)
  const inProject = step !== 'projects' && project

  return (
    <header className="sticky top-0 z-30 h-14 shrink-0 border-b border-line bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-[1440px] items-center gap-6 px-6">
        <Logo />
        {inProject ? (
          <>
            <div className="h-5 w-px bg-line-2" />
            <button
              type="button"
              onClick={() => setConfidenceOpen(true)}
              className="group flex min-w-0 items-center gap-3 rounded-md px-1 py-1 -mx-1 transition-colors hover:bg-black/[0.04]"
              title="Открыть качество данных"
            >
              <span className="truncate text-[14px] font-medium">{project.name}</span>
              {project.confidence !== null && (
                <span className="flex items-center gap-1.5 whitespace-nowrap text-[12.5px] text-ink-3">
                  <ConfidenceRing value={project.confidence} />
                  <span>
                    достоверность данных <span className="text-ink font-medium num">{project.confidence} %</span>
                  </span>
                </span>
              )}
            </button>
            <nav className="ml-auto hidden items-center gap-1 lg:flex" aria-label="Этапы">
              {STEPS.map((s, i) => {
                const active = s.id === step
                const enabled = project.supported || s.id === 'object'
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={!enabled}
                    onClick={() => setStep(s.id)}
                    className={`relative h-8 rounded-md px-3 text-[13px] font-medium transition-colors ${active ? 'text-ink' : enabled ? 'text-ink-3 hover:text-ink hover:bg-black/[0.04]' : 'text-ink-4'}`}
                  >
                    {active && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-md bg-black/[0.06]" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                    <span className="relative z-10 flex items-center gap-2">
                      <span className={`num text-[11px] ${active ? 'text-ink-2' : 'text-ink-4'}`}>{i + 1}</span>
                      {s.label}
                    </span>
                  </button>
                )
              })}
            </nav>
            <Button size="sm" variant="ghost" icon={<FolderOpen size={14} />} onClick={() => setStep('projects')} className="hidden sm:inline-flex">
              Проекты
            </Button>
            <Button size="sm" variant="ghost" icon={<Share2 size={14} />} onClick={() => toast('Ссылка на проект скопирована')}>
              Поделиться
            </Button>
          </>
        ) : (
          <span className="ml-auto text-[13px] text-ink-3">Оценка роботизации объекта за несколько минут</span>
        )}
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
      <circle cx={size / 2} cy={size / 2} r={r} stroke={value >= 80 ? '#1f8f5a' : value >= 60 ? '#d18a1f' : '#d24b3f'} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeDasharray={`${(c * value) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  )
}
