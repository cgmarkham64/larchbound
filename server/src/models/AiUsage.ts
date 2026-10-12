import { Schema, model } from 'mongoose'

export const GLOBAL_USAGE_SUB = '__global__'

const AiUsageSchema = new Schema(
  {
    sub:       { type: String, required: true, index: true },
    yearMonth: { type: String, required: true },
    count:     { type: Number, required: true, default: 0 },
    tripId:    { type: String, default: null },
  },
  { timestamps: true }
)

AiUsageSchema.index({ sub: 1, yearMonth: 1 }, { unique: true })

export const AiUsage = model('AiUsage', AiUsageSchema)
