/**
 * Shared look of the site (classic barbershop): buttons, notices, labels. Colors and the
 * `caps` (Oswald, uppercase) and `barber-pole` utilities are defined in index.css.
 */
import type { ReactNode } from 'react';
import type { BookingStatus } from '../types';

// Every button is at least 44px tall, so it's easy to tap.
const button =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-2.5 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';

export const buttonDark = `${button} bg-charcoal text-cream hover:bg-ink`;
export const buttonBrass = `${button} bg-brass text-charcoal hover:bg-brass-light`;
export const buttonOutline = `${button} border border-line bg-card text-ink hover:border-muted`;
export const buttonDanger = `${button} bg-pole-red text-white hover:brightness-110`;
export const buttonDangerOutline = `${button} border border-pole-red/40 bg-card text-pole-red hover:bg-pole-red/5`;

/** A small text-style button or link, still 44px tall to tap. */
export const linkButton =
  'inline-flex min-h-11 items-center gap-1.5 px-1 text-sm font-semibold underline-offset-4 hover:underline';

export const inputBase =
  'min-h-11 rounded-xl border border-line bg-card px-3 py-2.5 text-ink outline-none focus:border-charcoal';

/** The red / cream / blue stripe across the top of customer pages. */
export function BarberPole() {
  return <div aria-hidden className="barber-pole" />;
}

/** "1 · SERVICE" */
export function StepLabel({ step, children }: { step: number; children: ReactNode }) {
  return (
    <h2 className="caps mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-charcoal text-xs text-brass-light">
        {step}
      </span>
      <span aria-hidden className="text-muted">
        ·
      </span>
      {children}
    </h2>
  );
}

/** A section heading in Oswald caps. */
export function SectionLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h2 className={`caps mb-3 text-sm font-semibold text-ink ${className}`}>{children}</h2>;
}

type Tone = 'error' | 'success' | 'warning';

const TONES: Record<Tone, string> = {
  error: 'border-pole-red/30 bg-pole-red/5 text-pole-red',
  success: 'border-whatsapp/30 bg-whatsapp/5 text-ink',
  warning: 'border-brass/50 bg-brass/10 text-ink',
};

export function Notice({
  tone,
  children,
  className = '',
}: {
  tone: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === 'success' ? 'status' : 'alert'}
      className={`rounded-xl border px-4 py-3 text-sm ${TONES[tone]} ${className}`}
    >
      {children}
    </div>
  );
}

/** A whole-page message (loading, errors) on the cream background. */
export function PageMessage({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return (
    <div className="min-h-screen">
      <BarberPole />
      <p className={`px-6 pt-16 text-center ${error ? 'text-pole-red' : 'text-muted-strong'}`}>
        {children}
      </p>
    </div>
  );
}

const STATUS: Record<BookingStatus, { label: string; dot: string }> = {
  booked: { label: 'Booked', dot: 'bg-pole-blue' },
  done: { label: 'Done', dot: 'bg-whatsapp' },
  'no-show': { label: 'No-show', dot: 'bg-pole-red' },
  cancelled: { label: 'Cancelled', dot: 'bg-muted' },
};

/** A booking's status as a colored dot plus its name (the text itself stays dark, for contrast). */
export function StatusChip({ status, label }: { status: BookingStatus; label?: string }) {
  const s = STATUS[status];
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-1 text-xs font-semibold text-ink">
      <span aria-hidden className={`h-2 w-2 rounded-full ${s.dot}`} />
      {label ?? s.label}
    </span>
  );
}
