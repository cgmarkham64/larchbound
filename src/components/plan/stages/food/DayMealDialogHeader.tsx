import { IconX } from '../../../icons'
import type { WeightUnit } from './dayMealDialog.helpers'
import { AiQuotaBadge } from '../../AiQuotaBadge'

const WEIGHT_UNITS: WeightUnit[] = ['oz', 'g']

type DayMealDialogHeaderProps = {
  dayNumber: number
  weightUnit: WeightUnit
  onWeightUnitChange: (u: WeightUnit) => void
  onClose: () => void
}

export function DayMealDialogHeader({ dayNumber, weightUnit, onWeightUnitChange, onClose }: DayMealDialogHeaderProps) {
  return (
    <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
      <span className="font-mono text-label font-bold text-amber bg-amber-dim border border-amber-border px-2 py-0.5 rounded">
        D{dayNumber}
      </span>
      <span className="font-heading text-body-sm font-extrabold text-text">Meal plan</span>
      <div className="ml-auto flex items-center gap-3">
        <AiQuotaBadge />
        <div className="flex rounded border border-border overflow-hidden">
          {WEIGHT_UNITS.map(u => (
            <button
              key={u}
              type="button"
              onClick={() => onWeightUnitChange(u)}
              className={`font-mono text-label px-2.5 py-1 transition-colors cursor-pointer ${
                weightUnit === u ? 'bg-pine-dim text-pine' : 'text-text-dim hover:text-text-mid'
              }`}
            >
              {u}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} className="text-text-dim hover:text-text transition-colors cursor-pointer">
          <IconX size={16} />
        </button>
      </div>
    </div>
  )
}
