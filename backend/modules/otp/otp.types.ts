// Email-OTP gate — the allowlist of actions a verification code can authorize.
// Adding a gated action = add a key here + its human label, then call
// verifyActionOtp(...) in that action's controller (and requestActionOtp from
// the frontend). Keys are stored verbatim in otp_challenges.action.

export const OTP_ACTIONS = [
  'delete_org',
  'transfer_ownership',
  'delete_project',
  'cancel_subscription',
] as const;

export type OtpAction = (typeof OTP_ACTIONS)[number];

export function isOtpAction(v: unknown): v is OtpAction {
  return typeof v === 'string' && (OTP_ACTIONS as readonly string[]).includes(v);
}

/**
 * Human phrasing for each action, dropped into the OTP email ("...to {label}").
 * Kept terse so the sentence reads naturally.
 */
export const OTP_ACTION_LABEL: Record<OtpAction, string> = {
  delete_org:           'delete your organization',
  transfer_ownership:   'transfer ownership of your organization',
  delete_project:       'delete a project',
  cancel_subscription:  'cancel your subscription',
};
