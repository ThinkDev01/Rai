// Brand SVG marks for the auth OAuth buttons. Inline so we don't pull a
// brand-icon library; both logos are tiny + stable.
// Sourced from each vendor's official brand guidelines.

export function GoogleLogo({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        fill="#4285F4"
        d="M17.64 9.20455c0-.63818-.05727-1.25182-.16364-1.84091H9v3.48136h4.84364c-.20864 1.125-.84273 2.07818-1.79591 2.71636v2.25818h2.90864c1.70182-1.56682 2.68273-3.87409 2.68273-6.61499z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.46727-.80591 5.95636-2.18045l-2.90864-2.25818c-.80591.54-1.83682.85909-3.04773.85909-2.34409 0-4.32818-1.58318-5.03591-3.71045H.957273v2.33182C2.43818 15.9831 5.48182 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.96409 10.71c-.18-.54-.28227-1.11682-.28227-1.71s.10227-1.17.28227-1.71V4.95818H.957273C.347727 6.17318 0 7.54773 0 9s.347727 2.82682.957273 4.04182l3.00682-2.33182z"
      />
      <path
        fill="#EA4335"
        d="M9 3.57955c1.32136 0 2.50773.45409 3.44045 1.34591l2.58136-2.58136C13.4632.891818 11.4259 0 9 0 5.48182 0 2.43818 2.01682.957273 4.95818l3.00682 2.33182C4.67182 5.16273 6.65591 3.57955 9 3.57955z"
      />
    </svg>
  );
}

export function MicrosoftLogo({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path fill="#F35325" d="M0 0h8.55v8.55H0z" />
      <path fill="#81BC06" d="M9.45 0H18v8.55H9.45z" />
      <path fill="#05A6F0" d="M0 9.45h8.55V18H0z" />
      <path fill="#FFBA08" d="M9.45 9.45H18V18H9.45z" />
    </svg>
  );
}
