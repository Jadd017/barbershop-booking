import type { User } from 'firebase/auth';

interface Props {
  customer: User;
  onSignOut: () => void;
}

/** "Signed in as …  Sign out", for the customer pages. */
export function AccountLine({ customer, onSignOut }: Props) {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-neutral-500">
      <span className="min-w-0 break-all">Signed in as {customer.email}</span>
      <button type="button" onClick={onSignOut} className="font-medium text-neutral-900 underline">
        Sign out
      </button>
    </p>
  );
}
