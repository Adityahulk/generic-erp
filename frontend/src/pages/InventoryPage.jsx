import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import BulkImport from '@/components/BulkImport';
import EmptyState from '@/components/EmptyState';
import SortableTableHead, { sortData } from '@/components/SortableTableHead';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { TableSkeleton } from '@/components/ui/skeleton';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import useTerms from '@/hooks/useTerms';
import useAuthStore from '@/store/authStore';
import {
  ArrowRightLeft, Boxes, ChevronLeft, ChevronRight, LayoutGrid, List, Loader2, Plus, Printer, Search, Upload,
} from 'lucide-react';

const STATUS_LABEL = {
  in_stock: 'In Stock',
  sold: 'Sold',
  transferred: 'Transferred',
  scrapped: 'Scrapped',
};

const UNIT_SUGGESTIONS = ['Pcs', 'Kg', 'Litre', 'Metre', 'Box', 'Set', 'Bag'];
const GST_OPTIONS = [0, 5, 12, 18, 28];

function useBranches() {
  return useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get('/branches').then((r) => r.data.branches),
  });
}

function useItems(filters) {
  return useQuery({
    queryKey: ['vehicles', filters],
    queryFn: () => api.get('/vehicles', { params: filters }).then((r) => r.data),
    keepPreviousData: true,
  });
}

function useFieldDefinitions() {
  return useQuery({
    queryKey: ['item-field-definitions'],
    queryFn: () => api.get('/vehicles/fields').then((r) => r.data.fields || []),
  });
}

const emptyForm = {
  item_name: '',
  sku: '',
  category: '',
  brand: '',
  unit_of_measure: 'Pcs',
  is_serialized: true,
  quantity_in_stock: 1,
  purchase_price: '',
  selling_price: '',
  hsn_code: '',
  default_gst_rate: 18,
  branch_id: '',
  notes: '',
  custom_fields: {},
};

function getStockLabel(item) {
  if (item.is_serialized) return item.status === 'in_stock' ? '1 unit' : 'Sold';
  return `${item.quantity_in_stock || 0} ${item.unit_of_measure || 'Pcs'}`;
}

function getStatus(item) {
  if (!item.is_serialized && Number(item.quantity_in_stock) > 0 && Number(item.quantity_in_stock) <= 5) {
    return { label: 'Low Stock', variant: 'warning' };
  }
  if (item.status === 'sold') return { label: 'Sold', variant: 'default' };
  return { label: 'In Stock', variant: 'success' };
}

