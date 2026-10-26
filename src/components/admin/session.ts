import type { User } from 'firebase/auth';
import type { Barber, ShopSettings, StaffMember } from '../../types';

/**
 * Who is using the staff pages, and the shop as it is now (live): the login, its staff doc, and
 * the barber it acts as. A barber only ever sees and changes this barber's bookings and schedule
 * (firestore.rules enforces it; the pages only ask for his).
 */
export interface StaffSession {
  user: User;
  staff: StaffMember;
  shop: ShopSettings;
  barber: Barber;
  onLogout: () => void;
}
