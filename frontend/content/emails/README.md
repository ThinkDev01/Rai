# Branded Cognito Emails

The default AWS Cognito emails are plain text from `no-reply@verificationemail.com` — they look like phishing. This folder holds the branded HTML templates we paste into the Cognito Console so verification, password-reset, and MFA emails arrive looking like Rai.

## Files

| File | Cognito message type | When it fires |
|---|---|---|
| `cognito-verify.html`          | Verification message (`CONFIRM_SIGN_UP`)   | New signup confirms their email |
| `cognito-forgot-password.html` | Forgot password message (`FORGOT_PASSWORD`)| User clicks "Forgot password" |
| `cognito-mfa.html`             | MFA code message (`AUTHENTICATION`)        | MFA-enabled user signs in |

## Cognito variables you can use inside the HTML

- `{####}` — the one-time code (verification / reset / MFA). Cognito substitutes at send time.
- `{username}` — the username (we use email, so this is the user's email).

Don't add other variables — Cognito won't expand them.

---

## Setup walk-through (one-time, in AWS Console)

### Step 1 — verify your sending domain in SES (~5 min + DNS wait)

Cognito's built-in sender is rate-limited (~50 emails/day) and uses `no-reply@verificationemail.com`. For production-quality delivery you need SES.

1. AWS Console → **Amazon SES** → **Verified identities** → **Create identity**.
2. Pick **Domain**. Enter `rai.novetum.com` (or whichever subdomain you'll send from).
3. Enable **DKIM** with **Easy DKIM** (RSA 2048-bit). SES generates 3 CNAME records.
4. Add those CNAMEs to the domain's DNS (the existing DNS provider — Cloudflare/Route 53/etc).
5. Wait for verification (usually <15 min; AWS polls DNS). Status flips to **Verified**.
6. **Critical:** Move out of the SES sandbox. By default, SES will only send to verified addresses. Open a support case: **Service Quotas → SES → Request production access**. Approval is usually same-day.

### Step 2 — wire Cognito to use SES (~2 min)

1. AWS Console → **Cognito** → pick the User Pool (the one used by Rai v2).
2. **Messaging** tab → **Email** section → **Edit**.
3. **FROM email address**: `Rai <no-reply@rai.novetum.com>` (must be on the verified domain from Step 1).
4. **REPLY-TO email address**: `support@rai.novetum.com`.
5. **Email provider**: switch from **Send email with Cognito** to **Send email with Amazon SES**.
6. **SES Region**: same region as the SES verified identity.
7. Save.

### Step 3 — paste the branded templates (~3 min)

1. Same Cognito User Pool → **Messaging** tab → **Message templates**.
2. For each of the three templates listed at the top of this README:
   - Click **Edit**.
   - **Email subject** — see the matching `<!-- subject: ... -->` comment at the top of each HTML file.
   - **Email message** → **HTML** mode (NOT plain text).
   - Paste the full file content (excluding the leading `<!-- subject ... -->` line).
   - Save.

### Step 4 — smoke test

1. Sign up with a real email you control. Verification email should arrive within ~30s, branded, from `no-reply@rai.novetum.com`.
2. Trigger forgot-password from `/auth/login`. Reset email should match.
3. If MFA is enabled for the user, sign in and verify the MFA code email.

---

## Editing the templates

- Edit the HTML files here, NOT in the AWS Console (the console is the deploy target).
- After editing, paste the new content into the Cognito Console **Message templates** UI.
- Keep changes inline-CSS only. Most email clients (Gmail, Outlook) strip `<style>` blocks in the head.
- Test rendering at [putsmail.com](https://putsmail.com) or [mailtrap.io](https://mailtrap.io) before pasting into Cognito.
- Logo: serve from `https://rai.novetum.com/brand/wordmark.png` (or wherever we host) — embedding base64 SVG inside email HTML is unreliable.

## Future: CustomMessage Lambda Trigger

When we want **variables the templates don't currently support** (e.g. inviter name in invite confirmations, org-specific branding for white-label tenants), we'll add a CustomMessage Lambda trigger. The Lambda receives `{triggerSource, userAttributes, codeParameter}` and returns `{emailSubject, emailMessage}`. The HTML structure stays the same — only the variable substitution layer moves into code.

Parked until we need it. See `docs/upgrades.md` once the entry exists.
