import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { ShopTheme } from './components/ShopTheme';
import { AdminPage } from './pages/AdminPage';
import { BookingPage } from './pages/BookingPage';
import { MyBookingsPage } from './pages/MyBookingsPage';

export default function App() {
  return (
    <BrowserRouter>
      <ShopTheme />
      <Routes>
        <Route path="/" element={<BookingPage />} />
        <Route path="/my-bookings" element={<MyBookingsPage />} />
        {/* Where the old code + phone lookup was, in case someone saved the link. */}
        <Route path="/manage" element={<Navigate to="/my-bookings" replace />} />
        <Route path="/admin" element={<AdminPage view="bookings" />} />
        <Route path="/admin/settings" element={<AdminPage view="settings" />} />
      </Routes>
    </BrowserRouter>
  );
}
