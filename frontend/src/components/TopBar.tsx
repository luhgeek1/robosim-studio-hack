import { motion } from 'framer-motion'
import { FolderOpen, LogIn, LogOut, Search } from 'lucide-react'
import { Link, NavLink, useMatch, useNavigate } from 'react-router'
import { useProject } from '@/api/projects'
import { useSession } from '@/api/sessionContext'
import { filledShare } from '@/lib/format'
import { STEPS, stepPath } from '@/lib/story'
import { useStore } from '@/store'
import { Button } from './ui'

function Logo() {
  return (
    <Link to="/" className="-mx-1 flex items-center gap-2.5 rounded-md px-1 select-none" title="На главную">
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
        <rect x="1" y="1" width="20" height="20" rx="6" fill="#17171a" />
        <circle cx="11" cy="11" r="4.2" stroke="#fff" strokeWidth="1.8" />
        <path d="M11 3.5v3M11 15.5v3M3.5 11h3M15.5 11h3" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <span className="text-[15px] font-semibold tracking-[-0.02em]">RoboScope</span>
    </Link>
  )
}

function ProjectNav({ projectId }: { projectId: string }) {
  const project = useProject(projectId).data
  const setTrustOpen = useStore((s) => s.setTrustOpen)
  const quality = project ? filledShare(project.data_quality.counts).pct : null
  return (
    <>
      <div className="h-5 w-px bg-line-2" />
      <button
        type="button"
        onClick={() => setTrustOpen(true)}
        className="group -mx-1 flex min-w-0 items-center gap-3 rounded-md px-1 py-1 transition-colors hover:bg-black/[0.04]"
        title="Откуда взяты данные объекта"
      >
        <span className="max-w-[260px] truncate text-[14px] font-medium">{project?.name ?? '…'}</span>
        {quality !== null && (
          <span className="hidden items-center gap-1.5 text-[12.5px] whitespace-nowrap text-ink-3 xl:flex">
            <ConfidenceRing value={quality} />
            данные заполнены на <span className="num font-medium text-ink">{quality} %</span>
          </span>
        )}
      </button>
      <nav className="ml-auto flex items-center gap-1" aria-label="Шаги оценки">
        {STEPS.map((s, i) => (
          <NavLink
            key={s.id}
            to={stepPath(projectId, s.id)}
            className={({ isActive }) =>
              `relative h-8 rounded-md px-3 text-[13px] leading-8 font-medium transition-colors ${
                isActive ? 'text-ink' : 'text-ink-3 hover:bg-black/[0.04] hover:text-ink'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-md bg-black/[0.06]"
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  <span className={`num text-[11px] ${isActive ? 'text-ink-2' : 'text-ink-4'}`}>{i + 1}</span>
                  {s.label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </>
  )
}

export function TopBar() {
  const match = useMatch('/projects/:projectId/*')
  const projectId = match?.params.projectId
  const { user, status, logout } = useSession()
  const navigate = useNavigate()

  return (
    <header className="sticky top-0 z-30 h-14 shrink-0 border-b border-line bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-[1440px] items-center gap-6 px-6">
        <Logo />
        {projectId ? (
          <ProjectNav projectId={projectId} />
        ) : (
          <span className="hidden text-[13px] text-ink-3 md:inline">Оценка роботизации объекта за несколько минут</span>
        )}
        <div className={`flex items-center gap-1 ${projectId ? '' : 'ml-auto'}`}>
          <Button size="sm" variant="ghost" icon={<Search size={14} />} onClick={() => navigate('/catalog')}>
            Каталог
          </Button>
          {user && (
            <Button size="sm" variant="ghost" icon={<FolderOpen size={14} />} onClick={() => navigate('/projects')}>
              Проекты
            </Button>
          )}
          {status === 'guest' && (
            <Button size="sm" variant="secondary" icon={<LogIn size={14} />} onClick={() => navigate('/login')}>
              Войти
            </Button>
          )}
          {user && (
            <Button
              size="sm"
              variant="ghost"
              icon={<LogOut size={14} />}
              title={`${user.name || user.email} — выйти`}
              onClick={async () => {
                await logout()
                navigate('/login')
              }}
              className="!px-2.5"
            >
              <span className="sr-only">Выйти</span>
            </Button>
          )}
        </div>
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
        stroke={value >= 80 ? '#1f8f5a' : value >= 60 ? '#d18a1f' : '#d24b3f'}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${(c * value) / 100} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  )
}
