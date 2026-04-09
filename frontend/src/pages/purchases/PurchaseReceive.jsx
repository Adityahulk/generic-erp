import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, ArrowLeft } from 'lucide-react';
import api from '@/lib/api';

function rupeesToPaise(v) {
  const n = parseFloat(String(v).replace(/,/g, ''));
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}

function paiseToRupees(p) {
  return p == null ? '' : (Number(p) / 100).toString();
}

export default function PurchaseReceive() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['purchase', id],
    queryFn: () => api.get(`/purchases/${id}`).then((r) => r.data),
  });

  const [lines, setLines] = useState([]);
  const [recvNotes, setRecvNotes] = useState('');
  const [chassisOk, setChassisOk] = useState({});

  useEffect(() => {
    if (!data?.items) return;
    setLines(
      data.items.map((it) => {
        const vd = it.vehicle_data || {};
        const remaining = Math.max(0, Number(it.quantity) - Number(it.qty_received || 0));
        return {
          purchase_order_item_id: it.id,
          maxReceive: remaining,
          quantity_received: remaining > 0 ? 1 : 0,
          vehicle_data: {
            chassis_number: vd.chassis_number || '',
            engine_number: vd.engine_number || '',
            make: vd.make || '',
            model: vd.model || '',
            variant: vd.variant || '',
            color: vd.color || '',
            year: vd.year != null ? String(vd.year) : '',
            purchase_price: paiseToRupees(it.unit_price),
          },
        };
      }),
    );
  }, [data]);

  const checkChassis = async (chassis, lineIdx) => {
    const c = String(chassis || '').trim();
    if (!c) {
      setChassisOk((m) => ({ ...m, [lineIdx]: null }));
      return;
    }
    try {
      const { data: r } = await api.get('/vehicles/check-chassis', { params: { chassis_number: c } });
      setChassisOk((m) => ({ ...m, [lineIdx]: r.available ? 'ok' : 'dup' }));
    } catch {
      setChassisOk((m) => ({ ...m, [lineIdx]: null }));
    }
  };

  const receiveMut = useMutation({
    mutationFn: (body) => api.post(`/purchases/${id}/receive`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['purchase', id] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      navigate(`/purchases/${id}`);
    },
  });

  const submit = () => {
    const items = lines
      .filter((l) => l.maxReceive > 0 && Number(l.quantity_received) > 0)
      .map((l) => ({
        purchase_order_item_id: l.purchase_order_item_id,
        quantity_received: Number(l.quantity_received),
        vehicle_data: {
          chassis_number: l.vehicle_data.chassis_number || undefined,
          engine_number: l.vehicle_data.engine_number || undefined,
          make: l.vehicle_data.make || undefined,
          model: l.vehicle_data.model || undefined,
          variant: l.vehicle_data.variant || undefined,
          color: l.vehicle_data.color || undefined,
          year: l.vehicle_data.year ? parseInt(l.vehicle_data.year, 10) : undefined,
          purchase_price: rupeesToPaise(l.vehicle_data.purchase_price),
        },
      }));
    if (!items.length) return;
    receiveMut.mutate({ items, notes: recvNotes || undefined });
  };

  if (isLoading || !data) {
    return (
      <AppLayout>
        <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin" /></div>
      </AppLayout>
    );
  }

  if (data.purchase_order.status !== 'confirmed') {
    return (
      <AppLayout>
        <p className="text-destructive">Only confirmed POs can be received.</p>
        <Button asChild className="mt-4"><Link to={`/purchases/${id}`}>Back</Link></Button>
      </AppLayout>
    );
  }

  const hasReceivable = (data.items || []).some(
    (it) => Number(it.quantity) > Number(it.qty_received || 0),
  );
  if (!hasReceivable) {
    return (
      <AppLayout>
        <p className="text-muted-foreground">All lines on this PO are fully received.</p>
        <Button asChild className="mt-4"><Link to={`/purchases/${id}`}>Back to PO</Link></Button>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to={`/purchases/${id}`}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
        </Button>
        <h2 className="text-2xl font-semibold">Goods receipt — {data.purchase_order.po_number}</h2>
      </div>

      <p className="text-sm text-muted-foreground mb-6">
        Enter quantities to receive now. For vehicle lines, chassis and engine are required; a stock unit will be created automatically.
      </p>

      <div className="space-y-6 max-w-4xl">
        {lines.map((line, idx) => {
          const poItem = data.items.find((x) => x.id === line.purchase_order_item_id);
          if (!poItem || line.maxReceive <= 0) return null;
          return (
            <div key={line.purchase_order_item_id} className="bg-card border rounded-lg p-4 space-y-3">
              <div className="font-medium">{poItem.description}</div>
              <p className="text-xs text-muted-foreground">
                Ordered: {poItem.quantity} · Already received: {poItem.qty_received || 0} · Can receive up to: {line.maxReceive}
              </p>
              <div className="w-40">
                <Label>Quantity to receive now</Label>
                <Input
                  type="number"
                  min={1}
                  max={line.maxReceive}
                  value={line.quantity_received}
                  onChange={(e) => {
                    const v = e.target.value;
                    setLines((ls) => ls.map((x, i) => (i === idx ? { ...x, quantity_received: v } : x)));
                  }}
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                <div>
                  <Label>Chassis *</Label>
                  <Input
                    value={line.vehicle_data.chassis_number}
                    onChange={(e) => {
                      const v = e.target.value;
                      setLines((ls) => ls.map((x, i) => (i === idx ? { ...x, vehicle_data: { ...x.vehicle_data, chassis_number: v } } : x)));
                    }}
                    onBlur={() => checkChassis(line.vehicle_data.chassis_number, idx)}
                    className={chassisOk[idx] === 'dup' ? 'border-destructive' : chassisOk[idx] === 'ok' ? 'border-emerald-600' : ''}
                  />
                  {chassisOk[idx] === 'dup' && <p className="text-xs text-destructive mt-1">Already in stock</p>}
                  {chassisOk[idx] === 'ok' && <p className="text-xs text-emerald-700 mt-1">Available</p>}
                </div>
                <div>
                  <Label>Engine *</Label>
                  <Input
                    value={line.vehicle_data.engine_number}
                    onChange={(e) => {
                      const v = e.target.value;
                      setLines((ls) => ls.map((x, i) => (i === idx ? { ...x, vehicle_data: { ...x.vehicle_data, engine_number: v } } : x)));
                    }}
                  />
                </div>
                {['make', 'model', 'variant', 'color'].map((f) => (
                  <div key={f}>
                    <Label className="capitalize">{f}</Label>
                    <Input
                      value={line.vehicle_data[f]}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLines((ls) => ls.map((x, i) => (i === idx ? { ...x, vehicle_data: { ...x.vehicle_data, [f]: v } } : x)));
                      }}
                    />
                  </div>
                ))}
                <div>
                  <Label>Year</Label>
                  <Input
                    value={line.vehicle_data.year}
                    onChange={(e) => {
                      const v = e.target.value;
                      setLines((ls) => ls.map((x, i) => (i === idx ? { ...x, vehicle_data: { ...x.vehicle_data, year: v } } : x)));
                    }}
                  />
                </div>
                <div>
                  <Label>Purchase price (₹)</Label>
                  <Input
                    value={line.vehicle_data.purchase_price}
                    onChange={(e) => {
                      const v = e.target.value;
                      setLines((ls) => ls.map((x, i) => (i === idx ? { ...x, vehicle_data: { ...x.vehicle_data, purchase_price: v } } : x)));
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}

        <div>
          <Label>Receipt notes</Label>
          <Textarea value={recvNotes} onChange={(e) => setRecvNotes(e.target.value)} rows={2} />
        </div>

        <Button onClick={submit} disabled={receiveMut.isPending}>
          {receiveMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Mark as received
        </Button>
      </div>
    </AppLayout>
  );
}
