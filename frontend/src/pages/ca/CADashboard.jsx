import { useMemo } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import api from '@/lib/api';
import useAuthStore from '@/store/authStore';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Loader2, TrendingDown, TrendingUp, Download } from 'lucide-react';

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pctChange(cur, prev) {
  if (prev === 0) return cur > 0 ? 100 : 0;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

function TrendVsPrev({ cur, prev }) {
  const p = pctChange(cur, prev);
  const up = p >= 0;
  return (
    <span className={up ? 'text-emerald-600' : 'text-red-600'}>
      {up ? <TrendingUp className="inline h-3.5 w-3.5 mr-0.5" /> : <TrendingDown className="inline h-3.5 w-3.5 mr-0.5" />}
      {Math.abs(p).toFixed(1)}% vs last month
    </span>
  );
}

export default function CADashboard() {
  const user = useAuthStore((s) => s.user);
  const isCA = user?.role === 'ca';

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard', 'ca'],
    queryFn: () => api.get('/dashboard/ca').then((r) => r.data),
    enabled: isCA,
  });

  const topCategory = useMemo(() => {
    const rows = data?.expense_by_category_this_month || [];
    if (!rows.length) return null;
    return rows[0];
  }, [data]);

  if (user?.role === 'super_admin' || user?.role === 'company_admin') {
    return <Navigate to="/dashboard" replace />;
  }

  if (!isCA) {
    return <Navigate to="/unauthorized" replace />;
  }

  const exportGstrRow = (month, year) => {
    const token = localStorage.getItem('access_token');
    const base = import.meta.env.VITE_API_URL || '/api';
    const url = `${base}/reports/gstr1/export?month=${month}&year=${year}`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (!r.ok) throw new Error('Export failed');
        return r.blob();
      })
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `GSTR1_${year}_${String(month).padStart(2, '0')}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => {});
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (error || !data) {
    return (
      <AppLayout>
        <p className="text-center text-destructive py-12">Could not load finance overview.</p>
      </AppLayout>
    );
  }

  const { current_month: cm, previous_month: pm, this_fy: fy, pending_gstr1, overdue_loans } = data;
  const marginPct = cm.total_sales > 0 ? (cm.gross_profit / cm.total_sales) * 100 : 0;

  const chartData = (data.expense_by_category_this_month || []).map((r) => ({
    name: r.category,
    total: r.total / 100,
  }));

  const largeTx = data.recent_large_transactions || [];

  return (
    <AppLayout>
      <div className="rounded-md border border-amber-200/80 bg-amber-50 px-4 py-2.5 text-sm text-amber-950 mb-6">
        You are logged in as a CA (Read-Only). You can view and export all financial data.
      </div>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-semibold">Finance Overview</h2>
          <p className="text-sm text-muted-foreground">Company-wide metrics (all branches)</p>
        </div>
      </div>

      {/* Row 1 */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Sales</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(cm.total_sales)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              <TrendVsPrev cur={cm.total_sales} prev={pm.total_sales} />
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Purchases</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(cm.total_purchases)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              <TrendVsPrev cur={cm.total_purchases} prev={pm.total_purchases} />
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Gross Profit</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(cm.gross_profit)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Margin {marginPct.toFixed(1)}% · sales − purchases − expenses
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Net GST Liability</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(cm.net_gst_liability)}</p>
            <p className="text-xs text-muted-foreground mt-1">Collected − paid (this month)</p>
          </CardContent>
        </Card>
      </div>

      {/* Row 2 */}
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">This financial year — sales</CardTitle></CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{formatCurrency(fy.total_sales)}</p>
            <p className="text-xs text-muted-foreground mt-1">Purchases {formatCurrency(fy.total_purchases)} · GST collected {formatCurrency(fy.total_gst_collected)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Overdue loans</CardTitle></CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{overdue_loans.count} loans</p>
            <p className="text-sm text-muted-foreground mt-1">
              Overdue {formatCurrency(overdue_loans.total_overdue_amount)} · Penalty accrued {formatCurrency(overdue_loans.total_penalty_accrued)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Total expenses (this month)</CardTitle></CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{formatCurrency(cm.total_expenses)}</p>
            {topCategory && (
              <p className="text-xs text-muted-foreground mt-1">
                Top category: <span className="font-medium text-foreground">{topCategory.category}</span> ({formatCurrency(topCategory.total)})
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3 — GSTR-1 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">GSTR-1 Filing Summary (Last 3 Months)</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Invoices</TableHead>
                <TableHead className="text-right">B2B</TableHead>
                <TableHead className="text-right">B2C</TableHead>
                <TableHead className="text-right">Taxable Value</TableHead>
                <TableHead className="text-right">GST</TableHead>
                <TableHead className="text-right">Export CSV</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending_gstr1.map((row) => (
                <TableRow key={`${row.year}-${row.month}`}>
                  <TableCell>{MONTHS[row.month]} {row.year}</TableCell>
                  <TableCell className="text-right">{row.invoice_count}</TableCell>
                  <TableCell className="text-right">{row.b2b_count}</TableCell>
                  <TableCell className="text-right">{row.b2c_count}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.total_taxable_value)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.total_tax)}</TableCell>
                  <TableCell className="text-right">
                    <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => exportGstrRow(row.month, row.year)}>
                      <Download className="h-3.5 w-3.5" /> GSTR-1 CSV
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Row 4 */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Expense breakdown (this month)</CardTitle></CardHeader>
          <CardContent className="h-72">
            {chartData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">No expenses this month</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tickFormatter={(v) => `₹${v.toLocaleString('en-IN')}`} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => [`₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 'Total']} />
                  <Bar dataKey="total" fill="#d97706" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Recent large transactions</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {largeTx.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No data</TableCell></TableRow>
                ) : (
                  largeTx.map((t) => (
                    <TableRow key={`${t.type}-${t.source_id}`}>
                      <TableCell>
                        <Badge variant={t.type === 'sale' ? 'default' : 'secondary'}>
                          {t.type === 'sale' ? 'Sale' : 'Purchase'}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{t.reference}</TableCell>
                      <TableCell>{formatDate(t.txn_date)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(Number(t.amount))}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground mt-3">
              Top 10 invoices and purchase orders this month by value.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 text-center">
        <Button variant="link" asChild>
          <Link to="/reports">Open Reports &amp; Filing</Link>
        </Button>
      </div>
    </AppLayout>
  );
}
