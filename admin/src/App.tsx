import { Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/layout/ProtectedRoute";
import { DashboardPage } from "./pages/DashboardPage";
import { RoomsPage } from "./pages/RoomsPage";
import { BookingsPage } from "./pages/BookingsPage";
import { AssetsPage } from "./pages/AssetsPage";
import { ComplaintsPage } from "./pages/ComplaintsPage";
import { UsersPage } from "./pages/UsersPage";
import { AnnouncementsPage } from "./pages/AnnouncementsPage";
import { ReportsPage } from "./pages/ReportsPage";
import { SettingsPage } from "./pages/SettingsPage";

export default function App() {
  return (
    <Routes>
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/rooms" element={<RoomsPage />} />
        <Route path="/bookings" element={<BookingsPage />} />
        <Route path="/assets" element={<AssetsPage />} />
        <Route path="/complaints" element={<ComplaintsPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/announcements" element={<AnnouncementsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
