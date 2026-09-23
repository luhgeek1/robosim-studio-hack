import { Link } from 'react-router'

export function Logo() {
  return (
    <Link to="/" className="-mx-1 flex items-center gap-2.5 rounded-md px-1 select-none" title="РобоМера — на главную">
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
        <rect x="1" y="1" width="20" height="20" rx="6" fill="#17171a" />
        <circle cx="11" cy="11" r="4.2" stroke="#fff" strokeWidth="1.8" />
        <path d="M11 3.5v3M11 15.5v3M3.5 11h3M15.5 11h3" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <span className="text-[15px] font-semibold tracking-[-0.02em]">РобоМера</span>
    </Link>
  )
}
