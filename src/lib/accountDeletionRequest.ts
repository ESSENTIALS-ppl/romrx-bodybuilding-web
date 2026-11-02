// "Request account deletion" button (Jim GO 2026-09-24).
// Calls the shared edge function `request-account-deletion`, which emails
// privacy@romrx.io via Resend. Nothing is deleted or canceled by this flow.
// The success copy is only shown when the function confirms the email was sent.

export const DELETION_BUTTON_LABEL = 'Request account deletion'
export const DELETION_SUCCESS_COPY =
  'We got your request. We will confirm by email and complete it within 30 days.'

export type DeletionSite = 'romrx.io' | 'romrxbjj.com' | 'romrxbodybuilding.com'

export type DeletionResult =
  | { ok: true; resendId: string }
  | { ok: false; reason: 'rate_limited' | 'failed' }

type InvokeResult = { data: unknown; error: unknown }
export type InvokeFn = (name: string, opts: { body: Record<string, unknown> }) => Promise<InvokeResult>

function statusOf(error: unknown): number | undefined {
  const ctx = (error as { context?: { status?: unknown } } | null)?.context
  return typeof ctx?.status === 'number' ? ctx.status : undefined
}

export async function requestAccountDeletion(invoke: InvokeFn, site: DeletionSite): Promise<DeletionResult> {
  try {
    const { data, error } = await invoke('request-account-deletion', { body: { site } })
    if (error) {
      return { ok: false, reason: statusOf(error) === 429 ? 'rate_limited' : 'failed' }
    }
    const d = data as { ok?: unknown; resend_id?: unknown } | null
    if (d && d.ok === true && typeof d.resend_id === 'string' && d.resend_id.length > 0) {
      return { ok: true, resendId: d.resend_id }
    }
    return { ok: false, reason: 'failed' }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}

export function deletionErrorCopy(reason: 'rate_limited' | 'failed'): string {
  return reason === 'rate_limited'
    ? 'You already sent a request recently. Please wait an hour, or email privacy@romrx.io.'
    : 'We could not send your request. Please try again, or email privacy@romrx.io.'
}