function ItemFormSheet({ open, onOpenChange, branches, categories, fields }) {
  const user = useAuthStore((s) => s.user);
  const company = useAuthStore((s) => s.company);
  const terms = useTerms();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [skuState, setSkuState] = useState({ checking: false, available: null, message: '' });
  const [adhocKey, setAdhocKey] = useState('');
  const [adhocValue, setAdhocValue] = useState('');

  useEffect(() => {
    if (open) {
      setForm({
        ...emptyForm,
        branch_id: user?.branch_id || '',
        hsn_code: company?.default_hsn_code || '',
        default_gst_rate: Number(company?.default_gst_rate || 18),
      });
      setSkuState({ checking: false, available: null, message: '' });
      setError('');
    }
  }, [open, user?.branch_id, company?.default_hsn_code, company?.default_gst_rate]);

  const createMutation = useMutation({
    mutationFn: (payload) => api.post('/vehicles', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      onOpenChange(false);
      toast.success(`${terms.item} saved successfully`);
    },
    onError: (err) => setError(err.response?.data?.error || `Failed to save ${terms.item.toLowerCase()}`),
  });

  const setField = (key) => (e) => {
    const value = e?.target?.type === 'checkbox' ? e.target.checked : e?.target?.value;
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const setCustomField = (key, value) => {
    setForm((prev) => ({
      ...prev,
      custom_fields: {
        ...(prev.custom_fields || {}),
        [key]: value,
      },
    }));
  };

  const checkSku = async () => {
    if (!form.sku?.trim()) {
      setSkuState({ checking: false, available: null, message: '' });
      return;
    }
    setSkuState({ checking: true, available: null, message: '' });
    try {
      const { data } = await api.get('/vehicles/check-sku', { params: { sku: form.sku.trim() } });
      setSkuState({
        checking: false,
        available: data.available,
        message: data.available ? 'SKU is available' : 'SKU already exists',
      });
    } catch {
      setSkuState({ checking: false, available: null, message: 'Unable to verify SKU right now' });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      quantity_in_stock: form.is_serialized ? 1 : Number(form.quantity_in_stock || 1),
      purchase_price: Math.round(Number(form.purchase_price || 0) * 100),
      selling_price: Math.round(Number(form.selling_price || 0) * 100),
      default_gst_rate: Number(form.default_gst_rate || 18),
      sku: form.sku?.trim() || undefined,
      category: form.category?.trim() || undefined,
      brand: form.brand?.trim() || undefined,
      notes: form.notes?.trim() || undefined,
    };
    createMutation.mutate(payload);
  };

  const purchase = Number(form.purchase_price || 0);
  const selling = Number(form.selling_price || 0);
  const margin = selling - purchase;
  const marginPct = purchase > 0 ? (margin / purchase) * 100 : 0;

  const customEntries = Object.entries(form.custom_fields || {}).filter(([, value]) => value !== '');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{terms.addItem}</SheetTitle>
          <SheetDescription>Save a generic {terms.item.toLowerCase()} you can invoice right away.</SheetDescription>
        </SheetHeader>

        <form className="space-y-6 mt-6" onSubmit={handleSubmit}>
          {error && <p className="text-sm text-destructive bg-destructive/10 rounded-md p-3">{error}</p>}

          <section className="space-y-3">
            <h3 className="font-medium">Basic Details</h3>
            <div className="space-y-1.5">
              <Label>{terms.item} Name *</Label>
              <Input value={form.item_name} onChange={setField('item_name')} placeholder="e.g. Basmati Rice 5kg, iPhone 15 128GB Black" required />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{terms.itemCode}</Label>
                <Input value={form.sku} onChange={setField('sku')} onBlur={checkSku} placeholder="e.g. RICE-5KG, IPH15-128" />
                <p className="text-xs text-muted-foreground">Leave blank to skip. Must be unique if provided.</p>
                {skuState.message && (
                  <p className={`text-xs ${skuState.available ? 'text-emerald-600' : 'text-destructive'}`}>
                    {skuState.checking ? 'Checking SKU...' : skuState.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Input value={form.category} onChange={setField('category')} list="inventory-categories" placeholder="e.g. Electronics, Groceries, Services" />
                <datalist id="inventory-categories">
                  {categories.map((category) => <option key={category} value={category} />)}
                </datalist>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Brand / Manufacturer</Label>
              <Input value={form.brand} onChange={setField('brand')} placeholder="Optional" />
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="font-medium">Pricing</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Purchase Price (₹) *</Label>
                <Input type="number" min="0" step="0.01" value={form.purchase_price} onChange={setField('purchase_price')} required />
              </div>
              <div className="space-y-1.5">
                <Label>Selling Price (₹) *</Label>
                <Input type="number" min="0" step="0.01" value={form.selling_price} onChange={setField('selling_price')} required />
              </div>
            </div>
            <p className={`text-sm ${margin >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
              Margin: ₹{margin.toFixed(2)} ({Number.isFinite(marginPct) ? marginPct.toFixed(1) : '0.0'}%)
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="font-medium">Stock</h3>
            <div className="space-y-1.5">
              <Label>Unit of Measure</Label>
              <Input value={form.unit_of_measure} onChange={setField('unit_of_measure')} />
              <div className="flex flex-wrap gap-2">
                {UNIT_SUGGESTIONS.map((unit) => (
                  <Button key={unit} type="button" variant="outline" size="sm" onClick={() => setForm((prev) => ({ ...prev, unit_of_measure: unit }))}>
                    {unit}
                  </Button>
                ))}
              </div>
            </div>
            <label className="flex items-start gap-3 rounded-lg border border-border p-3">
              <input type="checkbox" checked={form.is_serialized} onChange={setField('is_serialized')} className="mt-1" />
              <div>
                <p className="font-medium">Track individually?</p>
                <p className="text-sm text-muted-foreground">
                  ON = individual unit like a laptop or machine. OFF = quantity tracked stock like bags, strips, or boxes.
                </p>
              </div>
            </label>
            {!form.is_serialized && (
              <div className="space-y-1.5">
                <Label>Quantity in Stock</Label>
                <Input type="number" min="1" value={form.quantity_in_stock} onChange={setField('quantity_in_stock')} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Branch</Label>
              <Select value={form.branch_id} onChange={setField('branch_id')}>
                <option value="">Select branch</option>
                {branches?.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </Select>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="font-medium">Tax Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>HSN Code</Label>
                <Input value={form.hsn_code} onChange={setField('hsn_code')} placeholder="e.g. 1006 for rice, 8517 for phones" />
                <p className="text-xs text-muted-foreground">Find your HSN code at cbic.gov.in</p>
              </div>
              <div className="space-y-1.5">
                <Label>Default GST Rate</Label>
                <Select value={String(form.default_gst_rate)} onChange={(e) => setForm((prev) => ({ ...prev, default_gst_rate: Number(e.target.value) }))}>
                  {GST_OPTIONS.map((rate) => <option key={rate} value={rate}>{rate}%</option>)}
                </Select>
              </div>
            </div>
          </section>

          {(fields.length > 0 || customEntries.length > 0) && (
            <section className="space-y-3">
              <h3 className="font-medium">Custom Fields</h3>
              {fields.map((field) => (
                <div key={field.id} className="space-y-1.5">
                  <Label>{field.field_label}{field.is_required ? ' *' : ''}</Label>
                  {field.field_type === 'dropdown' ? (
                    <Select value={form.custom_fields?.[field.field_key] || ''} onChange={(e) => setCustomField(field.field_key, e.target.value)}>
                      <option value="">Select</option>
                      {(field.field_options || []).map((option) => <option key={option} value={option}>{option}</option>)}
                    </Select>
                  ) : (
                    <Input
                      type={field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : 'text'}
                      value={form.custom_fields?.[field.field_key] || ''}
                      onChange={(e) => setCustomField(field.field_key, e.target.value)}
                    />
                  )}
                </div>
              ))}

              {customEntries.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {customEntries.map(([key, value]) => (
                    <Badge key={key} variant="secondary">{key}: {value}</Badge>
                  ))}
                </div>
              )}

              <div className="rounded-lg border border-dashed border-border p-3 space-y-2">
                <p className="text-sm font-medium">Add more details</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <Input placeholder="Field name" value={adhocKey} onChange={(e) => setAdhocKey(e.target.value)} />
                  <Input placeholder="Value" value={adhocValue} onChange={(e) => setAdhocValue(e.target.value)} />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (!adhocKey.trim() || !adhocValue.trim()) return;
                    setCustomField(adhocKey.trim().toLowerCase().replace(/\s+/g, '_'), adhocValue.trim());
                    setAdhocKey('');
                    setAdhocValue('');
                  }}
                >
                  Add detail
                </Button>
              </div>
            </section>
          )}

          <section className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={setField('notes')} placeholder="Internal notes about this item" />
          </section>

          <Button className="w-full" type="submit" disabled={createMutation.isPending || skuState.available === false}>
            {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save {terms.item}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function TransferDialog({ open, onOpenChange, item, branches }) {
  const terms = useTerms();
  const queryClient = useQueryClient();
  const [toBranch, setToBranch] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setToBranch('');
      setNotes('');
      setError('');
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: (payload) => api.post(`/vehicles/${item.id}/transfer`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      onOpenChange(false);
      toast.success('Stock transferred successfully');
    },
    onError: (err) => setError(err.response?.data?.error || 'Transfer failed'),
  });

  const availableBranches = branches?.filter((branch) => branch.id !== item?.branch_id) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Stock Transfer</DialogTitle>
          <DialogDescription>{item?.item_name || item?.make} {item?.sku ? `• ${item.sku}` : ''}</DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive bg-destructive/10 rounded-md p-2">{error}</p>}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>From Branch</Label>
            <Input value={item?.branch_name || '—'} disabled />
          </div>
          <div className="space-y-1.5">
            <Label>To Branch</Label>
            <Select value={toBranch} onChange={(e) => setToBranch(e.target.value)}>
              <option value="">Select branch</option>
              {availableBranches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={`Optional ${terms.item.toLowerCase()} transfer notes`} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!toBranch || mutation.isPending} onClick={() => mutation.mutate({ to_branch_id: toBranch, notes: notes || undefined })}>
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Transfer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function InventoryPage() {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const terms = useTerms();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [sortKey, setSortKey] = useState('');
  const [sortDir, setSortDir] = useState('asc');
  const [viewMode, setViewMode] = useState('table');
  const [filters, setFilters] = useState({ page: 1, limit: 25, branch_id: '', status: '', search: '', category: '' });
  const [searchInput, setSearchInput] = useState('');

  const { data: branches } = useBranches();
  const { data: fieldDefinitions = [] } = useFieldDefinitions();
  const { data, isLoading } = useItems(Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== '')));

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => ({ ...prev, page: 1, search: searchInput }));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const rawItems = data?.vehicles || [];
  const items = sortKey ? sortData(rawItems, sortKey, sortDir) : rawItems;
  const categories = useMemo(
    () => [...new Set(rawItems.map((item) => item.category).filter(Boolean))].sort(),
    [rawItems],
  );
  const summary = useMemo(() => {
    const inStock = rawItems.filter((item) => item.status === 'in_stock').length;
    const soldThisMonth = rawItems.filter((item) => item.status === 'sold').length;
    return { inStock, soldThisMonth, total: data?.total || 0 };
  }, [rawItems, data?.total]);

  const total = data?.total || 0;
  const totalPages = Math.ceil(total / filters.limit) || 1;
  const canManage = ['super_admin', 'company_admin', 'branch_manager'].includes(user?.role);

  const handleSort = (key, dir) => {
    setSortKey(key);
    setSortDir(dir);
  };

  return (
    <AppLayout>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-semibold">{terms.Items}</h2>
          <p className="text-sm text-muted-foreground">
            {summary.inStock} in stock · {summary.soldThisMonth} sold this month · {summary.total} total
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="icon" onClick={() => setViewMode((prev) => (prev === 'table' ? 'cards' : 'table'))}>
            {viewMode === 'table' ? <LayoutGrid className="h-4 w-4" /> : <List className="h-4 w-4" />}
          </Button>
          {selectedIds.size > 0 && (
            <Button variant="secondary" asChild>
              <a href={`/api/vehicles/barcodes/batch?ids=${Array.from(selectedIds).join(',')}&token=${token}`} target="_blank" rel="noreferrer">
                <Printer className="h-4 w-4 mr-2" /> Print Labels ({selectedIds.size})
              </a>
            </Button>
          )}
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-2" /> Import
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> {terms.addItem}
          </Button>
        </div>
      </div>

      <BulkImport
        type="vehicles"
        open={importOpen}
        onOpenChange={setImportOpen}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['vehicles'] })}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px_180px_220px] gap-3 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search by name, SKU, brand, category..." />
        </div>
        <Input value={filters.category} onChange={(e) => setFilters((prev) => ({ ...prev, page: 1, category: e.target.value }))} placeholder="Category" />
        <Select value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, page: 1, status: e.target.value }))}>
          <option value="">All Status</option>
          <option value="in_stock">In Stock</option>
          <option value="sold">Sold</option>
        </Select>
        <Select value={filters.branch_id} onChange={(e) => setFilters((prev) => ({ ...prev, page: 1, branch_id: e.target.value }))}>
          <option value="">All Branches</option>
          {branches?.map((branch) => (
            <option key={branch.id} value={branch.id}>{branch.name}</option>
          ))}
        </Select>
      </div>

      <div className="bg-card rounded-lg border border-border">
        {isLoading ? (
          <div className="p-4"><TableSkeleton rows={8} columns={8} /></div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title={`No ${terms.items.toLowerCase()} in inventory`}
            description={`Add your first ${terms.item.toLowerCase()} to get started.`}
            actionLabel={terms.addItem}
            onAction={() => setAddOpen(true)}
          />
        ) : viewMode === 'cards' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-4">
            {items.map((item) => {
              const status = getStatus(item);
              return (
                <div key={item.id} className="rounded-xl border border-border p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link to={`/vehicles/${item.id}`} className="font-semibold hover:text-primary">
                        {item.item_name || [item.make, item.model, item.variant].filter(Boolean).join(' ') || 'Untitled item'}
                      </Link>
                      {item.sku && <p className="text-xs text-muted-foreground font-mono mt-1">{item.sku}</p>}
                    </div>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {item.category && <Badge variant="secondary">{item.category}</Badge>}
                    {item.brand && <Badge variant="secondary">{item.brand}</Badge>}
                    <Badge variant="secondary">{item.unit_of_measure || 'Pcs'}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>{getStockLabel(item)}</span>
                    <span className="font-semibold">{formatCurrency(item.selling_price)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{item.branch_name || '—'}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <Table>
            <thead className="[&_tr]:border-b">
              <tr>
                <th className="h-10 px-3 w-10">
                  <input
                    type="checkbox"
                    checked={items.length > 0 && selectedIds.size === items.length}
                    onChange={(e) => setSelectedIds(e.target.checked ? new Set(items.map((item) => item.id)) : new Set())}
                  />
                </th>
                <SortableTableHead sortKey="item_name" currentSort={sortKey} currentDirection={sortDir} onSort={handleSort}>Name</SortableTableHead>
                <SortableTableHead sortKey="category" currentSort={sortKey} currentDirection={sortDir} onSort={handleSort}>Category</SortableTableHead>
                <SortableTableHead sortKey="unit_of_measure" currentSort={sortKey} currentDirection={sortDir} onSort={handleSort}>Unit</SortableTableHead>
                <SortableTableHead sortKey="quantity_in_stock" currentSort={sortKey} currentDirection={sortDir} onSort={handleSort}>Stock</SortableTableHead>
                <SortableTableHead sortKey="purchase_price" currentSort={sortKey} currentDirection={sortDir} onSort={handleSort} className="text-right">Purchase ₹</SortableTableHead>
                <SortableTableHead sortKey="selling_price" currentSort={sortKey} currentDirection={sortDir} onSort={handleSort} className="text-right">Selling ₹</SortableTableHead>
                <SortableTableHead sortKey="branch_name" currentSort={sortKey} currentDirection={sortDir} onSort={handleSort}>Branch</SortableTableHead>
                <th className="h-10 px-3 text-left font-medium text-muted-foreground">Status</th>
                {canManage && <th className="h-10 px-3 text-right font-medium text-muted-foreground">Actions</th>}
              </tr>
            </thead>
            <TableBody>
              {items.map((item) => {
                const status = getStatus(item);
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() => setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(item.id)) next.delete(item.id);
                          else next.add(item.id);
                          return next;
                        })}
                      />
                    </TableCell>
                    <TableCell>
                      <Link to={`/vehicles/${item.id}`} className="font-medium hover:text-primary">
                        {item.item_name || [item.make, item.model, item.variant].filter(Boolean).join(' ') || 'Untitled item'}
                      </Link>
                      {item.sku && <p className="text-xs text-muted-foreground font-mono mt-1">{item.sku}</p>}
                    </TableCell>
                    <TableCell>{item.category || '—'}</TableCell>
                    <TableCell>{item.unit_of_measure || 'Pcs'}</TableCell>
                    <TableCell>{getStockLabel(item)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(item.purchase_price)}</TableCell>
                    <TableCell className="text-right text-base font-semibold">{formatCurrency(item.selling_price)}</TableCell>
                    <TableCell>{item.branch_name || '—'}</TableCell>
                    <TableCell><Badge variant={status.variant}>{status.label}</Badge></TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="sm" asChild>
                            <Link to={`/vehicles/${item.id}`}>View</Link>
                          </Button>
                          {item.status === 'in_stock' && (
                            <Button variant="ghost" size="sm" onClick={() => { setSelectedItem(item); setTransferOpen(true); }}>
                              <ArrowRightLeft className="h-4 w-4 mr-1" /> Transfer
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border text-sm">
            <span className="text-muted-foreground">{total} {terms.items.toLowerCase()} total</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={filters.page <= 1} onClick={() => setFilters((prev) => ({ ...prev, page: prev.page - 1 }))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span>Page {filters.page} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={filters.page >= totalPages} onClick={() => setFilters((prev) => ({ ...prev, page: prev.page + 1 }))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <ItemFormSheet open={addOpen} onOpenChange={setAddOpen} branches={branches} categories={categories} fields={fieldDefinitions} />
      <TransferDialog open={transferOpen} onOpenChange={setTransferOpen} item={selectedItem} branches={branches} />
    </AppLayout>
  );
}
