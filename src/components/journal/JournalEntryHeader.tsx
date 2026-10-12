import { useRef } from 'react'
import type { UseFormRegister } from 'react-hook-form'
import type { FormValues } from './journalEntryForm.types'
import { AiQuotaBadge } from '../plan/AiQuotaBadge'

type JournalEntryHeaderProps = {
  register: UseFormRegister<FormValues>
  dayNumber: number
  scanning: boolean
  scanError: string | null
  onScanFile: (e: React.ChangeEvent<HTMLInputElement>) => void
}

export function JournalEntryHeader({ register, dayNumber, scanning, scanError, onScanFile }: JournalEntryHeaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onScanFile} />

      <div className="flex items-baseline gap-2.5 flex-wrap pb-3.5 mb-4.5 border-b border-border">
        <span className="font-heading text-h1 font-extrabold text-amber leading-none tracking-[-0.01em] shrink-0">
          Day {dayNumber}
        </span>
        <input
          {...register('title')}
          placeholder="Add a title…"
          className="font-heading text-lg font-semibold text-text bg-transparent border-0 outline-none flex-1 min-w-30 p-0"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={scanning}
          title="Scan a photo of your journal page to auto-fill this entry"
          className="flex items-center gap-1.25 font-mono text-label tracking-widest uppercase bg-transparent border border-current rounded-sm px-2 py-1 shrink-0"
          style={{
            color: scanning ? 'var(--text-dim)' : 'var(--amber)',
            cursor: scanning ? 'default' : 'pointer',
          }}
        >
          {scanning ? 'Scanning…' : '⊕ Scan page'}
        </button>
        <AiQuotaBadge />
      </div>

      {scanError && <p className="text-fine text-red mb-3">{scanError}</p>}
    </>
  )
}
