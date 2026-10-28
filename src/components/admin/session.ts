import type { User } from 'firebase/auth';
import { createContext, useContext } from 'react';
import type { Barber, ShopSettings, ShopStaffBooking, StaffMember } from '../../types';

/**
 * Who is using the staff pages, and the shop as it is now (live): the login, its staff doc, and
 * the barber it acts as. A barber only ever sees and changes this barber's bookings and schedule
 * (firestore.rules enforces it; the pages only ask for his). The owner is a barber too, and also
 * manages every barber and the shop.
 */
export interface StaffSession {
  user: User;
  staff: StaffMember;
  shop: ShopSettings;
  barber: Barber;
  /** Every barber, active or not, in display order. */
  barbers: Barber[];
  isOwner: boolean;
  onLogout: () => void;
}

/**
 * Set only for the owner: his extra action on any booking, moving it to another barber.
 * BookingActions offers it when this is there. The move sheet lives above the lists (OwnerTools),
 * so it stays open when the moved booking leaves its old barber's list.
 */
export const OwnerContext = createContext<{ startMove: (booking: ShopStaffBooking) => void } | null>(null);

export function useOwner() {
  return useContext(OwnerContext);
}
