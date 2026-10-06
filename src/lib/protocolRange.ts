// My Protocol joint card range line ("<min>–<max><unit>"). Returns null when the joint shows no range
// (hideRange: shoulder ER tucked-elbow test has no typical range, Stacy / Quinn Oct 6 2026).
export interface RangeDef {
  normalMin: number
  normalMax: number
  unit: string
  hideRange?: boolean
}

export function rangeText(def: RangeDef): string | null {
  if (def.hideRange) return null
  return `${def.normalMin}–${def.normalMax}${def.unit}`
}
