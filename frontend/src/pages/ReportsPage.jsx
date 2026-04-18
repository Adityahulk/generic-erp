import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AppLayout from '@/components/AppLayout';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import useTerms from '@/hooks/useTerms';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { FileSpreadsheet, TrendingUp, Package, Download, Loader2, Zap } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import ReadOnlyBadge from '@/components/ReadOnlyBadge';

function currentMonthRange() {
  const d = new Date();
  const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const to = last.toISOString().slice(0, 10);
  return { from, to };
}

function currentFYRange() {
  const d = new Date();
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const fyStartYear = month >= 4 ? year : year - 1;
  const fyEndYear = fyStartYear + 1;
  return { from: `${fyStartYear}-04-01`, to: `${fyEndYear}-03-31` };
}

function authDownload(path, filename) {
  const token = localStorage.getItem('access_token');
  const base = import.meta.env.VITE_API_URL || '/api';
  fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } })
    .then((r) => {
      if (!r.ok) throw new Error('Download failed');
      return r.blob();
    })
    .then((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    })
    .catch(() => {});
}

function CAQuickExports() {
  const now = new Date();
  const month = String(now.getMonth() + 1);
  const year = String(now.getFullYear());
  const { from: mFrom, to: mTo } = currentMonthRange();
  const { from: fyFrom, to: fyTo } = currentFYRange();

  return (
    <Card className="mb-6 border-amber-200/80 bg-amber-50/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-700" />
          Quick Export
        </CardTitle>
        <p className="text-xs text-muted-foreground font-normal">One-click downloads for filing and registers</p>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" className="bg-amber-100/80 hover:bg-amber-100 text-amber-950 border border-amber-300/60"
          onClick={() => authDownload(`/reports/gstr1/export?month=${month}&year=${year}`, `GSTR1_${year}_${month.padStart(2, '0')}.csv`)}>
          GSTR-1 This Month
        </Button>
        <Button type="button" variant="secondary" size="sm" className="bg-amber-100/80 hover:bg-amber-100 text-amber-950 border border-amber-300/60"
          onClick={() => authDownload(`/reports/gstr3b/export?month=${month}&year=${year}`, `GSTR3B_${year}_${month.padStart(2, '0')}.csv`)}>
          GSTR-3B Summary
        </Button>
        <Button type="button" variant="secondary" size="sm" className="bg-amber-100/80 hover:bg-amber-100 text-amber-950 border border-amber-300/60"
          onClick={() => authDownload(`/reports/purchase-register/export?from=${fyFrom}&to=${fyTo}`, 'Purchase_Register.xlsx')}>
          Purchase Register
        </Button>
        <Button type="button" variant="secondary" size="sm" className="bg-amber-100/80 hover:bg-amber-100 text-amber-950 border border-amber-300/60"
          onClick={() => authDownload(`/reports/sales-register/export?from=${fyFrom}&to=${fyTo}`, 'Sales_Register.xlsx')}>
          Sales Register
        </Button>
        <Button type="button" variant="secondary" size="sm" className="bg-amber-100/80 hover:bg-amber-100 text-amber-950 border border-amber-300/60"
          onClick={() => authDownload(`/reports/expenses/export?from=${mFrom}&to=${mTo}`, 'Expense_Report.xlsx')}>
          Expense Report
        </Button>
        <Button type="button" variant="secondary" size="sm" className="bg-amber-100/80 hover:bg-amber-100 text-amber-950 border border-amber-300/60"
          onClick={() => authDownload('/reports/pl-summary/pdf', 'PL_Summary_FY.pdf')}>
          P&L Summary This FY
        </Button>
      </CardContent>
    </Card>
  );
}

// ────────────────────────── GSTR-1 Tab ──────────────────────────

