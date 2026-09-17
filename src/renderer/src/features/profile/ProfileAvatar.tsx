import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { color } from '@/lib/colors'
import { cn } from '@/lib/utils'
import type { ProfileRef } from '@shared/types'

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  const letters = parts.length === 1 ? parts[0][0] : parts[0][0] + parts[parts.length - 1][0]
  return letters.toUpperCase()
}

/** Round profile picture: the uploaded image, or initials on the profile color. */
export function ProfileAvatar({
  profile,
  size = 'default',
  className
}: {
  profile: Pick<ProfileRef, 'name' | 'color' | 'avatarUrl'> | null | undefined
  size?: 'xs' | 'sm' | 'default' | 'lg'
  className?: string
}) {
  const dims = { xs: 'size-5', sm: 'size-6', default: 'size-8', lg: 'size-14' }[size]
  const text = { xs: 'text-[9px]', sm: 'text-[10px]', default: 'text-xs', lg: 'text-lg' }[size]
  return (
    <Avatar className={cn(dims, className)}>
      {profile?.avatarUrl && <AvatarImage src={profile.avatarUrl} alt={profile.name} className="object-cover" />}
      <AvatarFallback
        className={cn('font-medium text-white', text)}
        style={{ background: profile ? color(profile.color).fg : undefined }}
      >
        {profile ? initials(profile.name) : '?'}
      </AvatarFallback>
    </Avatar>
  )
}
