import { buttonDark, buttonOutline } from '../../ui';

interface Props {
  /** Why it can't be saved yet; Save is off while there are any. */
  errors: string[];
  /** Asked before saving (bookings the changes leave outside the hours); Save then says "Save anyway". */
  confirm: string | null;
  saveError: string | null;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
}

/** Discard / Save changes for a draft, fixed above the bottom bar while there are changes. */
export function SaveBar({ errors, confirm, saveError, saving, onSave, onDiscard }: Props) {
  return (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 border-t border-line bg-cream/95 backdrop-blur">
      <div className="mx-auto max-h-[50vh] max-w-xl overflow-y-auto px-4 py-3">
        {errors.length > 0 && (
          <ul role="alert" className="mb-3 list-disc pl-5 text-sm text-pole-red">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        {confirm && (
          <p role="alert" className="mb-3 text-sm font-semibold">
            {confirm}
          </p>
        )}
        {saveError && <p className="mb-3 text-sm text-pole-red">{saveError}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onDiscard} disabled={saving} className={buttonOutline}>
            Discard
          </button>
          <button type="button" onClick={onSave} disabled={saving || errors.length > 0} className={buttonDark}>
            {saving ? 'Saving…' : confirm ? 'Save anyway' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
