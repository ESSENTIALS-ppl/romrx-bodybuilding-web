// FG-13 "Export my data" helper (Avery, staged). Hidden: the Settings button is behind SHOW_EXPORT_MY_DATA = false,
// and the edge function `export-my-data` answers 503 until its EXPORT_MY_DATA flag is exactly "on".
// NEEDS JIM WORDING (Stacy clearance needed): button label and the two messages below. Nothing here is live copy.
export const EXPORT_BUTTON_LABEL = 'Export my data'
export const EXPORT_ERROR_COPY = 'We could not export your data. Please try again, or email privacy@romrx.io.'

type InvokeResult = { data: unknown; error: unknown }
export type InvokeFn = (name: string, opts: { body: Record<string, unknown> }) => Promise<InvokeResult>

export type ExportResult = { ok: true; filename: string; json: string } | { ok: false }

export async function requestMyDataExport(invoke: InvokeFn, now: () => Date = () => new Date()): Promise<ExportResult> {
  try {
    const { data, error } = await invoke('export-my-data', { body: {} })
    const d = data as { export_version?: unknown; data?: unknown } | null
    if (error || !d || d.export_version !== 1 || typeof d.data !== 'object' || d.data === null) return { ok: false }
    return { ok: true, filename: `romrx-my-data-${now().toISOString().slice(0, 10)}.json`, json: JSON.stringify(d, null, 2) }
  } catch {
    return { ok: false }
  }
}

/** Browser-only: save the JSON string as a file download. */
export function saveJsonDownload(filename: string, json: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
