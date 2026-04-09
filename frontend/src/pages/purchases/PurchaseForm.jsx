import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Loader2, ArrowLeft, Plus, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import useAuthStore from '@/store/authStore';

const emptyLine = () => ({
  description: '',
  hsn_code: '8703',
  quantity: 1,
  unit_price_rupees: '',
  gst_rate: 28,
  is_vehicle: false,
  vd_chassis: '',
  vd_engine: '',
  vd_make: '',
  vd_model: '',
  vd_variant: '',
  vd_color: '',
  vd_year: '',
});

function rupeesToPaise(v) {
  const n = parseFloat(String(v).replace(/,/g, ''));
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}

export default function PurchaseForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [discountRupees, setDiscountRupees] = useState('');
  const [lines, setLines] = useState([emptyLine()]);
  const [supplierSheet, setSupplierSheet] = useState(false);
  const [newSup, setNewSup] = useState({ name: '', gstin: '', phone: '', state: '', tcs_applicable: false });

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get('/branches').then((r) => r.data.branches),
  });

  const { data: searchSuppliers } = useQuery({
    queryKey: ['suppliers', supplierSearch],
    queryFn: () => api.get('/suppliers', { params: { search: supplierSearch, limit: 30 } }).then((r) => r.data.suppliers),
    enabled: supplierSearch.length >= 1,
  });

  const { data: existing, isLoading } = useQuery({
    queryKey: ['purchase', id],
    queryFn: () => api.get(`/purchases/${id}`).then((r) => r.data),
    enabled: isEdit,
  });

  useEffect(() => {
    if (user?.branch_id) setBranchId((b) => b || user.branch_id);
  }, [user?.branch_id]);

  useEffect(() => {
    if (!existing?.purchase_order) return;
    const po = existing.purchase_order;
    setSupplierId(po.supplier_id);
    if (po.supplier_name) setSupplierSearch(po.supplier_name);
    setBranchId(po.branch_id);
    setOrderDate(String(po.order_date).split('T')[0]);
    setExpectedDate(po.expected_delivery_date ? String(po.expected_delivery_date).split('T')[0] : '');
    setNotes(po.notes || '');
    setDiscountRupees(po.discount ? (Number(po.discount) / 100).toString() : '');
    setLines(
      (existing.items || []).map((it) => {
        const vd = it.vehicle_data || {};
        const hasVd = vd && Object.keys(vd).length > 0;
        return {
          description: it.description,
          hsn_code: it.hsn_code || '8703',
          quantity: it.quantity,
          unit_price_rupees: (Number(it.unit_price) / 100).toString(),
          gst_rate: Number(it.igst_rate) > 0 ? Number(it.igst_rate) : Number(it.cgst_rate) * 2 || 28,
          is_vehicle: !!hasVd,
          vd_chassis: vd.chassis_number || '',
          vd_engine: vd.engine_number || '',
          vd_make: vd.make || '',
          vd_model: vd.model || '',
          vd_variant: vd.variant || '',
          vd_color: vd.color || '',
          vd_year: vd.year != null ? String(vd.year) : '',
        };
      }),
    );
  }, [existing]);

  const buildPayload = useCallback(() => {
    const discount = rupeesToPaise(discountRupees);
    const items = lines
      .filter((l) => l.description.trim())
      .map((l) => {
        const base = {
          description: l.description.trim(),
          hsn_code: l.hsn_code || '8703',
          quantity: Math.max(1, parseInt(l.quantity, 10) || 1),
          unit_price: rupeesToPaise(l.unit_price_rupees),
          gst_rate: Number(l.gst_rate) || 28,
        };
        if (l.is_vehicle && (l.vd_chassis || l.vd_engine)) {
          base.vehicle_data = {
            chassis_number: l.vd_chassis || undefined,
            engine_number: l.vd_engine || undefined,
            make: l.vd_make || undefined,
            model: l.vd_model || undefined,
            variant: l.vd_variant || undefined,
            color: l.vd_color || undefined,
            year: l.vd_year ? parseInt(l.vd_year, 10) : undefined,
          };
        }
        return base;
      });
    return {
      supplier_id: supplierId,
      branch_id: branchId,
      order_date: orderDate,
      expected_delivery_date: expectedDate || null,
      discount,
      notes: notes || undefined,
      items,
    };
  }, [lines, supplierId, branchId, orderDate, expectedDate, discountRupees, notes]);

  const createMut = useMutation({
    mutationFn: (body) => api.post('/purchases', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
    },
  });

  const updateMut = useMutation({
    mutationFn: (body) => api.patch(`/purchases/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['purchase', id] });
    },
  });

  const confirmMut = useMutation({
    mutationFn: (poId) => api.post(`/purchases/${poId}/confirm`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['purchase', id] });
    },
  });

  const createSupplierMut = useMutation({
    mutationFn: () => api.post('/suppliers', {
      name: newSup.name.trim(),
      gstin: newSup.gstin || undefined,
      phone: newSup.phone || undefined,
      state: newSup.state || undefined,
      tcs_applicable: newSup.tcs_applicable,
    }),
    onSuccess: (res) => {
      setSupplierId(res.data.id);
      setSupplierSheet(false);
      setNewSup({ name: '', gstin: '', phone: '', state: '', tcs_applicable: false });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
  });

  const saveDraft = async () => {
    const body = buildPayload();
    if (!body.supplier_id || !body.branch_id || !body.items.length) return;
    if (isEdit) {
      await updateMut.mutateAsync(body);
      navigate(`/purchases/${id}`);
    } else {
      const res = await createMut.mutateAsync(body);
      const poId = res.data.purchase_order?.id;
      if (poId) navigate(`/purchases/${poId}`);
    }
  };

  const saveAndConfirm = async () => {
    const body = buildPayload();
    if (!body.supplier_id || !body.branch_id || !body.items.length) return;
    if (isEdit) {
      await updateMut.mutateAsync(body);
      await confirmMut.mutateAsync(id);
      navigate(`/purchases/${id}`);
    } else {
      const res = await api.post('/purchases', body);
      const poId = res.data.purchase_order?.id;
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      if (poId) {
        await api.post(`/purchases/${poId}/confirm`);
        navigate(`/purchases/${poId}`);
      }
    }
  };

  const pending = createMut.isPending || updateMut.isPending || confirmMut.isPending;

  if (isEdit && isLoading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin" /></div>
      </AppLayout>
    );
  }

  if (isEdit && existing?.purchase_order?.status !== 'draft') {
    return (
      <AppLayout>
        <p className="text-destructive">Only draft orders can be edited.</p>
        <Button asChild className="mt-4"><Link to={`/purchases/${id}`}>View PO</Link></Button>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/purchases"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
        </Button>
        <h2 className="text-2xl font-semibold">{isEdit ? 'Edit purchase order' : 'New purchase order'}</h2>
      </div>

      <div className="space-y-8 max-w-5xl">
        <section className="bg-card border rounded-lg p-4 space-y-3">
          <h3 className="font-semibold">Supplier</h3>
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Search suppliers..."
              value={supplierSearch}
              onChange={(e) => setSupplierSearch(e.target.value)}
              className="max-w-xs"
            />
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-64">
              <option value="">Select supplier</option>
              {(searchSuppliers || []).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
            <Button type="button" variant="outline" size="sm" onClick={() => setSupplierSheet(true)}>Add new supplier</Button>
          </div>
        </section>

        <section className="bg-card border rounded-lg p-4 space-y-3">
          <h3 className="font-semibold">PO details</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Branch *</Label>
              <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">Select</option>
                {branches?.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Order date</Label>
              <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
            </div>
            <div>
              <Label>Expected delivery</Label>
              <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
            </div>
            <div>
              <Label>Discount (₹)</Label>
              <Input value={discountRupees} onChange={(e) => setDiscountRupees(e.target.value)} placeholder="0" />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </section>

        <section className="bg-card border rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold">Line items</h3>
            <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
              <Plus className="h-4 w-4 mr-1" /> Add row
            </Button>
          </div>
          <div className="space-y-4">
            {lines.map((line, idx) => (
              <div key={idx} className="border rounded-md p-3 space-y-2">
                <div className="flex flex-wrap gap-2 items-end">
                  <div className="flex-1 min-w-[200px]">
                    <Label className="text-xs">Description *</Label>
                    <Input value={line.description} onChange={(e) => {
                      const v = e.target.value;
                      setLines((ls) => ls.map((x, i) => (i === idx ? { ...x, description: v } : x)));
                    }} />
                  </div>
                  <div className="w-24">
                    <Label className="text-xs">HSN</Label>
                    <Input value={line.hsn_code} onChange={(e) => {
                      const v = e.target.value;
                      setLines((ls) => ls.map((x, i) => (i === idx ? { ...x, hsn_code: v } : x)));
                    }} />
                  </div>
                  <div className="w-20">
                    <Label className="text-xs">Qty</Label>
                    <Input type="number" min={1} value={line.quantity} onChange={(e) => {
                      const v = e.target.value;
                      setLines((ls) => ls.map((x, i) => (i === idx ? { ...x, quantity: v } : x)));
                    }} />
                  </div>
                  <div className="w-28">
                    <Label className="text-xs">Unit ₹</Label>
                    <Input value={line.unit_price_rupees} onChange={(e) => {
                      const v = e.target.value;
                      setLines((ls) => ls.map((x, i) => (i === idx ? { ...x, unit_price_rupees: v } : x)));
                    }} />
                  </div>
                  <div className="w-28">
                    <Label className="text-xs">GST %</Label>
                    <Select value={String(line.gst_rate)} onChange={(e) => {
                      const v = e.target.value;
                      setLines((ls) => ls.map((x, i) => (i === idx ? { ...x, gst_rate: Number(v) } : x)));
                    }}>
                      {[5, 12, 18, 28].map((r) => (
                        <option key={r} value={r}>{r}%</option>
                      ))}
                    </Select>
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={line.is_vehicle}
                    onChange={(e) => {
                      const v = e.target.checked;
                      setLines((ls) => ls.map((x, i) => (i === idx ? { ...x, is_vehicle: v } : x)));
                    }}
                  />
                  This is a vehicle (draft specs for GRN)
                </label>
                {line.is_vehicle && (
                  <div className="grid sm:grid-cols-3 gap-2 pl-4 border-l-2 border-primary/30">
                    {[
                      ['vd_chassis', 'Chassis'],
                      ['vd_engine', 'Engine'],
                      ['vd_make', 'Make'],
                      ['vd_model', 'Model'],
                      ['vd_variant', 'Variant'],
                      ['vd_color', 'Color'],
                      ['vd_year', 'Year'],
                    ].map(([k, lab]) => (
                      <div key={k}>
                        <Label className="text-xs">{lab}</Label>
                        <Input
                          value={line[k]}
                          onChange={(e) => {
                            const v = e.target.value;
                            setLines((ls) => ls.map((x, i) => (i === idx ? { ...x, [k]: v } : x)));
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={saveDraft} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save as draft
          </Button>
          <Button onClick={saveAndConfirm} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save & confirm
          </Button>
        </div>
      </div>

      <Sheet open={supplierSheet} onOpenChange={setSupplierSheet}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>New supplier</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            <Label>Name *</Label>
            <Input value={newSup.name} onChange={(e) => setNewSup((s) => ({ ...s, name: e.target.value }))} />
            <Label>GSTIN</Label>
            <Input value={newSup.gstin} onChange={(e) => setNewSup((s) => ({ ...s, gstin: e.target.value }))} />
            <Label>Phone</Label>
            <Input value={newSup.phone} onChange={(e) => setNewSup((s) => ({ ...s, phone: e.target.value }))} />
            <Label>State</Label>
            <Input value={newSup.state} onChange={(e) => setNewSup((s) => ({ ...s, state: e.target.value }))} />
            <label className="flex gap-2 text-sm items-center">
              <input type="checkbox" checked={newSup.tcs_applicable} onChange={(e) => setNewSup((s) => ({ ...s, tcs_applicable: e.target.checked }))} />
              TCS applicable
            </label>
            <Button
              className="w-full mt-4"
              disabled={!newSup.name.trim() || createSupplierMut.isPending}
              onClick={() => createSupplierMut.mutate()}
            >
              {createSupplierMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
