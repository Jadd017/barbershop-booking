import { onAuthStateChanged, type User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { isGoogleUser } from '../data/auth';
import { auth } from '../data/firebase';

/**
 * The customer signed in with Google: undefined while Firebase is still checking,
 * null if nobody is (Eddy's email/password session doesn't count).
 */
export function useCustomer(): User | null | undefined {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => onAuthStateChanged(auth, (u) => setUser(isGoogleUser(u) ? u : null)), []);
  return user;
}
