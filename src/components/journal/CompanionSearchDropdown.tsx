import type { UserSearchResult } from '../../lib/users'
import { initials } from '../../lib/utils'

export function CompanionSearchDropdown({ searching, results, onSelect }: {
  searching: boolean
  results: UserSearchResult[]
  onSelect: (name: string, sub: string) => void
}) {
  return (
    <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border-mid rounded-md overflow-hidden z-10 shadow-lg">
      {searching ? (
        <div className="px-3 py-2.5 font-mono text-caption text-text-dim">Searching…</div>
      ) : results.length > 0 ? (
        results.map((user) => (
          <button
            key={user.sub}
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onSelect(user.name, user.sub) }}
            className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-surface-2 transition-colors duration-100"
          >
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 font-mono text-label font-bold"
              style={{ background: 'var(--amber-dim)', color: 'var(--amber)' }}
            >
              {initials(user.name)}
            </div>
            <div className="min-w-0">
              <div className="font-sans text-body-sm font-medium text-text truncate">{user.name}</div>
              <div className="font-mono text-label text-text-dim">LarchBound user — will be invited</div>
            </div>
          </button>
        ))
      ) : (
        <div className="px-3 py-2.5 font-mono text-caption text-text-dim">No LarchBound users found — will be saved as a name only</div>
      )}
    </div>
  )
}
