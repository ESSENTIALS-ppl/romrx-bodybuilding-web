// FG-09/10/11 explicit opt-in (Stacy, Nov 2 2026). A reminder shows ON only when its toggle is true AND the server-set opt-in marker exists.
// Markers can only be written by the database function set_reminder_opt_in (clients cannot write them), so Settings changes a reminder by calling it, never by upserting the toggle.
// A plain save of the form therefore can never opt anyone in, and a user who never touched a toggle keeps whatever the database already holds.
export type ReminderKind = 'retest' | 'protocol' | 'digest'
export type ReminderState = Record<ReminderKind, boolean>
export const REMINDER_KINDS: ReminderKind[] = ['retest', 'protocol', 'digest']
export const REMINDER_MARKER_COLUMNS = 'retest_opt_in_at, protocol_opt_in_at, digest_opt_in_at'
export const NO_REMINDERS: ReminderState = { retest: false, protocol: false, digest: false }

type Row = Record<string, unknown> | null | undefined
export function reminderStateFromRow(row: Row): ReminderState {
  const r = row ?? {}
  return {
    retest: r.retest_reminders === true && !!r.retest_opt_in_at,
    protocol: r.email_reminders === true && !!r.protocol_opt_in_at,
    digest: r.weekly_digest === true && !!r.digest_opt_in_at,
  }
}

export type RpcFn = (fn: string, args: { p_kind: ReminderKind; p_on: boolean }) => PromiseLike<{ error: { message?: string } | null }>

/** Calls set_reminder_opt_in once per reminder whose switch changed. Stops at the first error. `applied` is the state the database now holds. */
export async function saveReminderChanges(
  rpc: RpcFn, before: ReminderState, after: ReminderState,
): Promise<{ ok: true; applied: ReminderState } | { ok: false; message: string; applied: ReminderState }> {
  const applied: ReminderState = { ...before }
  for (const k of REMINDER_KINDS) {
    if (before[k] === after[k]) continue
    try {
      const { error } = await rpc('set_reminder_opt_in', { p_kind: k, p_on: after[k] })
      if (error) return { ok: false, message: error.message || 'Could not save', applied }
      applied[k] = after[k]
    } catch {
      return { ok: false, message: 'Could not save', applied }
    }
  }
  return { ok: true, applied }
}