function GSTR1Tab() {
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['gstr1', month, year],
    queryFn: () => api.get(`/reports/gstr1?month=${month}&year=${year}`).then((r) => r.data),
    enabled: false,
  });

  const handleGenerate = () => refetch();

  const handleDownload = () => {
    const token = localStorage.getItem('access_token');
    const url = `${import.meta.env.VITE_API_URL || '/api'}/reports/gstr1/export?month=${month}&year=${year}`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `GSTR1_${year}_${month.padStart(2, '0')}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      });
  };

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const fmtPaise = (v) => `₹${(v / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label>Month</Label>
          <Select value={month} onChange={(e) => setMonth(e.target.value)} className="w-40">
            {months.map((m, i) => (
              <option key={i + 1} value={String(i + 1)}>{m}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Year</Label>
          <Select value={year} onChange={(e) => setYear(e.target.value)} className="w-28">
            {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map((y) => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
          </Select>
        </div>
        <Button onClick={handleGenerate} disabled={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Generate
        </Button>
        {data && (
          <Button variant="outline" onClick={handleDownload} className="gap-1.5">
            <Download className="h-4 w-4" /> Download CSV
          </Button>
        )}
      </div>

      {data && (
        <>
          {/* Totals */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard label="Total Invoices" value={data.totals.count} />
            <SummaryCard label="Taxable Value" value={fmtPaise(data.totals.taxable_value)} />
            <SummaryCard label="Total GST" value={fmtPaise(data.totals.cgst + data.totals.sgst + data.totals.igst)} />
            <SummaryCard label="Total Value" value={fmtPaise(data.totals.total)} />
          </div>

          {/* Section tables */}
          <GSTR1Section title="B2B (Customer with GSTIN)" data={data.b2b} fmtPaise={fmtPaise} />
          <GSTR1Section title="B2C Large (> ₹2.5L without GSTIN)" data={data.b2c_large} fmtPaise={fmtPaise} />
          <GSTR1Section title="B2C Small (≤ ₹2.5L without GSTIN)" data={data.b2c_small} fmtPaise={fmtPaise} />
        </>
      )}

      {!data && !isLoading && (
        <p className="text-sm text-muted-foreground text-center py-12">Select a month/year and click Generate</p>
      )}
    </div>
  );
}

function SummaryCard({ label, value }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold mt-0.5">{value}</p>
      </CardContent>
    </Card>
  );
}

function GSTR1Section({ title, data: section, fmtPaise }) {
  if (!section || section.invoices.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          {title}
          <Badge variant="secondary">{section.summary.count} invoices</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-1.5 font-medium text-muted-foreground">Invoice #</th>
                <th className="text-left py-1.5 font-medium text-muted-foreground">Date</th>
                <th className="text-left py-1.5 font-medium text-muted-foreground">Customer</th>
                <th className="text-left py-1.5 font-medium text-muted-foreground">GSTIN</th>
                <th className="text-right py-1.5 font-medium text-muted-foreground">Taxable</th>
                <th className="text-right py-1.5 font-medium text-muted-foreground">CGST</th>
                <th className="text-right py-1.5 font-medium text-muted-foreground">SGST</th>
                <th className="text-right py-1.5 font-medium text-muted-foreground">IGST</th>
                <th className="text-right py-1.5 font-medium text-muted-foreground">Total</th>
              </tr>
            </thead>
            <tbody>
              {section.invoices.map((inv, i) => (
                <tr key={i} className="border-b border-border/50">
                  <td className="py-1.5 font-mono text-xs">{inv.invoice_number}</td>
                  <td className="py-1.5">{formatDate(inv.invoice_date)}</td>
                  <td className="py-1.5">{inv.customer_name}</td>
                  <td className="py-1.5 font-mono text-xs">{inv.customer_gstin || '—'}</td>
                  <td className="py-1.5 text-right">{fmtPaise(inv.taxable_value)}</td>
                  <td className="py-1.5 text-right">{fmtPaise(inv.cgst)}</td>
                  <td className="py-1.5 text-right">{fmtPaise(inv.sgst)}</td>
                  <td className="py-1.5 text-right">{fmtPaise(inv.igst)}</td>
                  <td className="py-1.5 text-right font-medium">{fmtPaise(inv.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-medium">
                <td colSpan={4} className="py-1.5">Total</td>
                <td className="py-1.5 text-right">{fmtPaise(section.summary.taxable_value)}</td>
                <td className="py-1.5 text-right">{fmtPaise(section.summary.cgst)}</td>
                <td className="py-1.5 text-right">{fmtPaise(section.summary.sgst)}</td>
                <td className="py-1.5 text-right">{fmtPaise(section.summary.igst)}</td>
                <td className="py-1.5 text-right">{fmtPaise(section.summary.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ────────────────────────── Sales Summary Tab ──────────────────────────

function SalesSummaryTab() {
  const terms = useTerms();
  const now = new Date();
  const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const today = now.toISOString().split('T')[0];

  const [from, setFrom] = useState(firstDay);
  const [to, setTo] = useState(today);
  const [branchId, setBranchId] = useState('');

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get('/branches').then((r) => r.data.branches),
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['sales-summary', from, to, branchId],
    queryFn: () => {
      let url = `/reports/sales-summary?from=${from}&to=${to}`;
      if (branchId) url += `&branch_id=${branchId}`;
      return api.get(url).then((r) => r.data);
    },
    enabled: false,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label>From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <Label>To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <Label>Branch</Label>
          <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="w-44">
            <option value="">All Branches</option>
            {(branches || []).map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </Select>
        </div>
        <Button onClick={() => refetch()} disabled={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Generate
        </Button>
      </div>

      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard label="Total Invoices" value={data.summary.total_invoices} />
            <SummaryCard label="Total Sales" value={formatCurrency(data.summary.total_sales)} />
            <SummaryCard label="Total GST Collected" value={formatCurrency(data.summary.total_gst)} />
            <SummaryCard label="Total Profit" value={formatCurrency(data.summary.total_profit)} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Top Selling {terms.Items}</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-1.5 font-medium text-muted-foreground">{terms.Item}</th>
                      <th className="text-left py-1.5 font-medium text-muted-foreground">Category</th>
                      <th className="text-right py-1.5 font-medium text-muted-foreground">Sold</th>
                      <th className="text-right py-1.5 font-medium text-muted-foreground">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.top_vehicles || []).map((v, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-1.5">{v.item_name}</td>
                        <td className="py-1.5">{v.category || '—'}</td>
                        <td className="py-1.5 text-right">{v.sold_count}</td>
                        <td className="py-1.5 text-right">{formatCurrency(Number(v.revenue))}</td>
                      </tr>
                    ))}
                    {(data.top_vehicles || []).length === 0 && (
                      <tr><td colSpan={4} className="py-4 text-center text-muted-foreground">No data</td></tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Top Customers</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-1.5 font-medium text-muted-foreground">Customer</th>
                      <th className="text-right py-1.5 font-medium text-muted-foreground">Purchases</th>
                      <th className="text-right py-1.5 font-medium text-muted-foreground">Total Spent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.top_customers || []).map((c, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-1.5">
                          {c.name}
                          {c.phone && <span className="text-xs text-muted-foreground ml-1">({c.phone})</span>}
                        </td>
                        <td className="py-1.5 text-right">{c.purchase_count}</td>
                        <td className="py-1.5 text-right">{formatCurrency(Number(c.total_spent))}</td>
                      </tr>
                    ))}
                    {(data.top_customers || []).length === 0 && (
                      <tr><td colSpan={3} className="py-4 text-center text-muted-foreground">No data</td></tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>

          {/* Daily sales breakdown */}
          {(data.daily_sales || []).length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Daily Sales Breakdown</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-1.5 font-medium text-muted-foreground">Date</th>
                      <th className="text-right py-1.5 font-medium text-muted-foreground">Invoices</th>
                      <th className="text-right py-1.5 font-medium text-muted-foreground">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.daily_sales.map((d, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-1.5">{formatDate(d.date)}</td>
                        <td className="py-1.5 text-right">{d.count}</td>
                        <td className="py-1.5 text-right">{formatCurrency(Number(d.amount))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {!data && !isLoading && (
        <p className="text-sm text-muted-foreground text-center py-12">Select a date range and click Generate</p>
      )}
    </div>
  );
}

// ────────────────────────── Stock Aging Tab ──────────────────────────

const AGING_COLORS = {
  '0-30': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', badge: 'success', label: 'Fresh' },
  '31-60': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', badge: 'warning', label: 'Moderate' },
  '61-90': { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', badge: 'warning', label: 'Aging' },
  '90+': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', badge: 'destructive', label: 'Stale' },
};

function StockAgingTab() {
  const terms = useTerms();
  const { data, isLoading } = useQuery({
    queryKey: ['stock-aging'],
    queryFn: () => api.get('/reports/stock-aging').then((r) => r.data),
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <SummaryCard label="Total In Stock" value={data.total_in_stock} />
        {data.summary.map((s) => {
          const colors = AGING_COLORS[s.range] || {};
          return (
            <Card key={s.range} className={cn(colors.bg, colors.border, 'border')}>
              <CardContent className="pt-4 pb-3">
                <p className={cn('text-xs', colors.text)}>{s.range} days — {colors.label}</p>
                <p className={cn('text-lg font-bold mt-0.5', colors.text)}>{s.count}</p>
                <p className="text-xs text-muted-foreground">{formatCurrency(s.total_value)}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Detailed tables per bucket */}
      {Object.entries(data.buckets).map(([range, vehicles]) => {
        if (vehicles.length === 0) return null;
        const colors = AGING_COLORS[range] || {};

        return (
          <Card key={range}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                {range} Days
                <Badge variant={colors.badge}>{vehicles.length} {terms.items.toLowerCase()}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-1.5 font-medium text-muted-foreground">SKU</th>
                      <th className="text-left py-1.5 font-medium text-muted-foreground">{terms.Item}</th>
                      <th className="text-left py-1.5 font-medium text-muted-foreground">Category</th>
                      <th className="text-left py-1.5 font-medium text-muted-foreground">Branch</th>
                      <th className="text-right py-1.5 font-medium text-muted-foreground">Purchase Price</th>
                      <th className="text-right py-1.5 font-medium text-muted-foreground">Selling Price</th>
                      <th className="text-right py-1.5 font-medium text-muted-foreground">Days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehicles.map((v) => (
                      <tr key={v.id} className={cn('border-b border-border/50', v.days_in_stock > 90 && 'bg-red-50/50')}>
                        <td className="py-1.5 font-mono text-xs">{v.sku || v.chassis_number || '—'}</td>
                        <td className="py-1.5">{v.item_name || `${v.make || ''} ${v.model || ''} ${v.variant || ''}`.trim() || '—'}</td>
                        <td className="py-1.5">{v.category || '—'}</td>
                        <td className="py-1.5">{v.branch_name || '—'}</td>
                        <td className="py-1.5 text-right">{formatCurrency(Number(v.purchase_price))}</td>
                        <td className="py-1.5 text-right">{formatCurrency(Number(v.selling_price))}</td>
                        <td className={cn('py-1.5 text-right font-medium', colors.text)}>{v.days_in_stock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ────────────────────────── Main Reports Page ──────────────────────────

export default function ReportsPage() {
  const terms = useTerms();
  const [activeTab, setActiveTab] = useState('gstr1');
  const { isCA } = usePermissions();

  return (
    <AppLayout>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-semibold">Reports</h2>
            {isCA ? <ReadOnlyBadge /> : null}
          </div>
          <p className="text-sm text-muted-foreground">GST filing, sales analytics, and {terms.items.toLowerCase()} aging</p>
        </div>
      </div>

      {isCA ? <CAQuickExports /> : null}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="gstr1" className="gap-1.5">
            <FileSpreadsheet className="h-4 w-4" /> GSTR-1
          </TabsTrigger>
          <TabsTrigger value="sales" className="gap-1.5">
            <TrendingUp className="h-4 w-4" /> Sales Summary
          </TabsTrigger>
          <TabsTrigger value="aging" className="gap-1.5">
            <Package className="h-4 w-4" /> Stock Aging
          </TabsTrigger>
        </TabsList>

        <TabsContent value="gstr1"><GSTR1Tab /></TabsContent>
        <TabsContent value="sales"><SalesSummaryTab /></TabsContent>
        <TabsContent value="aging"><StockAgingTab /></TabsContent>
      </Tabs>
    </AppLayout>
  );
}
