import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './components/AuthProvider';
import { ThemeProvider } from './components/ThemeProvider';
import { useAuth } from './components/auth-context';
import { Loader } from './components/UI';

const AuthPage = lazy(() => import('./pages/AuthPage').then((module) => ({ default: module.AuthPage })));
const Dashboard = lazy(() => import('./pages/Dashboard').then((module) => ({ default: module.Dashboard })));
const Conference = lazy(() => import('./pages/Conference').then((module) => ({ default: module.Conference })));
const ControlCenter = lazy(() => import('./pages/ControlCenter').then((module) => ({ default: module.ControlCenter })));
const Session = lazy(() => import('./pages/Session').then((module) => ({ default: module.Session })));
const DignitaryDirectory = lazy(() => import('./pages/DignitaryDirectory').then((module) => ({ default: module.DignitaryDirectory })));
const UserManagement = lazy(() => import('./pages/UserManagement').then((module) => ({ default: module.UserManagement })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((module) => ({ default: module.ProfilePage })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function ProtectedRoute({ children }) {
  const { session, loading } = useAuth();
  if (loading) return <Loader />;
  if (!session) return <Navigate to="/auth" />;
  return children;
}

function AdminRoute({ children }) {
  const { session, loading, profile } = useAuth();
  if (loading) return <Loader />;
  if (!session) return <Navigate to="/auth" />;
  if (profile?.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <Suspense fallback={<Loader />}>
              <Routes>
                <Route path="/auth" element={<AuthPage />} />
                <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
                <Route path="/dignitaries" element={<AdminRoute><DignitaryDirectory /></AdminRoute>} />
                <Route path="/conference/:confId/control-center" element={<AdminRoute><ControlCenter /></AdminRoute>} />
                <Route path="/conference/:confId" element={<ProtectedRoute><Conference /></ProtectedRoute>} />
                <Route path="/session/:sessionId" element={<ProtectedRoute><Session /></ProtectedRoute>} />
                <Route path="/users" element={<AdminRoute><UserManagement /></AdminRoute>} />
                <Route path="/users/:userId" element={<AdminRoute><ProfilePage /></AdminRoute>} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
