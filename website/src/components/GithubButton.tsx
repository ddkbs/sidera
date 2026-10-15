import { IconBrandGithubFill } from 'obra-icons-react'
import { formatStars, REPO_URL, useRepoInfo } from '../lib'

/** "Star on GitHub" with a light sweep on hover and the star turning gold; the count is live from the GitHub API. */
export function GithubButton({ className = '' }: { className?: string }) {
  const { stars } = useRepoInfo()
  return (
    <a
      href={REPO_URL}
      target="_blank"
      rel="noreferrer"
      className={`group relative inline-flex h-9 items-center justify-center gap-2 overflow-hidden whitespace-pre rounded-md border border-border-strong bg-[#111114] px-4 text-sm font-medium text-white shadow transition-all duration-300 ease-out hover:bg-[#16161a] hover:ring-2 hover:ring-white/25 hover:ring-offset-2 hover:ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${className}`}
    >
      <span className="absolute right-0 -mt-12 h-32 w-8 translate-x-12 rotate-12 bg-white opacity-10 transition-all duration-1000 ease-out group-hover:-translate-x-48" />
      <span className="flex items-center">
        <IconBrandGithubFill size={16} />
        <span className="ml-1.5">Star on GitHub</span>
      </span>
      <span className="ml-1 flex items-center gap-1">
        <svg className="size-4 text-faint transition-all duration-300 group-hover:text-yellow-300" aria-hidden fill="currentColor" viewBox="0 0 24 24">
          <path
            clipRule="evenodd"
            fillRule="evenodd"
            d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z"
          />
        </svg>
        <span className="inline-block font-mono empty:hidden tabular-nums tracking-wider">{stars ? formatStars(stars) : ''}</span>
      </span>
    </a>
  )
}
