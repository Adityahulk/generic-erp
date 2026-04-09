import { useState, useEffect, useRef } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Loader2, Download } from 'lucide-react';
import { apiPath } from '@/lib/apiPrefix';
import api from '@/lib/api';

export default function InvoicePreviewModal({
  open,
  onOpenChange,
  invoiceId,
  invoiceNumber,
  templates = [],
  defaultTemplateId,
}) {
  const [templateId, setTemplateId] = useState('');
  const [iframeUrl, setIframeUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const previewBlobRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setIframeUrl('');
      return;
    }
    const def = templates.find((t) => t.is_default)?.id || templates[0]?.id || '';
    setTemplateId(defaultTemplateId || def || '');
  }, [open, templates, defaultTemplateId]);

  useEffect(() => {
    if (!open || !invoiceId || !templateId) {
      setIframeUrl('');
      return;
    }
    if (previewBlobRef.current) {
      URL.revokeObjectURL(previewBlobRef.current);
      previewBlobRef.current = null;
    }
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('access_token');
        const url = `${apiPath(`/invoices/${invoiceId}/preview`)}?templateId=${encodeURIComponent(templateId)}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const html = await res.text();
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const u = URL.createObjectURL(blob);
        if (!alive) {
          URL.revokeObjectURL(u);
          return;
        }
        previewBlobRef.current = u;
        setIframeUrl(u);
      } catch {
        if (alive) setIframeUrl('');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
      if (previewBlobRef.current) {
        URL.revokeObjectURL(previewBlobRef.current);
        previewBlobRef.current = null;
      }
      setIframeUrl('');
    };
  }, [open, invoiceId, templateId]);

  const downloadPdf = async () => {
    try {
      const response = await api.get(`/invoices/${invoiceId}/pdf`, {
        params: { templateId: templateId || undefined },
        responseType: 'blob',
      });
      const name = (invoiceNumber || 'invoice').replace(/[^\w.-]+/g, '_');
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${name}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      /* toast via interceptor */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-full h-[min(90vh,800px)] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-border shrink-0">
          <div className="flex items-start justify-between gap-4 pr-8">
            <DialogTitle>Invoice preview</DialogTitle>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Template</span>
              <Select
                className="w-48 h-9"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}{t.is_default ? ' (default)' : ''}</option>
                ))}
              </Select>
              <Button type="button" size="sm" variant="outline" onClick={downloadPdf}>
                <Download className="h-4 w-4 mr-1" /> Download PDF
              </Button>
            </div>
          </div>
        </DialogHeader>
        <div className="flex-1 relative min-h-[400px] bg-muted/30">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}
          {iframeUrl ? (
            <iframe title="Invoice preview" src={iframeUrl} className="w-full h-full border-0 min-h-[400px]" />
          ) : !loading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Select a template</div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
