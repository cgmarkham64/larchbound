export function CompanionTagList({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  return (
    <>
      {tags.map((tag) => {
        const isAppUser = tag.startsWith('@')
        const display = isAppUser ? tag.slice(1) : tag
        return (
          <span
            key={tag}
            className={`flex items-center gap-1 border rounded-sm px-2 py-0.5 font-mono text-caption ${
              isAppUser
                ? 'bg-amber-dim border-amber-border text-amber'
                : 'bg-surface-2 border-border text-text-mid'
            }`}
          >
            {display}
            <button
              type="button"
              onClick={() => onChange(tags.filter((t) => t !== tag))}
              className="text-text-dim hover:text-amber leading-none"
            >
              ×
            </button>
          </span>
        )
      })}
    </>
  )
}
