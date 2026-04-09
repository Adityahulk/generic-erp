import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import QuotationPreviewModal from '@/components/QuotationPreviewModal';
import api from '@/lib/api';
import useAuthStore from '@/store/authStore';
import { usePermissions } from '@/hooks/usePermissions';
import ReadOnlyBadge from '@/components/ReadOnlyBadge';
import { formatCurrency, formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Loader2, Pencil, Send, FileDown, Link2, Trash2, Check, X, Copy, ExternalLink,
  RefreshCw, FileText, Eye,
} from 'lucide-react';

function waLink(phone, text) {
  const n = String(phone || '').replace(/\D/g, '');
  const q = encodeURIComponent(text);
  return `https://wa.me/${n}?text=${q}`;
}

export default function QuotationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const { canWrite, isCA } = usePermissions();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sendDialog, setSendDialog] = useState(false);
  const [shareUrl, setShareUrl] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['quotation', id],
    queryFn: () => api.get(`/quotations/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const { data: company } = useQuery({
    queryKey: ['company', user?.company_id],
    queryFn: () => api.get(`/companies/${user.company_id}`).then((r) => r.data.company),
    enabled: !!user?.company_id,
  });

  const branchIdForQ = data?.quotation?.branch_id;
  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get('/branches').then((r) => r.data.branches),
  });
  const branch = (branches || []).find((b) => b.id === branchIdForQ);

  const q = data?.quotation;
  const items = data?.items || [];
  const customer = data?.customer;
  const vehicle = data?.vehicle;
  const vo = data?.vehicle_override || {};

  const invalidate = () => qc.invalidateQueries({ queryKey: ['quotation', id] });

  const sendMut = useMutation({
    mutationFn: () => api.post(`/quotations/${id}/send`),
    onSuccess: async () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ['quotations'] });
      const { data: d } = await api.get(`/quotations/${id}/share-link`);
      const url = d.url?.startsWith('http') ? d.url : `${window.location.origin}${d.url}`;
      setShareUrl(url);
      await navigator.clipboard.writeText(url);
      setSendDialog(true);
      toast.success('Marked as sent. Share link copied.');
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const acceptMut = useMutation({
    mutationFn: () => api.post(`/quotations/${id}/accept`),
    onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ['quotations'] }); toast.success('Accepted'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const rejectMut = useMutation({
    mutationFn: () => api.post(`/quotations/${id}/reject`),
    onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ['quotations'] }); toast.success('Rejected'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const delMut = useMutation({
    mutationFn: () => api.delete(`/quotations/${id}`),
    onSuccess: () => { toast.success('Deleted'); navigate('/quotations'); },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const dupMut = useMutation({
    mutationFn: () => api.post(`/quotations/${id}/duplicate`),
    onSuccess: (res) => {
      toast.success('Duplicate created');
      navigate(`/quotations/${res.data.quotation.id}/edit`);
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const convertMut = useMutation({
    mutationFn: () => api.post(`/quotations/${id}/convert`),
    onSuccess: (res) => {
      const d = res.data;
      if (d?.requiresVehicleSelection) {
        toast.info('Select an in-stock vehicle before converting.', {
          description: 'Edit the quotation and link a stock vehicle, then convert again.',
        });
        navigate(`/quotations/${id}/edit`);
        return;
      }
      toast.success('Invoice created');
      if (d?.invoice_id) navigate('/sales');
      invalidate();
      qc.invalidateQueries({ queryKey: ['quotations'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Convert failed'),
  });

  const copyShare = async () => {
    try {
      const { data: d } = await api.get(`/quotations/${id}/share-link`);
      const url = d.url?.startsWith('http') ? d.url : `${window.location.origin}${d.url}`;
      await navigator.clipboard.writeText(url);
      setShareUrl(url);
      toast.success('Link copied');
    } catch {
      toast.error('Failed');
    }
  };

  const downloadPdf = async () => {
    try {
      const res = await api.get(`/quotations/${id}/pdf`, { responseType: 'blob' });
      const u = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = u;
      a.download = `${q?.quotation_number || 'q'}.pdf`;
      a.click();
      window.URL.revokeObjectURL(u);
    } catch {
      toast.error('PDF failed');
    }
  };

  const custName = customer?.name || q?.customer_name_override || '—';
  const custPhone = customer?.phone || q?.customer_phone_override || '';
  const makeModel = vehicle
    ? `${vehicle.make || ''} ${vehicle.model || ''} ${vehicle.variant || ''}`.trim()
    : [vo.make, vo.model, vo.variant].filter(Boolean).join(' ');

  const waMessage = `Dear ${custName}, please find your quotation for ${makeModel || 'your vehicle'} from ${company?.name || 'us'}.
Quotation No: ${q?.quotation_number} | Total: ${formatCurrency(q?.total)} | Valid till: ${formatDate(q?.valid_until_date)}.
View here: ${shareUrl || '(generate share link)'}
For queries call: ${branch?.phone || company?.phone || ''}`;

  if (isLoading || !q) {
    return (
      <AppLayout>
        <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      </AppLayout>
    );
  }

  const steps = [
    { key: 'created', label: 'Created', done: true, at: q.created_at },
    { key: 'sent', label: 'Sent', done: !!q.sent_at, at: q.sent_at },
    { key: 'outcome', label: q.status === 'accepted' ? 'Accepted' : q.status === 'rejected' ? 'Rejected' : 'Decision', done: ['accepted', 'rejected', 'converted'].includes(q.status), at: null },
    { key: 'converted', label: 'Converted', done: q.status === 'converted', at: q.converted_at },
  ];

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-2xl font-semibold font-mono">{q.quotation_number}</h2>
              <Badge>{q.status}</Badge>
              {isCA ? <ReadOnlyBadge /> : null}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {formatDate(q.quotation_date)} · Valid {formatDate(q.valid_until_date)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canWrite && q.status === 'draft' && (
              <>
                <Button variant="outline" size="sm" onClick={() => navigate(`/quotations/${id}/edit`)}><Pencil className="h-4 w-4 mr-1" /> Edit</Button>
                <Button size="sm" onClick={() => sendMut.mutate()} disabled={sendMut.isPending}><Send className="h-4 w-4 mr-1" /> Send</Button>
              </>
            )}
            {canWrite && q.status === 'sent' && (
              <>
                <Button variant="outline" size="sm" onClick={() => acceptMut.mutate()} disabled={acceptMut.isPending}><Check className="h-4 w-4 mr-1" /> Accept</Button>
                <Button variant="outline" size="sm" onClick={() => rejectMut.mutate()} disabled={rejectMut.isPending}><X className="h-4 w-4 mr-1" /> Reject</Button>
                <Button variant="outline" size="sm" onClick={() => navigate(`/quotations/${id}/edit`)}><Pencil className="h-4 w-4 mr-1" /> Edit</Button>
              </>
            )}
            {canWrite && ['sent', 'accepted'].includes(q.status) && (
              <Button size="sm" onClick={() => convertMut.mutate()} disabled={convertMut.isPending}>
                <RefreshCw className="h-4 w-4 mr-1" /> Convert to Invoice
              </Button>
            )}
            {q.status === 'converted' && q.converted_to_invoice_id && (
              <Button variant="outline" size="sm" asChild>
                <Link to="/sales"><FileText className="h-4 w-4 mr-1" /> View invoices</Link>
              </Button>
            )}
            {['rejected', 'expired'].includes(q.status) && canWrite && (
              <Button variant="outline" size="sm" onClick={() => dupMut.mutate()} disabled={dupMut.isPending}>Duplicate</Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}><Eye className="h-4 w-4 mr-1" /> Preview</Button>
            <Button variant="outline" size="sm" onClick={downloadPdf}><FileDown className="h-4 w-4 mr-1" /> PDF</Button>
            {canWrite && <Button variant="outline" size="sm" onClick={copyShare}><Link2 className="h-4 w-4 mr-1" /> Share</Button>}
            {canWrite && q.status === 'draft' && (
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => { if (window.confirm('Delete this draft?')) delMut.mutate(); }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-sm">Status</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 text-xs">
              {steps.map((s) => (
                <div key={s.key} className={s.done ? 'text-foreground font-medium' : 'text-muted-foreground'}>
                  <div>{s.label}</div>
                  {s.at && <div className="text-[10px] text-muted-foreground">{formatDate(s.at)}</div>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Customer</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              <p className="font-medium">{custName}</p>
              <p className="text-muted-foreground">{custPhone} {customer?.email ? `· ${customer.email}` : ''}</p>
              {(customer?.address || q.customer_address_override) && (
                <p className="whitespace-pre-wrap">{customer?.address || q.customer_address_override}</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Vehicle</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              {vehicle ? (
                <>
                  <p>{vehicle.make} {vehicle.model} {vehicle.variant}</p>
                  <p className="text-muted-foreground">Chassis: {vehicle.chassis_number}</p>
                </>
              ) : (
                <p>{makeModel || '—'} {vo.color ? `· ${vo.color}` : ''} {vo.year ? `· ${vo.year}` : ''}</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Items</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2">
            {items.map((it, i) => (
              <div key={it.id || i} className="flex justify-between gap-2 border-b border-border pb-2">
                <div>
                  <Badge variant="secondary" className="text-[10px] mr-2">{it.item_type}</Badge>
                  {it.description}
                </div>
                <span className="font-mono shrink-0">{formatCurrency(it.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between font-semibold pt-2">
              <span>Total</span>
              <span className="font-mono text-primary">{formatCurrency(q.total)}</span>
            </div>
          </CardContent>
        </Card>

        {q.customer_notes && (
          <Card>
            <CardHeader><CardTitle className="text-base">Customer notes (PDF)</CardTitle></CardHeader>
            <CardContent className="text-sm whitespace-pre-wrap">{q.customer_notes}</CardContent>
          </Card>
        )}
        {q.notes && (
          <Card>
            <CardHeader><CardTitle className="text-base">Internal notes</CardTitle></CardHeader>
            <CardContent className="text-sm whitespace-pre-wrap text-muted-foreground">{q.notes}</CardContent>
          </Card>
        )}
      </div>

      <QuotationPreviewModal open={previewOpen} onOpenChange={setPreviewOpen} quotationId={id} />

      <Dialog open={sendDialog} onOpenChange={setSendDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share quotation</DialogTitle>
            <DialogDescription>
              Link copied to clipboard. Share via WhatsApp or copy again below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <Label className="text-xs text-muted-foreground">Link</Label>
              <div className="flex gap-2 mt-1">
                <Input readOnly value={shareUrl} className="font-mono text-xs" />
                <Button type="button" size="icon" variant="outline" onClick={() => { navigator.clipboard.writeText(shareUrl); toast.success('Copied'); }}><Copy className="h-4 w-4" /></Button>
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">WhatsApp message</Label>
              <Textarea readOnly rows={6} value={waMessage} className="mt-1 text-xs" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setSendDialog(false)}>Close</Button>
            {custPhone && (
              <Button type="button" asChild>
                <a href={waLink(custPhone, waMessage)} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" /> Open WhatsApp
                </a>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
