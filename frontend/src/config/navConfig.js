import {
  LayoutDashboard, Car, FileText, Landmark, Receipt,
  Clock, Settings,
  ShoppingCart, PackagePlus, PieChart, BarChart2,
} from 'lucide-react';

const ICON_MAP = {
  LayoutDashboard,
  Car,
  ShoppingCart,
  PackagePlus,
  FileText,
  Landmark,
  Receipt,
  BarChart2,
  Clock,
  Settings,
  PieChart,
};

/** Role → primary navigation (paths and icon keys). */
export const NAV_CONFIG = {
  company_admin: [
    { label: 'Dashboard', path: '/dashboard', icon: 'LayoutDashboard' },
    { label: 'Inventory', path: '/inventory', icon: 'Car' },
    { label: 'Sales', path: '/sales', icon: 'ShoppingCart' },
    { label: 'Purchases', path: '/purchases', icon: 'PackagePlus' },
    { label: 'Quotations', path: '/quotations', icon: 'FileText' },
    { label: 'Loans', path: '/loans', icon: 'Landmark' },
    { label: 'Expenses', path: '/expenses', icon: 'Receipt' },
    { label: 'Reports', path: '/reports', icon: 'BarChart2' },
    { label: 'Attendance', path: '/attendance', icon: 'Clock' },
    { label: 'Settings', path: '/settings', icon: 'Settings' },
  ],
  branch_manager: [
    { label: 'Dashboard', path: '/dashboard', icon: 'LayoutDashboard' },
    { label: 'Inventory', path: '/inventory', icon: 'Car' },
    { label: 'Sales', path: '/sales', icon: 'ShoppingCart' },
    { label: 'Quotations', path: '/quotations', icon: 'FileText' },
    { label: 'Loans', path: '/loans', icon: 'Landmark' },
    { label: 'Expenses', path: '/expenses', icon: 'Receipt' },
    { label: 'Attendance', path: '/attendance', icon: 'Clock' },
  ],
  ca: [
    { label: 'Finance Overview', path: '/ca/dashboard', icon: 'PieChart' },
    { label: 'Sales', path: '/sales', icon: 'ShoppingCart' },
    { label: 'Purchases', path: '/purchases', icon: 'PackagePlus' },
    { label: 'Quotations', path: '/quotations', icon: 'FileText' },
    { label: 'Expenses', path: '/expenses', icon: 'Receipt' },
    { label: 'Loans', path: '/loans', icon: 'Landmark' },
    { label: 'Reports & Filing', path: '/reports', icon: 'BarChart2' },
  ],
  staff: [
    { label: 'Dashboard', path: '/dashboard', icon: 'LayoutDashboard' },
    { label: 'Inventory', path: '/inventory', icon: 'Car' },
    { label: 'Sales', path: '/sales', icon: 'ShoppingCart' },
    { label: 'Quotations', path: '/quotations', icon: 'FileText' },
    { label: 'Attendance', path: '/attendance', icon: 'Clock' },
  ],
};

export function navItemsForRole(role) {
  const adminNav = NAV_CONFIG.company_admin;
  if (role === 'super_admin') {
    return adminNav.map((item) => ({
      to: item.path,
      label: item.label,
      icon: ICON_MAP[item.icon] || LayoutDashboard,
    }));
  }
  const raw = NAV_CONFIG[role] ?? NAV_CONFIG.staff;
  return raw.map((item) => ({
    to: item.path,
    label: item.label,
    icon: ICON_MAP[item.icon] || LayoutDashboard,
  }));
}
