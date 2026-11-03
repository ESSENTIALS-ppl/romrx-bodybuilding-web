// FG-21: show the user where their deletion request stands. Reads the user's own row (the owner-read policy); only the service role writes it.
// ALL WORDING BELOW IS NEW CUSTOMER COPY: NEEDS JIM WORDING (Stacy). It is shown only when SHOW_DELETION_STATUS is true in Settings (default false).
export type DeletionStatus = 'requested' | 'in_progress' | 'completed' | 'failed'
export const DELETION_STATUS_COPY: Record<DeletionStatus, string> = {
  requested: 'Deletion requested',
  in_progress: 'Deletion in progress',
  completed: 'Deletion completed',
  failed: 'There was a problem with your deletion request. Please email privacy@romrx.io.',
}
const KNOWN = new Set<string>(['requested', 'in_progress', 'completed', 'failed'])

export type FromFn = (table: string) => {
  select: (cols: string) => {
    order: (col: string, o: { ascending: boolean }) => { limit: (n: number) => PromiseLike<{ data: unknown; error: unknown }> }
  }
}

/** Newest request status for the signed-in user, or null (no request, table not there yet, error, or an unknown status: show nothing rather than guess). */
export async function loadDeletionStatus(from: FromFn): Promise<DeletionStatus | null> {
  try {
    const { data, error } = await from('account_deletion_requests').select('status').order('requested_at', { ascending: false }).limit(1)
    if (error || !Array.isArray(data) || data.length === 0) return null
    const s = (data[0] as { status?: unknown }).status
    return typeof s === 'string' && KNOWN.has(s) ? (s as DeletionStatus) : null
  } catch {
    return null
  }
}
