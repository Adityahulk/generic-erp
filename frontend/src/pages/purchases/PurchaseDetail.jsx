import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Loader2, Pencil, Truck, Download, ArrowLeft } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import api from '@/lib/api';

const PO_STATUS_BADGE = {
  draft: 'secondary',
  confirmed: 'default',
  received: 'success',
  cancelled: 'destructive',
};

export default function PurchaseDetail() {
  const { id } = useParams();
  const { data, isLoading } = useQuery({
    queryKey: ['purchase', id],
    queryFn: () => api.get(`/purchases/${id}`).then((r) => r.data),
  });

  const downloadPdf = async () => {
    if (!data) return;
    try {
      const response = await api.get(`/purchases/${id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${data.purchase_order.po_number.replace(/\//g, '-')}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('PDF download failed');
    }
  };

  if (isLoading || !data) {
    return (
      <AppLayout>
        <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      </AppLayout>
    );
  }

  const po = data.purchase_order;
  const items = data.items || [];

  return (
    <AppLayout>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/purchases"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
        </Button>
        <h2 className="text-2xl font-semibold flex-1">{po.po_number}</h2>
        <Badge variant={PO_STATUS_BADGE[po.status]}>{po.status}</Badge>
        <Button variant="outline" size="sm" onClick={downloadPdf}><Download className="h-4 w-4 mr-2" /> PDF</Button>
        {po.status === 'draft' && (
          <Button size="sm" asChild><Link to={`/purchases/${id}/edit`}><Pencil className="h-4 w-4 mr-2" /> Edit</Link></Button>
        )}
        {po.status === 'confirmed' && (
          <Button size="sm" asChild><Link to={`/purchases/${id}/receive`}><Truck className="h-4 w-4 mr-2" /> Receive</Link></Button>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-6 text-sm">
        <div className="bg-card border rounded-lg p-4">
          <h3 className="font-semibold mb-2">Supplier</h3>
          <p className="font-medium">{po.supplier_name}</p>
          <p className="text-muted-foreground">{po.supplier_address || '—'}</p>
          <p>GSTIN: {po.supplier_gstin || '—'}</p>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <h3 className="font-semibold mb-2">Branch & dates</h3>
          <p>{po.branch_name}</p>
          <p>Order: {formatDate(po.order_date)}</p>
          {po.expected_delivery_date && <p>Expected: {formatDate(po.expected_delivery_date)}</p>}
        </div>
      </div>

      <div className="bg-card border rounded-lg overflow-x-auto mb-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>HSN</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead className="text-right">Unit</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it, i) => (
              <TableRow key={it.id}>
                <TableCell>{i + 1}</TableCell>
                <TableCell>{it.description}</TableCell>
                <TableCell>{it.hsn_code}</TableCell>
                <TableCell>{it.quantity}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(it.unit_price)}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(it.amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-end">
        <div className="w-72 space-y-1 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span className="font-mono">{formatCurrency(po.subtotal)}</span></div>
          {Number(po.discount) > 0 && (
            <div className="flex justify-between text-destructive"><span>Discount</span><span className="font-mono">-{formatCurrency(po.discount)}</span></div>
          )}
          {Number(po.cgst_amount) > 0 && <div className="flex justify-between"><span>CGST</span><span className="font-mono">{formatCurrency(po.cgst_amount)}</span></div>}
          {Number(po.sgst_amount) > 0 && <div className="flex justify-between"><span>SGST</span><span className="font-mono">{formatCurrency(po.sgst_amount)}</span></div>}
          {Number(po.igst_amount) > 0 && <div className="flex justify-between"><span>IGST</span><span className="font-mono">{formatCurrency(po.igst_amount)}</span></div>}
          {Number(po.tcs_amount) > 0 && <div className="flex justify-between"><span>TCS</span><span className="font-mono">{formatCurrency(po.tcs_amount)}</span></div>}
          <div className="flex justify-between font-semibold text-base border-t pt-2"><span>Total</span><span className="font-mono">{formatCurrency(po.total)}</span></div>
        </div>
      </div>

      {po.notes && <p className="mt-6 text-sm text-muted-foreground"><strong>Notes:</strong> {po.notes}</p>}
    </AppLayout>
  );
}
