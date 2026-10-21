'use client';

import * as Icons from '@/lib/icons';
import { Reveal } from './Reveal';
import { FEATURES } from '@/content/marketing';

// Icon binding for content/marketing's `iconKey` field. Only the icons used
// by FEATURES.items are re-exported into `@/lib/icons` already; this map
// resolves the string key to the actual component at render time.
const ICON_MAP = {
  Layers:    Icons.Layers,
  GitBranch: Icons.GitBranch,
  Users:     Icons.Users,
  Activity:  Icons.Activity,
  Shield:    Icons.Shield,
  Zap:       Icons.Zap,
} as const;

// Tone keys map to a (text color, soft background) pair pulled from CSS vars.
// Keeping this here rather than in content/ — these are visual decisions, not
// copy. To rebrand the accent colors, edit the @theme block in globals.css.
const TONE: Record<string, { color: string; bg: string }> = {
  primary: { color: 'var(--color-primary)', bg: 'rgba(0, 82, 204, 0.12)' },
  epic:    { color: 'var(--color-epic)',    bg: 'rgba(101, 84, 192, 0.12)' },
  story:   { color: 'var(--color-story)',   bg: 'rgba(0, 184, 217, 0.12)' },
  success: { color: 'var(--color-success)', bg: 'rgba(54, 179, 126, 0.12)' },
  warning: { color: 'var(--color-warning)', bg: 'rgba(255, 171, 0, 0.14)' },
  bug:     { color: 'var(--color-bug)',     bg: 'rgba(222, 53, 11, 0.12)' },
};

function FeatureCard({
  feature,
  index,
}: {
  feature: typeof FEATURES.items[number];
  index: number;
}) {
  const Icon = ICON_MAP[feature.iconKey as keyof typeof ICON_MAP];
  const tone = TONE[feature.tone] ?? TONE.primary!;
  return (
    <Reveal delayMs={(index % 3) * 80} className="h-full">
      <div className="lift group h-full rounded-xl border border-border-subtle bg-surface-raised p-6 transition-colors hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5">
        <div
          className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg"
          style={{ backgroundColor: tone.bg, color: tone.color }}
        >
          <Icon size={20} />
        </div>
        <h3 className="mb-2 text-base font-semibold text-text">{feature.title}</h3>
        <p className="text-sm leading-relaxed text-text-subtle">{feature.body}</p>
      </div>
    </Reveal>
  );
}

export function FeaturesGrid() {
  return (
    <section className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              {FEATURES.eyebrow}
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-text sm:text-4xl">
              {FEATURES.title}
            </h2>
            <p className="mt-4 text-base text-text-subtle">{FEATURES.subhead}</p>
          </div>
        </Reveal>

        <div className="mt-16 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.items.map((f, i) => (
            <FeatureCard key={f.title} feature={f} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
