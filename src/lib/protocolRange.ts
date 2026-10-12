// My Protocol joint card range line ("<min>–<max><unit>"). Returns null when the joint shows no range
// (hideRange: shoulder ER (standing goal-post since Oct 6 8:19 PM) shows no typical range, Stacy / Quinn Oct 6 2026).
export interface RangeDef {
  normalMin: number
  normalMax: number
  unit: string
  hideRange?: boolean
  rangeSource?: string
}

export function rangeText(def: RangeDef): string | null {
  if (def.hideRange) return null
  return `${def.normalMin}–${def.normalMax}${def.unit}`
}

// Source line under the range, same text as Base ("Source: Youdas et al., 2005"). Null when the range is hidden or
// the joint has no Base source.
export function sourceText(def: RangeDef): string | null {
  if (def.hideRange || !def.rangeSource) return null
  return `Source: ${def.rangeSource}`
}
