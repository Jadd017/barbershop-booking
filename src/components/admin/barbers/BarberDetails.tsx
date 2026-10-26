import { useState } from 'react';
import { MAX_BARBER_NAME_LENGTH, MIN_BARBER_NAME_LENGTH } from '../../../config';
import { store } from '../../../data/firebase';
import { saveBarber } from '../../../data/shop';
import type { Barber } from '../../../types';
import { buttonDark, inputBase } from '../../ui';
import { cardClass, Section } from '../settings/fields';

/** The barber's name, as customers see it (his initials come from it). Saved on its own. */
export function BarberDetails({ barber }: { barber: Barber }) {
  // Null while not edited, so a rename saved elsewhere shows up.
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const value = name ?? barber.name;
  const trimmed = value.trim();
  const changed = name !== null && trimmed !== barber.name;
  const invalid = trimmed.length < MIN_BARBER_NAME_LENGTH || trimmed.length > MAX_BARBER_NAME_LENGTH;

  async function save() {
    setMessage(null);
    setBusy(true);
    try {
      await saveBarber(store, { ...barber, name: trimmed });
      setName(null);
      setMessage({ error: false, text: 'Name saved. New bookings show it; past ones keep the old name.' });
    } catch (err) {
      console.error(err);
      setMessage({ error: true, text: "Couldn't save. Check your connection and try again." });
    }
    setBusy(false);
  }

  return (
    <Section title="Name">
      <div className={cardClass}>
        <input
          type="text"
          aria-label="Name"
          autoComplete="off"
          maxLength={MAX_BARBER_NAME_LENGTH}
          value={value}
          onChange={(e) => {
            setName(e.target.value);
            setMessage(null);
          }}
          className={`${inputBase} w-full`}
        />
        {changed && invalid && (
          <p className="mt-2 text-sm text-pole-red">
            The name must be {MIN_BARBER_NAME_LENGTH} to {MAX_BARBER_NAME_LENGTH} characters.
          </p>
        )}
        {message && (
          <p className={`mt-2 text-sm ${message.error ? 'text-pole-red' : 'text-ink'}`}>{message.text}</p>
        )}
        {changed && (
          <button type="button" onClick={save} disabled={busy || invalid} className={`${buttonDark} mt-3 w-full`}>
            {busy ? 'Saving…' : 'Save name'}
          </button>
        )}
      </div>
    </Section>
  );
}
