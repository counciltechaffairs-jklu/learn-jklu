import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import Loader from '@/components/ui/Loader';
import AdminRoute from '@/components/guards/AdminRoute';
import { API } from '@/utils/api';
import { getPostLoginDestination } from '@/utils/postLoginRedirect';

// Lazy load heavy route views & WebGPU background shell
const AeroShards = lazy(() => import('@/components/layout/AeroShards'));
const MaintenanceMode = lazy(() => import('@/components/ui/MaintenanceMode'));
const HomePage = lazy(() => import('@/views/public/HomePage'));
const PastPapersPage = lazy(() => import('@/views/public/PastPapersPage'));
const Login = lazy(() => import('@/views/auth/Login'));
const AdminLogin = lazy(() => import('@/views/auth/AdminLogin'));
const Register = lazy(() => import('@/views/auth/Register'));
const StudentDashboard = lazy(() => import('@/views/student/StudentDashboard'));
const Profile = lazy(() => import('@/views/student/Profile'));
const AdminDashboard = lazy(() => import('@/views/admin/AdminDashboard'));
const FacultyDirectoryPage = lazy(() => import('@/views/public/FacultyDirectoryPage'));
const ClassroomPage = lazy(() => import('@/views/classroom/ClassroomPage'));

// Loading fallback component with editorial aesthetic
const LoadingFallback = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#FAF9F6] dark:bg-[#0A0A0C]">
      <Loader fullScreen />
    </div>
  );
};

// Manual code override: set to true only if you want to lock the entire frontend manually in code
const MANUAL_MAINTENANCE_MODE = false;
const MAINTENANCE_ADMIN_ACCESS_ID = 'cota-jklu';

