import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { ShopTheme } from './components/ShopTheme';
import { BookingPage } from './pages/BookingPage';
import { MyBookingsPage } from './pages/MyBookingsPage';
import { StaffPage } from './pages/StaffPage';

export default function App() {
  return (
    <BrowserRouter>
      <ShopTheme />
      <Routes>
        <Route path="/" element={<BookingPage />} />
        <Route path="/my-bookings" element={<MyBookingsPage />} />
        {/* Where the old code + phone lookup was, in case someone saved the link. */}
        <Route path="/manage" element={<Navigate to="/my-bookings" replace />} />
        <Route path="/admin" element={<StaffPage view="bookings" />} />
        <Route path="/admin/settings" element={<StaffPage view="settings" />} />
        <Route path="/admin/barbers" element={<StaffPage view="barbers" />} />
        <Route path="/admin/barbers/:barberId" element={<StaffPage view="barber" />} />
        <Route path="/admin/shop" element={<StaffPage view="shop" />} />
      </Routes>
    </BrowserRouter>
  );
}
