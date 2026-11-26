import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import Loader from '@/components/ui/Loader';
import AdminRoute from '@/components/guards/AdminRoute';
import { API } from '@/utils/api';
import { getPostLoginDestination, setStoredAdminSecretSlug } from '@/utils/postLoginRedirect';
import PageBackdrop from '@/components/layout/PageBackdrop';

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

/**
 * SecretAdminGate
 * Verifies the URL slug (or ?id= param) against the backend's ADMIN_SECRET_PATH env var
 * via POST /admin-access/verify (never hardcoded in the frontend bundle).
 * Works identically in both normal mode and maintenance mode; invalid slugs silently fall back.
 */
const SecretAdminGate: React.FC<{
  maintenanceMode: boolean;
  maintenanceMessage: string;
  queryId?: string | null;
}> = ({ maintenanceMode, maintenanceMessage, queryId }) => {
  const { secretSlug } = useParams<{ secretSlug?: string }>();
  const { user } = useAuth();
  const candidate = String(queryId || secretSlug || '').trim();
  const [status, setStatus] = useState<'checking' | 'valid' | 'invalid'>(() => {
    if (!candidate || typeof window === 'undefined') return candidate ? 'checking' : 'invalid';
    try {
      const cached =
        sessionStorage.getItem('admin_secret_slug') ||
        localStorage.getItem('admin_secret_slug');
      if (cached && cached === candidate) {
        sessionStorage.setItem('admin_secret_slug', candidate);
        return 'valid';
      }
    } catch {}
    return 'checking';
  });

  useEffect(() => {
    if (!candidate) {
      setStatus('invalid');
      return;
    }
    if (typeof window === 'undefined') return;
    try {
      const cached =
        sessionStorage.getItem('admin_secret_slug') ||
        localStorage.getItem('admin_secret_slug');
      if (cached && cached === candidate) {
        sessionStorage.setItem('admin_secret_slug', candidate);
        setStatus('valid');
        return;
      }
    } catch {}

    let active = true;
    setStatus('checking');
    API.client
      .post('/admin-access/verify', { slug: candidate })
      .then((res) => {
        if (!active) return;
        if (res.data?.valid) {
          setStoredAdminSecretSlug(candidate);
          setStatus('valid');
        } else {
          setStatus('invalid');
        }
      })
      .catch(() => {
        if (!active) return;
        setStatus('invalid');
      });

    return () => {
      active = false;
    };
  }, [candidate]);

  if (status === 'checking') {
    return <LoadingFallback />;
  }

  if (status === 'invalid') {
    return maintenanceMode ? (
      <MaintenanceMode message={maintenanceMessage} />
    ) : (
      <Navigate to="/home" replace />
    );
  }

  if (user?.is_admin || user?.is_sub_admin) {
    return (
      <AdminRoute>
        <AdminDashboard />
      </AdminRoute>
    );
  }

  return <AdminLogin secretSlug={candidate} />;
};

function AppContent() {
  const { user, loading } = useAuth();
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
    const queryId = new URLSearchParams(location.search).get('id');

    return (
      <div className="min-h-screen bg-[#FAF9F6] text-[#0A0A0C]">
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            {/* Maintenance Mode: plain /admin and /admin-login are blocked; only /<ADMIN_SECRET_PATH> (or ?id=<secret>) unlocks admin */}
            <Route
              path="/admin-login"
              element={
                queryId ? (
                  <SecretAdminGate
                    maintenanceMode={true}
                    maintenanceMessage={maintenanceState.message}
                    queryId={queryId}
                  />
                ) : (
                  <MaintenanceMode message={maintenanceState.message} />
                )
              }
            />
            <Route
              path="/admin"
              element={<MaintenanceMode message={maintenanceState.message} />}
            />
            <Route
              path="/admin/*"
              element={<MaintenanceMode message={maintenanceState.message} />}
            />
            <Route
              path="/maintenance"
              element={<MaintenanceMode message={maintenanceState.message} />}
            />
            {/* Secret backend-env admin entry path: /<ADMIN_SECRET_PATH> */}
            <Route
              path="/:secretSlug"
              element={
                <SecretAdminGate
                  maintenanceMode={true}
                  maintenanceMessage={maintenanceState.message}
                />
              }
            />
            <Route
              path="/:secretSlug/*"
              element={
                <SecretAdminGate
                  maintenanceMode={true}
                  maintenanceMessage={maintenanceState.message}
                />
              }
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

  const isHomeRoute = location.pathname === '/' || location.pathname === '/home';

  return (
    <div className="relative min-h-screen bg-[#F8F7F4] text-[#0A0A0C]">
      {/* Full-page Light-mode AeroShards with obsidian/charcoal shard tint exclusively on Home; calm illustrated PageBackdrop on inner pages */}
      {isHomeRoute ? (
        <div className="fixed inset-0 z-0 opacity-75 pointer-events-none">
          <Suspense fallback={null}>
            <AeroShards
              shardColor="#1C1C26"
              accentColor="#E04F33"
              backgroundColor="#F5F3EE"
              placement="full"
              material="glass"
              markers="plus"
              count={650}
              depthOfField={0.65}
              vignette={0.28}
              lightMode={true}
              speed={0.85}
              glow={0.35}
              grain={0.04}
            />
          </Suspense>
        </div>
      ) : (
        <PageBackdrop pathname={location.pathname} isDark={false} />
      )}
      <div className="relative z-10">
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
            {/* Plain /admin and /admin-login never open directly — require backend ADMIN_SECRET_PATH */}
            <Route path="/admin-login" element={<Navigate to="/home" replace />} />
            <Route path="/admin" element={<Navigate to="/home" replace />} />
            <Route path="/admin/*" element={<Navigate to="/home" replace />} />
            <Route
              path="/forgot-password"
              element={<Navigate to="/login" replace />}
            />
            {/* Protected routes - redirect to home if not logged in */}
            <Route
              path="/dashboard"
              element={
                user && !user.is_admin && !user.is_sub_admin ? (
                  user.admin_role === 'professor' || user.is_professor ? (
                    <Navigate to="/classroom" replace />
                  ) : (
                    <StudentDashboard />
                  )
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
            {/* Maintenance page cannot be visited when maintenance mode is OFF */}
            <Route path="/maintenance" element={<Navigate to="/" replace />} />
            {/* Secret backend-env admin entry path: /<ADMIN_SECRET_PATH> */}
            <Route
              path="/:secretSlug"
              element={
                <SecretAdminGate
                  maintenanceMode={false}
                  maintenanceMessage=""
                />
              }
            />
            <Route
              path="/:secretSlug/*"
              element={
                <SecretAdminGate
                  maintenanceMode={false}
                  maintenanceMessage=""
                />
              }
            />
            {/* Catch all - redirect to landing page */}
            <Route
              path="*"
              element={<Navigate to="/home" replace />}
            />
          </Routes>
        </Suspense>
      </div>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <MotionConfig reducedMotion="user">
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
      </MotionConfig>
    </ThemeProvider>
  );
}

export default App;
