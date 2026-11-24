import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import Loader from '@/components/ui/Loader';

interface AdminRouteProps {
  children: React.ReactNode;
}

/**
 * Protected route component for admin panel pages.
 * Allows full_admin, sub_admin, paper_admin, and coding_ta without causing redirect loops.
 */
const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <Loader fullScreen />;
  }

  if (!user) {
    return <Navigate to="/admin-login" replace />;
  }

  const allowedRoles = new Set(['full_admin', 'sub_admin', 'paper_admin', 'coding_ta']);
  const hasAdminPanelAccess = Boolean(
    user.is_admin || (user.admin_role && allowedRoles.has(user.admin_role))
  );

  if (!hasAdminPanelAccess) {
    return <Navigate to="/home" replace />;
  }

  return <>{children}</>;
};

export default AdminRoute;
