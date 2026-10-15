/** The Sidera mark (build/logo-mark.svg): an S-path ending in a dot, with a four-point star. */
export function LogoMark({ className = 'size-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" className={className} aria-hidden>
      <path d="M53 21H41A15.5 15.5 0 0 0 41 52A15.5 15.5 0 0 1 41 83H27" stroke="currentColor" strokeWidth="7.5" strokeLinecap="round" />
      <circle cx="27" cy="83" r="9" fill="currentColor" />
      <path d="M68 4C69.19 15.56 73.44 19.81 85 21C73.44 22.19 69.19 26.44 68 38C66.81 26.44 62.56 22.19 51 21C62.56 19.81 66.81 15.56 68 4Z" fill="currentColor" />
    </svg>
  )
}

export function Logo() {
  return (
    <a href="#top" className="flex items-center gap-2 text-[19px] font-semibold tracking-[-0.02em]">
      <LogoMark className="size-6" />
      Sidera
    </a>
  )
}
