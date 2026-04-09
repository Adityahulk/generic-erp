import useAuthStore from '@/store/authStore';

export function usePermissions() {
  const user = useAuthStore((s) => s.user);
  const role = user?.role;

  return {
    canWrite: role !== 'ca' && role !== 'staff',
    canCreate: ['company_admin', 'branch_manager'].includes(role),
    canDelete: role === 'company_admin',
    isCA: role === 'ca',
    isAdmin: ['super_admin', 'company_admin'].includes(role),
  };
}
