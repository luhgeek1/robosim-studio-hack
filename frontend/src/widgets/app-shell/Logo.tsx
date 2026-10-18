import { Link } from 'react-router'

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      to="/"
      className="workspace-logo -mx-1 flex min-h-10 min-w-10 shrink-0 items-center gap-2.5 rounded-md px-1 select-none"
      title="РобоМера — на главную"
      aria-label="РобоМера — на главную"
    >
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
        <path
          d="M8 2H4a2 2 0 0 0-2 2v4m12-6h4a2 2 0 0 1 2 2v4M2 14v4a2 2 0 0 0 2 2h4m6 0h4a2 2 0 0 0 2-2v-4M7 11h8"
          stroke="#ff784e"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <span className={`text-[16px] font-semibold tracking-[-0.035em] ${compact ? 'hidden sm:inline' : ''}`}>
        РобоМера<span className="text-[#ff784e]">.</span>
      </span>
    </Link>
  )
}
