import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import BulkImport from '@/components/BulkImport';
import {
  Plus, Loader2, Search, Download, Eye, Pencil, Truck, Upload,
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import api from '@/lib/api';
import { usePermissions } from '@/hooks/usePermissions';
import ReadOnlyBadge from '@/components/ReadOnlyBadge';
function useBranches() {
  return useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get('/branches').then((r) => r.data.branches),
  });
}

const PO_STATUS_BADGE = {
  draft: 'secondary',
  confirmed: 'default',
  received: 'success',
  cancelled: 'destructive',
};

export default function PurchaseList() {
  const { canWrite, isCA } = usePermissions();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('orders');
  const [importOpen, setImportOpen] = useState(false);
  const [poFilters, setPoFilters] = useState({
    page: 1, limit: 25, status: '', supplier_id: '', branch_id: '', date_from: '', date_to: '',
  });
  const [supplierSearch, setSupplierSearch] = useState('');
  const [receiptFilters, setReceiptFilters] = useState({ page: 1, limit: 25, branch_id: '', date_from: '', date_to: '' });
  const [supSheetOpen, setSupSheetOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [supForm, setSupForm] = useState({});

  const { data: branches } = useBranches();

  const { data: poData, isLoading: poLoading } = useQuery({
    queryKey: ['purchases', poFilters],
    queryFn: () => api.get('/purchases', { params: Object.fromEntries(Object.entries(poFilters).filter(([, v]) => v !== '')) }).then((r) => r.data),
    enabled: tab === 'orders',
  });

  const { data: recData, isLoading: recLoading } = useQuery({
    queryKey: ['purchase-receipts', receiptFilters],
    queryFn: () => api.get('/purchases/receipts', { params: Object.fromEntries(Object.entries(receiptFilters).filter(([, v]) => v !== '')) }).then((r) => r.data),
    enabled: tab === 'receipts',
  });

  const { data: suppliersForPo } = useQuery({
    queryKey: ['suppliers', 'all-po-filter'],
    queryFn: () => api.get('/suppliers', { params: { limit: 200 } }).then((r) => r.data.suppliers),
    enabled: tab === 'orders',
  });

  const { data: suppliersList } = useQuery({
    queryKey: ['suppliers', supplierSearch],
    queryFn: () => api.get('/suppliers', { params: { search: supplierSearch || undefined, limit: 200 } }).then((r) => r.data.suppliers),
    enabled: tab === 'suppliers',
  });

  const saveSupplier = useMutation({
    mutationFn: (payload) => (editingSupplier
      ? api.patch(`/suppliers/${editingSupplier.id}`, payload)
      : api.post('/suppliers', payload)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setSupSheetOpen(false);
      setEditingSupplier(null);
    },
  });

  const openNewSupplier = () => {
    setEditingSupplier(null);
    setSupForm({
      name: '', gstin: '', phone: '', email: '', address: '', state: '',
      bank_name: '', bank_account: '', ifsc_code: '', tcs_applicable: false, is_active: true,
    });
    setSupSheetOpen(true);
  };

  const openEditSupplier = (s) => {
    setEditingSupplier(s);
    setSupForm({
      name: s.name || '', gstin: s.gstin || '', phone: s.phone || '', email: s.email || '',
      address: s.address || '', state: s.state || '', bank_name: s.bank_name || '',
      bank_account: s.bank_account || '', ifsc_code: s.ifsc_code || '',
      tcs_applicable: !!s.tcs_applicable, is_active: s.is_active !== false,
    });
    setSupSheetOpen(true);
  };

  const downloadPoPdf = async (id, poNumber) => {
    try {
      const response = await api.get(`/purchases/${id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${poNumber.replace(/\//g, '-')}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('PDF download failed.');
    }
  };

  const pos = poData?.purchase_orders || [];
  const receipts = recData?.receipts || [];

  return (
    <AppLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-semibold">Purchases</h2>
          {isCA ? <ReadOnlyBadge /> : null}
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4 mr-2" /> Import
            </Button>
            <Button asChild>
              <Link to="/purchases/new"><Plus className="h-4 w-4 mr-2" /> New Purchase Order</Link>
            </Button>
          </div>
        )}
      </div>

      {canWrite && (
        <BulkImport
          type="purchases"
          open={importOpen}
          onOpenChange={setImportOpen}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['purchases'] });
            queryClient.invalidateQueries({ queryKey: ['purchase-receipts'] });
            queryClient.invalidateQueries({ queryKey: ['vehicles'] });
          }}
        />
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="orders">Purchase Orders</TabsTrigger>
          <TabsTrigger value="receipts">Goods Receipts</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
        </TabsList>

        <TabsContent value="orders">
          <div className="flex flex-col lg:flex-row gap-3 mb-4 flex-wrap">
            <Select
              className="w-40"
              value={poFilters.status}
              onChange={(e) => setPoFilters((f) => ({ ...f, page: 1, status: e.target.value }))}
            >
              <option value="">All status</option>
              <option value="draft">Draft</option>
              <option value="confirmed">Confirmed</option>
              <option value="received">Received</option>
              <option value="cancelled">Cancelled</option>
            </Select>
            <Select
              className="w-52"
              value={poFilters.supplier_id}
              onChange={(e) => setPoFilters((f) => ({ ...f, page: 1, supplier_id: e.target.value }))}
            >
              <option value="">All suppliers</option>
              {suppliersForPo?.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
            <Select
              className="w-44"
              value={poFilters.branch_id}
              onChange={(e) => setPoFilters((f) => ({ ...f, page: 1, branch_id: e.target.value }))}
            >
              <option value="">All branches</option>
              {branches?.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
            <Input
              type="date"
              className="w-40"
              value={poFilters.date_from}
              onChange={(e) => setPoFilters((f) => ({ ...f, page: 1, date_from: e.target.value }))}
            />
            <Input
              type="date"
              className="w-40"
              value={poFilters.date_to}
              onChange={(e) => setPoFilters((f) => ({ ...f, page: 1, date_to: e.target.value }))}
            />
          </div>
          <div className="bg-card rounded-lg border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {poLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
                ) : pos.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">No purchase orders</TableCell></TableRow>
                ) : pos.map((po) => (
                  <TableRow key={po.id}>
                    <TableCell className="font-mono text-xs">{po.po_number}</TableCell>
                    <TableCell>{formatDate(po.order_date)}</TableCell>
                    <TableCell>{po.supplier_name}</TableCell>
                    <TableCell>{po.branch_name}</TableCell>
                    <TableCell>{po.item_count}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(po.total)}</TableCell>
                    <TableCell>
                      <Badge variant={PO_STATUS_BADGE[po.status]}>{po.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1 flex-wrap">
                        <Button variant="ghost" size="sm" asChild title="View">
                          <Link to={`/purchases/${po.id}`}><Eye className="h-3.5 w-3.5" /></Link>
                        </Button>
                        {po.status === 'draft' && canWrite && (
                          <Button variant="ghost" size="sm" asChild title="Edit">
                            <Link to={`/purchases/${po.id}/edit`}><Pencil className="h-3.5 w-3.5" /></Link>
                          </Button>
                        )}
                        {po.status === 'confirmed' && canWrite && (
                          <Button variant="ghost" size="sm" asChild title="Receive">
                            <Link to={`/purchases/${po.id}/receive`}><Truck className="h-3.5 w-3.5" /></Link>
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => downloadPoPdf(po.id, po.po_number)} title="PDF">
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="receipts">
          <div className="flex flex-wrap gap-3 mb-4">
            <Select
              className="w-44"
              value={receiptFilters.branch_id}
              onChange={(e) => setReceiptFilters((f) => ({ ...f, page: 1, branch_id: e.target.value }))}
            >
              <option value="">All branches</option>
              {branches?.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
            <Input type="date" className="w-40" value={receiptFilters.date_from} onChange={(e) => setReceiptFilters((f) => ({ ...f, date_from: e.target.value }))} />
            <Input type="date" className="w-40" value={receiptFilters.date_to} onChange={(e) => setReceiptFilters((f) => ({ ...f, date_to: e.target.value }))} />
          </div>
          <div className="bg-card rounded-lg border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
                ) : receipts.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground">No receipts</TableCell></TableRow>
                ) : receipts.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.po_number}</TableCell>
                    <TableCell>{formatDate(r.received_date)}</TableCell>
                    <TableCell>{r.supplier_name}</TableCell>
                    <TableCell>{r.branch_name}</TableCell>
                    <TableCell><Badge variant={r.status === 'complete' ? 'success' : 'warning'}>{r.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="suppliers">
          <div className="flex justify-between mb-4">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search name or GSTIN..." value={supplierSearch} onChange={(e) => setSupplierSearch(e.target.value)} />
            </div>
            {canWrite && (
              <Button onClick={openNewSupplier}><Plus className="h-4 w-4 mr-2" /> Add supplier</Button>
            )}
          </div>
          <div className="bg-card rounded-lg border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>GSTIN</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!suppliersList?.length ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No suppliers</TableCell></TableRow>
                ) : suppliersList.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="font-mono text-xs">{s.gstin || '—'}</TableCell>
                    <TableCell>{s.phone || '—'}</TableCell>
                    <TableCell>{s.state || '—'}</TableCell>
                    <TableCell>{s.is_active ? 'Yes' : 'No'}</TableCell>
                    <TableCell className="text-right">
                      {canWrite ? (
                        <Button variant="ghost" size="sm" onClick={() => openEditSupplier(s)}>Edit</Button>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <Sheet open={supSheetOpen} onOpenChange={setSupSheetOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingSupplier ? 'Edit supplier' : 'New supplier'}</SheetTitle>
            <SheetDescription>GST and bank details for purchase orders and TCS.</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-3">
            <div><Label>Name *</Label><Input value={supForm.name} onChange={(e) => setSupForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>GSTIN</Label><Input value={supForm.gstin} onChange={(e) => setSupForm((f) => ({ ...f, gstin: e.target.value }))} /></div>
            <div><Label>Phone</Label><Input value={supForm.phone} onChange={(e) => setSupForm((f) => ({ ...f, phone: e.target.value }))} /></div>
            <div><Label>Email</Label><Input value={supForm.email} onChange={(e) => setSupForm((f) => ({ ...f, email: e.target.value }))} /></div>
            <div><Label>Address</Label><Input value={supForm.address} onChange={(e) => setSupForm((f) => ({ ...f, address: e.target.value }))} /></div>
            <div><Label>State</Label><Input value={supForm.state} onChange={(e) => setSupForm((f) => ({ ...f, state: e.target.value }))} placeholder="For GST comparison" /></div>
            <div><Label>Bank name</Label><Input value={supForm.bank_name} onChange={(e) => setSupForm((f) => ({ ...f, bank_name: e.target.value }))} /></div>
            <div><Label>Bank account</Label><Input value={supForm.bank_account} onChange={(e) => setSupForm((f) => ({ ...f, bank_account: e.target.value }))} /></div>
            <div><Label>IFSC</Label><Input value={supForm.ifsc_code} onChange={(e) => setSupForm((f) => ({ ...f, ifsc_code: e.target.value }))} /></div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!supForm.tcs_applicable} onChange={(e) => setSupForm((f) => ({ ...f, tcs_applicable: e.target.checked }))} />
              TCS applicable (0.1%)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={supForm.is_active !== false} onChange={(e) => setSupForm((f) => ({ ...f, is_active: e.target.checked }))} />
              Active
            </label>
            <Button
              className="w-full"
              disabled={!supForm.name?.trim() || saveSupplier.isPending}
              onClick={() => saveSupplier.mutate({
                name: supForm.name.trim(),
                gstin: supForm.gstin || undefined,
                phone: supForm.phone || undefined,
                email: supForm.email || undefined,
                address: supForm.address || undefined,
                state: supForm.state || undefined,
                bank_name: supForm.bank_name || undefined,
                bank_account: supForm.bank_account || undefined,
                ifsc_code: supForm.ifsc_code || undefined,
                tcs_applicable: !!supForm.tcs_applicable,
                is_active: supForm.is_active !== false,
              })}
            >
              {saveSupplier.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
