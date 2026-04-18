import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AppLayout from '@/components/AppLayout';
import useTerms from '@/hooks/useTerms';
import api from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Loader2, Pencil, Printer } from 'lucide-react';

function useItemDetail(id) {
  return useQuery({
    queryKey: ['vehicle', id],
    queryFn: () => api.get(`/vehicles/${id}`).then((r) => r.data),
    enabled: !!id,
  });
}

function DetailRow({ label, value }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="py-2 border-b border-border/50 last:border-0">
      <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{label}</p>
      <p className="text-sm font-medium break-words">{value}</p>
    </div>
  );
}

function EditItemSheet({ open, onOpenChange, item }) {
  const terms = useTerms();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && item) {
      setForm({
        item_name: item.item_name || '',
        sku: item.sku || '',
        category: item.category || '',
        brand: item.brand || '',
        unit_of_measure: item.unit_of_measure || 'Pcs',
        quantity_in_stock: item.quantity_in_stock || 1,
        is_serialized: !!item.is_serialized,
        purchase_price: Number(item.purchase_price || 0) / 100,
        selling_price: Number(item.selling_price || 0) / 100,
        hsn_code: item.hsn_code || '',
        default_gst_rate: Number(item.default_gst_rate || 18),
        notes: item.notes || '',
      });
      setError('');
    }
  }, [open, item]);

  const mutation = useMutation({
    mutationFn: (payload) => api.patch(`/vehicles/${item.id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicle', item.id] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      onOpenChange(false);
    },
    onError: (err) => setError(err.response?.data?.error || 'Update failed'),
  });

  const setField = (key) => (e) => {
    const value = e?.target?.type === 'checkbox' ? e.target.checked : e?.target?.value;
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit {terms.item}</SheetTitle>
        </SheetHeader>
        <form
          className="space-y-4 mt-6"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate({
              ...form,
              quantity_in_stock: form.is_serialized ? 1 : Number(form.quantity_in_stock || 0),
              purchase_price: Math.round(Number(form.purchase_price || 0) * 100),
              selling_price: Math.round(Number(form.selling_price || 0) * 100),
              default_gst_rate: Number(form.default_gst_rate || 18),
            });
          }}
        >
          <div className="space-y-1.5">
            <Label>{terms.item} Name</Label>
            <Input value={form.item_name || ''} onChange={setField('item_name')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>SKU / Item Code</Label>
              <Input value={form.sku || ''} onChange={setField('sku')} />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Input value={form.category || ''} onChange={setField('category')} />
            </div>
            <div className="space-y-1.5">
              <Label>Brand</Label>
              <Input value={form.brand || ''} onChange={setField('brand')} />
            </div>
            <div className="space-y-1.5">
              <Label>Unit</Label>
              <Input value={form.unit_of_measure || ''} onChange={setField('unit_of_measure')} />
            </div>
            <div className="space-y-1.5">
              <Label>Purchase Price (₹)</Label>
              <Input type="number" min="0" step="0.01" value={form.purchase_price || ''} onChange={setField('purchase_price')} />
            </div>
            <div className="space-y-1.5">
              <Label>Selling Price (₹)</Label>
              <Input type="number" min="0" step="0.01" value={form.selling_price || ''} onChange={setField('selling_price')} />
            </div>
            {!form.is_serialized && (
              <div className="space-y-1.5">
                <Label>Quantity in Stock</Label>
                <Input type="number" min="0" value={form.quantity_in_stock || 0} onChange={setField('quantity_in_stock')} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>HSN Code</Label>
              <Input value={form.hsn_code || ''} onChange={setField('hsn_code')} />
            </div>
          </div>
          <label className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
            <input type="checkbox" checked={!!form.is_serialized} onChange={setField('is_serialized')} />
            <span className="text-sm">Track as individual unit</span>
          </label>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes || ''} onChange={setField('notes')} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button className="w-full" type="submit" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save {terms.item}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export default function VehicleDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const terms = useTerms();
  const [editOpen, setEditOpen] = useState(false);
  const { data, isLoading } = useItemDetail(id);

  const item = data?.vehicle;
  const customFields = item?.custom_fields && typeof item.custom_fields === 'object' ? Object.entries(item.custom_fields) : [];
  const margin = Number(item?.selling_price || 0) - Number(item?.purchase_price || 0);
  const statusLabel = item?.status === 'sold' ? 'Sold' : 'In Stock';

  return (
    <AppLayout>
      <div className="flex items-center justify-between gap-3 mb-6">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        {item && (
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4 mr-2" /> Edit
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : !item ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">{terms.Item} not found.</CardContent></Card>
      ) : (
        <>
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-semibold leading-tight">{item.item_name || [item.make, item.model, item.variant].filter(Boolean).join(' ')}</h1>
              <div className="flex flex-wrap gap-2 mt-3">
                {item.sku && <Badge variant="secondary" className="font-mono">{item.sku}</Badge>}
                {item.category && <Badge variant="secondary">{item.category}</Badge>}
                {item.brand && <Badge variant="secondary">{item.brand}</Badge>}
                {item.unit_of_measure && <Badge variant="secondary">{item.unit_of_measure}</Badge>}
                <Badge variant={item.status === 'sold' ? 'default' : 'success'}>{statusLabel}</Badge>
              </div>
            </div>
            <Button variant="outline" asChild>
              <a href={`/api/vehicles/${item.id}/label`} target="_blank" rel="noreferrer">
                <Printer className="h-4 w-4 mr-2" /> Print Label
              </a>
            </Button>
          </div>

          <Tabs defaultValue="details">
            <TabsList>
              <TabsTrigger value="details">Item Details</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="mt-4">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <Card>
                  <CardHeader><CardTitle>Overview</CardTitle></CardHeader>
                  <CardContent>
                    <DetailRow label="Purchase Price" value={formatCurrency(item.purchase_price)} />
                    <DetailRow label="Selling Price" value={formatCurrency(item.selling_price)} />
                    <DetailRow label="Margin" value={formatCurrency(margin)} />
                    <DetailRow label="Category" value={item.category} />
                    <DetailRow label="Brand" value={item.brand} />
                    <DetailRow label="Unit of Measure" value={item.unit_of_measure} />
                    <DetailRow label="HSN Code" value={item.hsn_code} />
                    <DetailRow label="GST Rate" value={item.default_gst_rate != null ? `${item.default_gst_rate}%` : null} />
                    <DetailRow label="SKU" value={item.sku} />
                    <DetailRow label="Status" value={statusLabel} />
                    <DetailRow label="Stock" value={item.is_serialized ? (item.status === 'in_stock' ? '1 unit' : 'Sold') : `${item.quantity_in_stock} ${item.unit_of_measure}`} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Additional Details</CardTitle></CardHeader>
                  <CardContent>
                    {customFields.length > 0 ? customFields.map(([key, value]) => (
                      <DetailRow key={key} label={key.replace(/_/g, ' ')} value={String(value)} />
                    )) : <p className="text-sm text-muted-foreground">No custom fields added for this {terms.item.toLowerCase()} yet.</p>}
                    <DetailRow label="Secondary ID" value={item.engine_number} />
                    <DetailRow label="Brand / Make" value={item.make} />
                    <DetailRow label="Model / Type" value={item.model} />
                    <DetailRow label="Variant / Spec" value={item.variant} />
                    <DetailRow label="Color" value={item.color} />
                    <DetailRow label="Year" value={item.year} />
                    <DetailRow label="Chassis / Legacy Code" value={item.chassis_number} />
                    <DetailRow label="RTO Number" value={item.rto_number} />
                    <DetailRow label="RTO Date" value={item.rto_date ? formatDate(item.rto_date) : null} />
                    <DetailRow label="Insurance Company" value={item.insurance_company} />
                    <DetailRow label="Insurance Number" value={item.insurance_number} />
                    <DetailRow label="Insurance Expiry" value={item.insurance_expiry ? formatDate(item.insurance_expiry) : null} />
                    <DetailRow label="Notes" value={item.notes} />
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="history" className="mt-4">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <Card>
                  <CardHeader><CardTitle>Transfers</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {(data.transfers || []).length === 0 ? (
                      <p className="text-sm text-muted-foreground">No stock transfers yet.</p>
                    ) : data.transfers.map((transfer) => (
                      <div key={transfer.id} className="rounded-lg border border-border p-3">
                        <p className="font-medium">{transfer.from_branch_name} → {transfer.to_branch_name}</p>
                        <p className="text-sm text-muted-foreground">{formatDate(transfer.transferred_at)}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Invoices</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {(data.invoices || []).length === 0 ? (
                      <p className="text-sm text-muted-foreground">No invoices linked yet.</p>
                    ) : data.invoices.map((invoice) => (
                      <Link key={invoice.id} to="/sales" className="block rounded-lg border border-border p-3 hover:bg-accent">
                        <p className="font-medium">{invoice.invoice_number}</p>
                        <p className="text-sm text-muted-foreground">{invoice.customer_name} · {formatCurrency(invoice.total)}</p>
                      </Link>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="documents" className="mt-4">
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Documents for this {terms.item.toLowerCase()} will appear here.
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}

      {item && <EditItemSheet open={editOpen} onOpenChange={setEditOpen} item={item} />}
    </AppLayout>
  );
}
