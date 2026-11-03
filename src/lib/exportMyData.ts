// FG-13 "Export my data" helper (Avery, staged). Hidden: the Settings button is behind SHOW_EXPORT_MY_DATA = false,
// and the edge function `export-my-data` answers 503 until its EXPORT_MY_DATA flag is exactly "on".
// NEEDS JIM WORDING (Stacy clearance needed): button label and the two messages below. Nothing here is live copy.
export const EXPORT_BUTTON_LABEL = 'Export my data'
export const EXPORT_ERROR_COPY = 'We could not export your data. Please try again, or email privacy@romrx.io.'

export const EXPORT_REAUTH_COPY = 'For your security, please sign in again, then try the export once more.'

type InvokeResult = { data: unknown; error: unknown }
export type InvokeFn = (name: string, opts: { body: Record<string, unknown> }) => Promise<InvokeResult>

/** reason: 'reauth' = sign-in older than 15 minutes; 'incomplete' = the server marked the export partial (a table failed or hit the 5,000-row cap);
 *  'failed' = anything else. A partial export is NEVER offered as a download: the user sees an error instead. */
export type ExportResult = { ok: true; filename: string; json: string } | { ok: false; reason: 'reauth' | 'incomplete' | 'failed' }

export const exportErrorCopy = (reason: 'reauth' | 'incomplete' | 'failed'): string => (reason === 'reauth' ? EXPORT_REAUTH_COPY : EXPORT_ERROR_COPY)

async function errorCode(error: unknown): Promise<string | null> {
  try {
    const ctx = (error as { context?: { json?: () => Promise<unknown> } } | null)?.context
    const body = (await ctx?.json?.()) as { error?: unknown } | undefined
    return typeof body?.error === 'string' ? body.error : null
  } catch {
    return null
  }
}

export async function requestMyDataExport(invoke: InvokeFn, now: () => Date = () => new Date()): Promise<ExportResult> {
  try {
    const { data, error } = await invoke('export-my-data', { body: {} })
    if (error) return { ok: false, reason: (await errorCode(error)) === 'reauth_required' ? 'reauth' : 'failed' }
    const d = data as { export_version?: unknown; complete?: unknown; data?: unknown; tables?: unknown } | null
    if (!d || d.export_version !== 2 || typeof d.data !== 'object' || d.data === null) return { ok: false, reason: 'failed' }
    // complete must be exactly true AND no table may be errored or truncated (the 5,000-row cap): otherwise show the error, do not save a partial file
    const tables = d.tables as Record<string, { rows?: unknown; truncated?: unknown; error?: unknown }> | null
    const clean = !!tables && typeof tables === 'object' && Object.values(tables).every((t) => t && typeof t.rows === 'number' && t.truncated === false && !t.error)
    if (d.complete !== true || !clean) return { ok: false, reason: 'incomplete' }
    return { ok: true, filename: `romrx-my-data-${now().toISOString().slice(0, 10)}.json`, json: JSON.stringify(d, null, 2) }
  } catch {
    return { ok: false, reason: 'failed' }
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
