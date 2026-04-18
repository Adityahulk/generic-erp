import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import useAuthStore from '@/store/authStore';
import useConfigStore from '@/store/configStore';

export default function ProtectedRoute({ allowedRoles }) {
  const { isAuthenticated, user, fetchUser } = useAuthStore();
  const loadConfig = useConfigStore((s) => s.loadConfig);
  const [loading, setLoading] = useState(!user && isAuthenticated);

  useEffect(() => {
    if (isAuthenticated && !user) {
      fetchUser().finally(() => setLoading(false));
    }
  }, [isAuthenticated, user, fetchUser]);

  useEffect(() => {
    if (isAuthenticated && user?.company_id && user.role !== 'ca') {
      loadConfig();
    }
  }, [isAuthenticated, user?.company_id, user?.role, loadConfig]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />;
}
