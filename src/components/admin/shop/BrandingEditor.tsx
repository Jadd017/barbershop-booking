import { CalendarDays, ImagePlus } from 'lucide-react';
import { useState, type ChangeEvent } from 'react';
import { store } from '../../../data/firebase';
import { saveBranding } from '../../../data/shop';
import { useBranding } from '../../../hooks/useShop';
import { brandingErrors, contrastWarnings, lighten } from '../../../lib/colors';
import { LogoTooLargeError } from '../../../lib/logo';
import { logoFromFile, NotAnImageError } from '../../../lib/logoImage';
import { defaultBranding, DEFAULT_COLORS } from '../../../lib/shopDoc';
import type { BrandColors, Branding } from '../../../types';
import { buttonDangerOutline, buttonDark, buttonOutline, linkButton, Notice } from '../../ui';
import { cardClass, Section } from '../settings/fields';

const COLOR_FIELDS: { key: keyof BrandColors; label: string; hint: string }[] = [
  { key: 'dark', label: 'Dark', hint: 'Header, text, main buttons' },
  { key: 'accent', label: 'Accent', hint: 'Highlights and the booking button' },
  { key: 'light', label: 'Background', hint: 'Page background' },
];

/**
 * The shop's logo and colors (settings/branding), saved on their own with a preview of the
 * customer page's header first. The logo is shrunk in the browser to under 100 KB (no Firebase
 * Storage on the free plan); "Remove logo" shows the shop name only.
 */
export function BrandingEditor({ shopName }: { shopName: string }) {
  const saved = useBranding();
  // Null while nothing is edited, so changes saved elsewhere show up live.
  const [draft, setDraft] = useState<Branding | null>(null);
  const [busy, setBusy] = useState<'logo' | 'save' | null>(null);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  const current = draft ?? saved ?? defaultBranding(null);
  const errors = draft ? brandingErrors(draft) : [];
  const warnings = contrastWarnings(current.colors);

  function edit(change: Partial<Branding>) {
    setDraft({ ...current, ...change });
    setMessage(null);
  }

  async function pickLogo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMessage(null);
    setBusy('logo');
    try {
      edit({ logo: await logoFromFile(file) });
    } catch (err) {
      setMessage({
        error: true,
        text:
          err instanceof NotAnImageError
            ? "That file isn't an image this browser can read. Try a PNG or JPEG."
            : err instanceof LogoTooLargeError
              ? "That image can't be made small enough. Try a simpler one."
              : "Couldn't read the image. Try another one.",
      });
      if (!(err instanceof NotAnImageError || err instanceof LogoTooLargeError)) console.error(err);
    }
    setBusy(null);
  }

  async function save() {
    if (!draft || errors.length > 0) return;
    setBusy('save');
    try {
      await saveBranding(store, draft);
      setDraft(null);
      setMessage({ error: false, text: 'Saved. Customers see the new look straight away.' });
    } catch (err) {
      console.error(err);
      setMessage({ error: true, text: "Couldn't save. Check your connection and try again." });
    }
    setBusy(null);
  }

  const { dark, accent, light } = current.colors;

  return (
    <Section title="Logo and colors" description="How the booking site looks. Saved on its own.">
      {/* What customers will see: the header of the booking page. */}
      <div aria-label="Preview" className="mb-3 overflow-hidden rounded-2xl border border-line" style={{ background: light }}>
        <div aria-hidden className="barber-pole" />
        <div className="flex items-start justify-between gap-3 px-4 pb-4 pt-3" style={{ background: dark, color: light }}>
          <div className="flex min-w-0 items-center gap-3">
            {current.logo && <img src={current.logo} alt="" className="h-14 w-14 shrink-0 rounded-xl object-contain" />}
            <span className="caps min-w-0 break-words text-2xl font-semibold tracking-[0.1em]">{shopName}</span>
          </div>
          <span
            className="caps inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium"
            style={{ borderColor: accent }}
          >
            <CalendarDays aria-hidden size={14} style={{ color: lighten(accent, 0.35) }} />
            My bookings
          </span>
        </div>
        <div className="px-4 py-3" style={{ color: dark }}>
          <p className="text-sm">Pick a service, a barber and a time.</p>
          <span
            className="caps mt-2 inline-flex min-h-10 items-center rounded-xl px-4 text-sm font-semibold"
            style={{ background: accent, color: dark }}
          >
            Book now
          </span>
        </div>
      </div>
      <p className="mb-3 text-xs text-muted-strong">Preview of the booking page{draft ? ' (not saved yet)' : ''}.</p>

      <div className={`${cardClass} grid gap-4`}>
        <div>
          <p className="mb-2 text-sm font-medium">Logo</p>
          <div className="flex flex-wrap gap-2">
            <label className={`${buttonOutline} cursor-pointer text-sm ${busy ? 'pointer-events-none opacity-50' : ''}`}>
              <ImagePlus aria-hidden size={18} />
              {busy === 'logo' ? 'Shrinking…' : current.logo ? 'Change logo' : 'Upload logo'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={pickLogo}
                disabled={busy !== null}
                className="sr-only"
              />
            </label>
            {current.logo && (
              <button type="button" onClick={() => edit({ logo: null })} disabled={busy !== null} className={`${buttonDangerOutline} text-sm`}>
                Remove logo
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-strong">
            PNG, JPEG or WebP. It's resized to fit 512 px and kept under 100 KB. Without a logo, the
            shop name is shown alone.
          </p>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Colors</p>
          <div className="grid gap-2">
            {COLOR_FIELDS.map(({ key, label, hint }) => (
              <label key={key} className="flex items-center gap-3">
                <input
                  type="color"
                  value={current.colors[key]}
                  onChange={(e) => edit({ colors: { ...current.colors, [key]: e.target.value.toUpperCase() } })}
                  className="h-11 w-14 shrink-0 cursor-pointer rounded-lg border border-line bg-card p-1"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">
                    {label} <span className="font-normal tabular-nums text-muted-strong">{current.colors[key]}</span>
                  </span>
                  <span className="block text-xs text-muted-strong">{hint}</span>
                </span>
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={() => edit({ colors: { ...DEFAULT_COLORS } })}
            className={`${linkButton} text-ink underline`}
          >
            Reset colors to defaults
          </button>
          {warnings.map((w) => (
            <Notice key={w} tone="warning" className="mt-2">
              {w}
            </Notice>
          ))}
        </div>

        {errors.map((e) => (
          <Notice key={e} tone="error">
            {e}
          </Notice>
        ))}
        {message && <Notice tone={message.error ? 'error' : 'success'}>{message.text}</Notice>}

        {draft && (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setDraft(null)} disabled={busy !== null} className={buttonOutline}>
              Discard
            </button>
            <button type="button" onClick={save} disabled={busy !== null || errors.length > 0} className={buttonDark}>
              {busy === 'save' ? 'Saving…' : 'Save look'}
            </button>
          </div>
        )}
      </div>
    </Section>
  );
}
