import { useEffect, useState } from 'react'
import { useDebounce } from '../../hooks/useDebounce'
import { searchUsers, type UserSearchResult } from '../../lib/users'

const SEARCH_DEBOUNCE_MS = 300

interface AddTagDeps {
  tags: string[]
  onChange: (tags: string[]) => void
  onMentionAdded: (sub: string) => void
  setInput: (v: string) => void
  setOpen: (v: boolean) => void
}

function commitTag(label: string, sub: string | undefined, deps: AddTagDeps) {
  const { tags, onChange, onMentionAdded, setInput, setOpen } = deps
  const trimmed = label.trim()
  // @ prefix discriminates app users from free-text names
  const stored = sub ? `@${trimmed}` : trimmed
  if (!stored || tags.includes(stored)) return
  onChange([...tags, stored])
  if (sub) onMentionAdded(sub)
  setInput('')
  setOpen(false)
}

export function useCompanionSearch(tags: string[], onChange: (tags: string[]) => void, onMentionAdded: (sub: string) => void) {
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)
  // Single state object so the effect never calls setState synchronously
  const [searchResult, setSearchResult] = useState<{ query: string; results: UserSearchResult[] } | null>(null)

  const debouncedInput = useDebounce(input, SEARCH_DEBOUNCE_MS)
  const trimmedInput = debouncedInput.trim()
  const hasQuery = trimmedInput.length >= 2
  const showDropdown = open && hasQuery
  const searching = hasQuery && searchResult?.query !== trimmedInput
  const results = hasQuery && searchResult?.query === trimmedInput ? searchResult.results : []

  useEffect(() => {
    if (trimmedInput.length < 2) return
    let cancelled = false
    searchUsers(trimmedInput)
      .then((users) => {
        if (cancelled) return
        setSearchResult({ query: trimmedInput, results: users })
        setOpen(true)
      })
      .catch(() => {
        if (cancelled) return
        setSearchResult({ query: trimmedInput, results: [] })
      })
    return () => { cancelled = true }
  }, [trimmedInput])

  function addTag(label: string, sub?: string) {
    commitTag(label, sub, { tags, onChange, onMentionAdded, setInput, setOpen })
  }

  return { input, setInput, setOpen, showDropdown, searching, results, addTag }
}
