import { FOOTER } from '@/content/marketing';

/**
 * Slim marketing footer. Brand name + copyright + small Novetum credit.
 * Not fixed (unlike the in-app shell Footer) — sits at the end of page flow.
 *
 * Copy lives in content/marketing.ts (FOOTER export).
 */
export function MarketingFooter() {
  return (
    <footer className="border-t border-border-subtle bg-surface-raised">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-5 py-6 text-xs text-text-placeholder sm:flex-row sm:px-8">
        <p>
          <span className="font-semibold text-text-subtle">{FOOTER.brand}</span>
          <span className="mx-1.5">·</span>
          &copy; {FOOTER.year} {FOOTER.copyrightSuffix}
        </p>
        <p className="text-text-placeholder">
          {FOOTER.credit.prefix}{' '}
          <span className="font-medium text-text-subtle">{FOOTER.credit.name}</span>
        </p>
      </div>
    </footer>
  );
}
