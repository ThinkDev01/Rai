// Branded HTML email layout — the single shell every notification email shares.
// Table-based with fully inline styles for email-client compatibility (Gmail,
// Outlook, Apple Mail strip <style> blocks and class hooks, so nothing can be
// externalised). Colours mirror the app's light-theme design tokens in
// frontend/app/globals.css so the mail matches the product UI — we don't
// dark-theme email (clients control that) and we keep the system font stack
// since clients can't load Inter. Shares its look with the v1 Cognito emails
// in frontend/content/emails/.


const C = {
  surface:    '#F4F5F7', // --color-surface
  card:       '#FFFFFF', // --color-surface-raised
  border:     '#DFE1E6', // --color-border
  borderSub:  '#EBECF0', // --color-border-subtle
  primary:    '#0052CC', // --color-primary
  primarySub: '#DEEBFF', // --color-primary-subtle
  primaryBd:  '#B3D4FF', // primary-subtle border (matches v1 code block)
  text:       '#172B4D', // --color-text
  textSubtle: '#6B778C', // --color-text-subtle
  textPlace:  '#97A0AF', // --color-text-placeholder
};

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

// Escape every interpolated value — names, titles and org names are user-
// controlled and must never break the markup or inject HTML.
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Inline emphasis for body copy. Authors write Markdown-style **bold** in plain
// strings — NEVER raw HTML, which esc() would turn into literal "<strong>" text
// (the exact bug this guards against). We escape first (so user-controlled org
// names / titles can't inject markup), THEN turn the safe `**...**` markers into
// <strong>. Order matters: escape-then-emphasise keeps the injection guarantee.
function richText(s: string): string {
  return esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

export interface EmailLayoutParams {
  /** Big heading at the top of the card. */
  heading: string;
  /**
   * One or more body paragraphs. Plain text, escaped + rendered as <p>.
   * Use Markdown-style **bold** for emphasis — NEVER raw HTML tags (they're
   * escaped and would show up as literal "<strong>" text in the email).
   */
  body: string[];
  /** Optional emphasised callout (e.g. the ticket label) shown in a blue box. */
  highlight?: string;
  /**
   * Optional one-time code, shown in the big centered letter-spaced blue block
   * (matches the Cognito verify/MFA emails). Used by the OTP email.
   */
  code?: string;
  /** Optional primary action button. */
  cta?: { text: string; url: string };
  /**
   * Optional small print rendered below the code/CTA (expiry, "ignore this
   * email" reassurance). Same **bold** + escape rules as `body`.
   */
  footnote?: string[];
}

/** Wrap notification content in the branded Rai email shell, returning full HTML. */
export function renderEmail(p: EmailLayoutParams): string {
  const paragraphs = p.body
    .map(
      (line) =>
        `<p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:${C.textSubtle};">${richText(line)}</p>`,
    )
    .join('\n                ');

  const highlight = p.highlight
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
                  <tr>
                    <td style="background:${C.primarySub};border:1px solid ${C.primaryBd};border-radius:8px;padding:16px 20px;font-size:15px;font-weight:600;line-height:1.4;color:${C.primary};">${esc(p.highlight)}</td>
                  </tr>
                </table>`
    : '';

  const code = p.code
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
                  <tr>
                    <td align="center" style="background:${C.primarySub};border:1px solid ${C.primaryBd};border-radius:8px;padding:20px;font-family:'SFMono-Regular',Menlo,Monaco,Consolas,'Courier New',monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:${C.primary};">${esc(p.code)}</td>
                  </tr>
                </table>`
    : '';

  const cta = p.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0;">
                  <tr>
                    <td style="background:${C.primary};border-radius:8px;">
                      <a href="${esc(p.cta.url)}" style="display:inline-block;padding:11px 22px;font-size:14px;font-weight:600;color:#FFFFFF;text-decoration:none;">${esc(p.cta.text)}</a>
                    </td>
                  </tr>
                </table>`
    : '';

  const footnote = p.footnote && p.footnote.length
    ? p.footnote
        .map(
          (line) =>
            `<p style="margin:16px 0 0 0;font-size:13px;line-height:1.6;color:${C.textSubtle};">${richText(line)}</p>`,
        )
        .join('\n                ')
    : '';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${esc(p.heading)}</title>
  </head>
  <body style="margin:0;padding:0;background:${C.surface};font-family:${FONT};color:${C.text};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.surface};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${C.card};border:1px solid ${C.border};border-radius:12px;overflow:hidden;">
            <!-- Brand row -->
            <tr>
              <td style="padding:24px 32px;border-bottom:1px solid ${C.borderSub};">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <!-- Rai logo mark: pill + circle, pure HTML/CSS, no external URL -->
                    <td style="width:36px;height:36px;vertical-align:top;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:36px;height:36px;">
                        <tr>
                          <td style="width:14px;vertical-align:middle;">
                            <div style="background:${C.primary};width:11px;height:22px;border-radius:6px;margin:0 auto;"></div>
                          </td>
                          <td style="vertical-align:top;padding-top:6px;">
                            <div style="background:${C.primary};width:11px;height:11px;border-radius:50%;"></div>
                          </td>
                        </tr>
                      </table>
                    </td>
                    <td style="padding-left:10px;font-weight:700;font-size:18px;color:${C.text};vertical-align:middle;">Rai</td>
                  </tr>
                </table>
              </td>
            </tr>
            <!-- Body -->
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px 0;font-size:22px;line-height:1.3;color:${C.text};">${esc(p.heading)}</h1>
                ${paragraphs}
                ${code}
                ${highlight}
                ${cta}
                ${footnote}
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td style="padding:20px 32px;background:${C.surface};border-top:1px solid ${C.borderSub};font-size:12px;color:${C.textPlace};text-align:center;">
                Rai · Project management that gets out of your way<br>
                Sent by Novetum · <a href="mailto:support@rai.novetum.com" style="color:${C.primary};text-decoration:none;">support@rai.novetum.com</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
