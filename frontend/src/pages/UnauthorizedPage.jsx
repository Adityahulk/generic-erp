import { Link } from 'react-router-dom';
import useAuthStore from '@/store/authStore';
import { Button } from '@/components/ui/button';

function homePathForRole(role) {
  if (role === 'ca') return '/ca/dashboard';
  if (role === 'staff') return '/my-attendance';
  if (role === 'branch_manager') return '/branch-dashboard';
  return '/dashboard';
}

function homeLabelForRole(role) {
  if (role === 'ca') return 'Go to Finance Overview';
  if (role === 'staff') return 'Go to Attendance';
  if (role === 'branch_manager') return 'Go to Branch Dashboard';
  return 'Go to Dashboard';
}

export default function UnauthorizedPage() {
  const user = useAuthStore((s) => s.user);
  const isCA = user?.role === 'ca';
  const role = user?.role;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted px-4">
      <h1 className="text-4xl font-bold mb-2">403</h1>
      {isCA ? (
        <>
          <p className="text-muted-foreground mb-2 max-w-md text-center">
            Access Restricted — This section is not available for CA accounts. If you need access, contact your company administrator.
          </p>
          <Button asChild>
            <Link to="/ca/dashboard">Go to Finance Overview</Link>
          </Button>
        </>
      ) : (
        <>
          <p className="text-muted-foreground mb-6">You don&apos;t have permission to access this page.</p>
          <Link
            to={homePathForRole(role)}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90"
          >
            {homeLabelForRole(role)}
          </Link>
        </>
      )}
    </div>
  );
}
