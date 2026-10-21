import { BrowserRouter, Route, Routes } from 'react-router';
import { BookingPage } from './pages/BookingPage';
import { ManagePage } from './pages/ManagePage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<BookingPage />} />
        <Route path="/manage" element={<ManagePage />} />
      </Routes>
    </BrowserRouter>
  );
}
