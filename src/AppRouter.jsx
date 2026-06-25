import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/AuthContext';
import AdminLayout from './layouts/AdminLayout';
import CalendarPage from './pages/CalendarPage';
import FreeMonthsPage from './pages/FreeMonthsPage';
import LoginPage from './pages/LoginPage';
import SignupsPage from './pages/SignupsPage';
import TicketDetailPage from './pages/TicketDetailPage';
import TicketsPage from './pages/TicketsPage';
import WorkshopDetailPage from './pages/WorkshopDetailPage';
import WorkshopsPage from './pages/WorkshopsPage';

function ProtectedRoute({ children }) {
  const { isLoggedIn, isAuthLoading } = useAuth();

  if (isAuthLoading) {
    return <div className="admin-loading">Checking session...</div>;
  }

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default function AppRouter() {
  return (
    <Routes>
      <Route element={<LoginPage />} path="/login" />
      <Route
        element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route element={<WorkshopsPage />} index />
        <Route element={<SignupsPage />} path="signups" />
        <Route element={<CalendarPage />} path="calendar" />
        <Route element={<FreeMonthsPage />} path="free-months" />
        <Route element={<TicketsPage />} path="tickets" />
        <Route element={<TicketDetailPage />} path="tickets/:ticketId" />
        <Route element={<WorkshopDetailPage />} path="workshops/:workshopId" />
      </Route>
      <Route element={<Navigate to="/" replace />} path="*" />
    </Routes>
  );
}
