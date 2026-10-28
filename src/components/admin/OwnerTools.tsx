import { useState, type ReactNode } from 'react';
import type { Barber, ShopSettings, ShopStaffBooking } from '../../types';
import { MoveSheet } from './MoveSheet';
import { OwnerContext } from './session';

/** Gives the owner's pages "Move to another barber" on any booking, and shows the move sheet. */
export function OwnerTools({
  shop,
  barbers,
  children,
}: {
  shop: ShopSettings;
  barbers: Barber[];
  children: ReactNode;
}) {
  const [moving, setMoving] = useState<ShopStaffBooking | null>(null);
  return (
    <OwnerContext.Provider value={{ startMove: setMoving }}>
      {children}
      {moving && <MoveSheet shop={shop} barbers={barbers} booking={moving} onClose={() => setMoving(null)} />}
    </OwnerContext.Provider>
  );
}
