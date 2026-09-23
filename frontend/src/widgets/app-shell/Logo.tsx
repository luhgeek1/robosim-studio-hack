import { Link } from 'react-router'

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 select-none" title="RoboScope — на главную">
      <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden>
        <rect x="1" y="1" width="20" height="20" rx="5" fill="var(--primary)" />
        <circle cx="11" cy="11" r="4.2" stroke="var(--primary-foreground)" strokeWidth="1.8" />
        <path
          d="M11 3.5v3M11 15.5v3M3.5 11h3M15.5 11h3"
          stroke="var(--primary-foreground)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
      <span className="text-[15px] font-semibold tracking-tight">RoboScope</span>
    </Link>
  )
}
