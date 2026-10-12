import { IconMap, IconCheck, IconAlertTriangle } from '../../../icons'
import { computeBannerHeading } from './permitsListView.helpers'
import { AiQuotaBadge } from '../../AiQuotaBadge'

type DetectionBannerProps = {
  scanning: boolean
  scanError: string | null
  linksCount: number
  lastScanned: string | undefined
  permitFree: boolean
  canEdit: boolean
  onRescan: () => void
  onMarkPermitFree: () => void
}

type Tone = 'pine' | 'red' | 'amber'

function toneFor(permitFree: boolean, scanError: string | null): Tone {
  if (permitFree) return 'pine'
  if (scanError) return 'red'
  return 'amber'
}

const TONE_BG: Record<Tone, string> = {
  pine: 'bg-pine-dim border-pine-border',
  red: 'bg-red-dim border-red-border',
  amber: 'bg-amber-dim border-amber-border',
}

const TONE_BORDER: Record<Tone, string> = {
  pine: 'border-pine-border',
  red: 'border-red-border',
  amber: 'border-amber-border',
}

const TONE_TEXT: Record<Tone, string> = {
  pine: 'text-pine',
  red: 'text-red',
  amber: 'text-amber',
}

function BannerActions({ canEdit, scanning, permitFree, showConfirmFree, onRescan, onMarkPermitFree }: {
  canEdit: boolean; scanning: boolean; permitFree: boolean; showConfirmFree: boolean
  onRescan: () => void; onMarkPermitFree: () => void
}) {
  if (!canEdit || scanning || permitFree) return null
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {showConfirmFree && (
        <button
          onClick={onMarkPermitFree}
          className="inline-flex items-center gap-1.5 font-heading text-caption font-bold tracking-[0.08em] uppercase px-2.5 py-1.5 rounded border border-pine-border text-pine bg-pine-dim hover:brightness-95 transition-all cursor-pointer"
        >
          <IconCheck size={10} /> Confirm permit-free
        </button>
      )}
      <button
        onClick={onRescan}
        className="inline-flex items-center gap-1.5 font-heading text-caption font-bold tracking-[0.08em] uppercase px-2.5 py-1.5 rounded border border-border text-text-mid bg-transparent hover:border-border-mid transition-colors cursor-pointer"
      >
        Re-scan
      </button>
      <AiQuotaBadge />
    </div>
  )
}

export function DetectionBanner({
  scanning, scanError, linksCount, lastScanned, permitFree, canEdit, onRescan, onMarkPermitFree,
}: DetectionBannerProps) {
  const tone = toneFor(permitFree, scanError)
  const heading = computeBannerHeading(scanning, scanError, linksCount, lastScanned)

  return (
    <div className={`px-4 py-3 border rounded-lg ${TONE_BG[tone]}`}>
      <div className="flex items-center gap-3">
        <span className={`shrink-0 ${TONE_TEXT[tone]}`}>
          {permitFree ? <IconCheck size={16} /> : <IconMap size={16} />}
        </span>
        <div className="flex-1 min-w-0">
          <div className={`font-heading text-body-sm font-bold ${TONE_TEXT[tone]}`}>{heading}</div>
        </div>
        <BannerActions
          canEdit={canEdit} scanning={scanning} permitFree={permitFree}
          showConfirmFree={!!lastScanned && linksCount === 0}
          onRescan={onRescan} onMarkPermitFree={onMarkPermitFree}
        />
        {scanning && <span className="w-4 h-4 rounded-full border-2 border-amber border-t-transparent animate-spin shrink-0" />}
      </div>
      {lastScanned && !scanning && (
        <div className={`flex items-start gap-2 mt-2.5 pt-2.5 border-t text-caption text-text-mid font-mono ${TONE_BORDER[tone]}`}>
          <IconAlertTriangle size={13} className="shrink-0 mt-px text-amber" />
          <span>
            AI-generated links — open each one and confirm it applies to your specific trailhead,
            dates, and party size. Call or email the issuing agency if anything is unclear.
          </span>
        </div>
      )}
    </div>
  )
}
