import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 'standalone' = minimal self-contained build for our Docker image. Vercel
  // packages Next.js itself (and sets VERCEL=1 during its builds); forcing
  // standalone there breaks its post-build step (missing next-server.js.nft.json).
  output: process.env.VERCEL ? undefined : 'standalone',
  // Allow LAN-IP origins (mobile-on-same-Wi-Fi testing) + ngrok tunnels.
  // The 192.168.* / 10.* / 172.16-31.* patterns cover every standard
  // private subnet a home router or office network might hand out, so we
  // don't have to edit this for each tester's specific IP.
  allowedDevOrigins: [
    '*.ngrok-free.app',
    '192.168.*.*',
    '10.*.*.*',
    '172.16.*.*', '172.17.*.*', '172.18.*.*', '172.19.*.*',
    '172.20.*.*', '172.21.*.*', '172.22.*.*', '172.23.*.*',
    '172.24.*.*', '172.25.*.*', '172.26.*.*', '172.27.*.*',
    '172.28.*.*', '172.29.*.*', '172.30.*.*', '172.31.*.*',
  ],

  // ── Production log hygiene ─────────────────────────────────────────────────
  // Strip console.log / console.info / console.debug at build time in prod so
  // env values, dev-only traces, and verbose flow logs don't ship to end users.
  // console.error and console.warn are kept — ops needs to see real failures.
  // logger.info is already dev-only by its own check in lib/logger.ts.
  // ───────────────────────────────────────────────────────────────────────────
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
      ? { exclude: ['error', 'warn'] }
      : false,
  },

  // ── Dev console hygiene ────────────────────────────────────────────────────
  // Next 16 forwards the browser console to the terminal by default. To do that
  // it wraps console in the browser, which reattributes EVERY log line's source
  // to `forward-logs-shared.ts` — so our own component logs (OrgLayout, etc.)
  // stop pointing at their real files. We read logs in the browser console, not
  // the terminal, so turn the forwarding (and its console-wrapping) off.
  // Note: this does NOT silence Next's own `[Fast Refresh] rebuilding/done`
  // HMR lines — those are react-refresh, dev-only, with no config switch.
  // ───────────────────────────────────────────────────────────────────────────
  logging: {
    browserToTerminal: false,
  },
};

export default nextConfig;
