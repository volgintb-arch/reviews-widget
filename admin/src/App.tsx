import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import Login from '@/routes/Login';
import Dashboard from '@/routes/Dashboard';
import Cities from '@/routes/Cities';
import CityForm from '@/routes/CityForm';
import Reviews from '@/routes/Reviews';
import Settings from '@/routes/Settings';
import Alerts from '@/routes/Alerts';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="cities" element={<Cities />} />
        <Route path="cities/new" element={<CityForm mode="create" />} />
        <Route path="cities/:slug/edit" element={<CityForm mode="edit" />} />
        <Route path="reviews" element={<Reviews />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