function AppContent() {
  const { user, loading } = useAuth();
  const { theme } = useTheme();
  const location = useLocation();
  const [maintenanceState, setMaintenanceState] = useState<{
    checked: boolean;
    enabled: boolean;
    message: string;
  }>({
    checked: false,
    enabled: false,
    message: '',
  });

  useEffect(() => {
    let active = true;
    const fetchStatus = () => {
      API.client
        .get('/maintenance-status')
        .then((res) => {
          if (!active) return;
          setMaintenanceState({
            checked: true,
            enabled: Boolean(res.data?.maintenance_mode),
            message: String(res.data?.message || ''),
          });
        })
        .catch(() => {
          if (!active) return;
          setMaintenanceState((prev) => ({ ...prev, checked: true }));
        });
    };

    fetchStatus();
    const onStatusChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ enabled: boolean; message?: string }>).detail;
      if (detail) {
        setMaintenanceState({
          checked: true,
          enabled: Boolean(detail.enabled),
          message: detail.message || '',
        });
      } else {
        fetchStatus();
      }
    };
    window.addEventListener('maintenance-status-changed', onStatusChanged);
    return () => {
      active = false;
      window.removeEventListener('maintenance-status-changed', onStatusChanged);
    };
  }, []);

  if (loading || !maintenanceState.checked) {
    return <LoadingFallback />;
  }

  const isMaintenanceActive = MANUAL_MAINTENANCE_MODE || maintenanceState.enabled;

  if (isMaintenanceActive) {
    const accessId = new URLSearchParams(location.search).get('id');
    const hasAdminAccessId = accessId === MAINTENANCE_ADMIN_ACCESS_ID;

    return (
      <div className="min-h-screen bg-[#FAF9F6] dark:bg-[#0A0A0C] text-[#0A0A0C] dark:text-[#F5F4F0] transition-colors duration-300">
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            {/* Admin login during maintenance requires the special ?id=cota-jklu parameter */}
            <Route
              path="/admin-login"
              element={
                user?.is_admin ? (
                  <Navigate to="/admin" replace />
                ) : hasAdminAccessId ? (
                  <AdminLogin />
                ) : (
                  <MaintenanceMode message={maintenanceState.message} />
                )
              }
            />
            {/* Full admin remains reachable so admin can toggle maintenance off */}
            <Route
              path="/admin"
              element={
                user?.is_admin ? (
                  <AdminRoute>
                    <AdminDashboard />
                  </AdminRoute>
                ) : (
                  <MaintenanceMode message={maintenanceState.message} />
                )
              }
            />
            <Route
              path="/admin/*"
              element={
                user?.is_admin ? (
                  <AdminRoute>
                    <AdminDashboard />
                  </AdminRoute>
                ) : (
                  <MaintenanceMode message={maintenanceState.message} />
                )
              }
            />
            <Route
              path="/maintenance"
              element={<MaintenanceMode message={maintenanceState.message} />}
            />
            {/* Lock every other page to MaintenanceMode while active */}
            <Route
              path="*"
              element={<MaintenanceMode message={maintenanceState.message} />}
            />
          </Routes>
        </Suspense>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#FAF9F6] dark:bg-[#0A0A0C] text-[#0A0A0C] dark:text-[#F5F4F0] transition-colors duration-300">
      {/* Persistent, lazy-loaded WebGPU/Canvas2D background shell across routes */}
      <div className="fixed inset-0 z-0 opacity-60 dark:opacity-75 pointer-events-none">
        <Suspense fallback={null}>
          <AeroShards
            shardColor="#896ABD"
            accentColor="#E04F33"
            placement="full"
            material="glass"
            markers="plus"
            count={650}
            depthOfField={0.65}
            vignette={0.25}
            lightMode={theme === 'light'}
            speed={0.85}
            glow={0.35}
            grain={0.04}
          />
        </Suspense>
      </div>
      <div className="relative z-10">
      <AnimatePresence mode="wait">
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            {/* Landing page is unified at /home */}
            <Route
              path="/"
              element={<Navigate to="/home" replace />}
            />
            {/* Learn JKLU 2.0 Unified Home & Landing Page */}
            <Route
              path="/home"
              element={<HomePage />}
            />
            {/* Past Question Paper Archive */}
            <Route
              path="/past-papers"
              element={<PastPapersPage />}
            />
            <Route
              path="/papers"
              element={<Navigate to="/past-papers" replace />}
            />
            {/* Faculty & TA Directory + Course Classrooms */}
            <Route
              path="/faculty"
              element={<FacultyDirectoryPage />}
            />
            <Route
              path="/classroom"
              element={<ClassroomPage />}
            />
            <Route
              path="/classroom/:offeringId"
              element={<ClassroomPage />}
            />
            <Route
              path="/login"
              element={
                user ? (
                  <Navigate
                    to={getPostLoginDestination(user, new URLSearchParams(location.search).get('next'))}
                    replace
                  />
                ) : (
                  <Login />
                )
              }
            />
            <Route
              path="/register"
              element={
                user ? (
                  <Navigate
                    to={getPostLoginDestination(user, new URLSearchParams(location.search).get('next'))}
                    replace
                  />
                ) : (
                  <Register />
                )
              }
            />
            <Route
              path="/admin-login"
              element={
                user ? (
                  <Navigate to={user.is_admin ? "/admin" : user.admin_role === 'professor' ? "/faculty" : user.admin_role === 'ta' ? "/classroom" : user.admin_role === 'coding_ta' ? "/admin/coding-hour" : user.is_sub_admin ? "/admin/contests" : "/home"} replace />
                ) : (
                  <AdminLogin />
                )
              }
            />
            <Route
              path="/forgot-password"
              element={<Navigate to="/login" replace />}
            />
            {/* Protected routes - redirect to home if not logged in (login blocked for testing) */}
            <Route
              path="/dashboard"
              element={
                user && !user.is_admin && !user.is_sub_admin ? (
                  <StudentDashboard />
                ) : (
                  <Navigate to="/home" replace />
                )
              }
            />
            <Route
              path="/profile"
              element={
                user && !user.is_admin && !user.is_sub_admin ? (
                  <Profile />
                ) : (
                  <Navigate to="/home" replace />
                )
              }
            />
            {/* Admin route - protected with AdminRoute component */}
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminDashboard />
                </AdminRoute>
              }
            />
            {/* Also protect any /admin/* sub-routes */}
            <Route
              path="/admin/*"
              element={
                <AdminRoute>
                  <AdminDashboard />
                </AdminRoute>
              }
            />
            {/* Maintenance page cannot be visited when maintenance mode is OFF */}
            <Route path="/maintenance" element={<Navigate to="/" replace />} />
            {/* Catch all - redirect to landing page */}
            <Route
              path="*"
              element={
                user ? (
                  <Navigate to={user.is_admin ? "/admin" : "/home"} replace />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
          </Routes>
        </Suspense>
      </AnimatePresence>
      </div>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ErrorBoundary>
          <Router
            future={{
              v7_startTransition: true,
              v7_relativeSplatPath: true,
            }}
          >
            <AppContent />
          </Router>
        </ErrorBoundary>
      </AuthProvider>
      <Analytics />
    </ThemeProvider>
  );
}

export default App;
