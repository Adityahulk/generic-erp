import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Alert } from '@/components/ui/alert';
import { Upload, Download, Loader2, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import useAuthStore from '@/store/authStore';
import { cn } from '@/lib/utils';

const MAX_ROWS_WARN = 5000;

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export default function BulkImport({
  type,
  open,
  onOpenChange,
  onSuccess,
}) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [branchId, setBranchId] = useState('');
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const effectiveBranchId = branchId || user?.branch_id || '';

  const reset = () => {
    setStep(1);
    setFile(null);
    setPreview(null);
    setResult(null);
    setBranchId('');
  };

  const handleClose = (v) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const onDrop = useCallback((accepted) => {
    if (accepted?.[0]) {
      setFile(accepted[0]);
      setPreview(null);
      setResult(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
      'application/json': ['.json'],
    },
    maxSize: 10 * 1024 * 1024,
    multiple: false,
  });

  const downloadTemplate = async () => {
    try {
      const res = await api.get(`/import/template/${type}`, { responseType: 'blob' });
      downloadBlob(res.data, `${type}_import_template.xlsx`);
    } catch {
      toast.error('Could not download template');
    }
  };

  const runPreview = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('type', type);
      const { data } = await api.post('/import/preview', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (data.totalRows > MAX_ROWS_WARN) {
        toast.warning(`File has ${data.totalRows} rows. Large imports may take time.`);
      }
      setPreview(data);
      setStep(2);
    } catch {
      /* toast from interceptor */
    } finally {
      setLoading(false);
    }
  };

  const runConfirm = async () => {
    if (!preview?.importSessionId || !effectiveBranchId) {
      toast.error('Select a branch');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post('/import/confirm', {
        importSessionId: preview.importSessionId,
        type,
        branchId: effectiveBranchId,
      });
      setResult(data);
      setStep(3);
      onSuccess?.();
    } catch {
      /* interceptor */
    } finally {
      setLoading(false);
    }
  };

  const downloadErrorCsv = () => {
    if (!result?.errors?.length) return;
    const header = 'row,reason\n';
    const lines = result.errors.map((e) => `${e.row},"${String(e.reason).replace(/"/g, '""')}"`).join('\n');
    const blob = new Blob([header + lines], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, 'import_errors.csv');
  };

  const goList = () => {
    handleClose(false);
    if (type === 'vehicles') navigate('/inventory');
    else if (type === 'sales') navigate('/sales');
    else navigate('/purchases');
  };

  const previewColumns = preview?.previewData?.[0]
    ? Object.keys(preview.previewData[0])
    : [];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl w-full max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk import — {type}</DialogTitle>
          <DialogDescription>
            Upload a spreadsheet (Excel, CSV, or JSON). Step 1: upload and preview. Step 2: confirm valid rows.
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            {(user?.role === 'company_admin' || user?.role === 'super_admin') && !user?.branch_id && (
              <div className="space-y-1">
                <Label>Branch for import</Label>
                <BranchSelect value={branchId} onChange={setBranchId} />
                <p className="text-xs text-muted-foreground">Required so vehicles and documents are assigned to a branch.</p>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="h-4 w-4 mr-2" /> Download template
              </Button>
            </div>
            <div
              {...getRootProps()}
              className={cn(
                'border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors',
                isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
              )}
            >
              <input {...getInputProps()} />
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium">Drag and drop a file here, or click to select</p>
              <p className="text-xs text-muted-foreground mt-1">.xlsx, .xls, .csv, .json — max 10MB</p>
            </div>
            {file && (
              <div className="flex items-center gap-2 text-sm">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                <span className="font-mono">{file.name}</span>
                <span className="text-muted-foreground">({(file.size / 1024).toFixed(1)} KB)</span>
              </div>
            )}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
              <Button
                onClick={runPreview}
                disabled={
                  !file || loading
                  || ((user?.role === 'company_admin' || user?.role === 'super_admin') && !user?.branch_id && !branchId)
                }
              >
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Preview import
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 2 && preview && (
          <div className="space-y-4">
            <Alert className="bg-muted/50 border-border">
              <p className="text-sm">
                <strong>{preview.totalRows}</strong> rows — <span className="text-emerald-700 font-medium">{preview.validRows} valid</span>
                {preview.invalidRows > 0 && (
                  <span className="text-destructive font-medium">, {preview.invalidRows} with errors</span>
                )}
              </p>
            </Alert>

            {preview.errors?.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-destructive mb-2">Validation errors</h4>
                <div className="border rounded-md max-h-48 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">Row</TableHead>
                        <TableHead className="w-24">Field</TableHead>
                        <TableHead>Message</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.errors.map((e, i) => (
                        <TableRow key={i} className="bg-destructive/5">
                          <TableCell>{e.row}</TableCell>
                          <TableCell>{e.field}</TableCell>
                          <TableCell className="text-destructive text-sm">{e.message}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {preview.previewData?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">First valid rows (sample)</h4>
                <div className="border rounded-md overflow-x-auto max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {previewColumns.map((c) => (
                          <TableHead key={c} className="whitespace-nowrap text-xs">{c}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.previewData.slice(0, 10).map((row, ri) => (
                        <TableRow key={ri}>
                          {previewColumns.map((c) => (
                            <TableCell key={c} className="text-xs max-w-[180px] truncate">{String(row[c] ?? '')}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => { setStep(1); setPreview(null); }}>Fix errors and re-upload</Button>
              {preview.validRows > 0 ? (
                <Button onClick={runConfirm} disabled={loading || !effectiveBranchId}>
                  {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Import {preview.validRows} valid row{preview.validRows !== 1 ? 's' : ''}
                </Button>
              ) : null}
            </DialogFooter>
          </div>
        )}

        {step === 3 && result && (
          <div className="space-y-4">
            <p className="text-lg font-medium text-emerald-700">
              {result.imported} record{result.imported !== 1 ? 's' : ''} imported successfully
            </p>
            {result.skipped > 0 && (
              <p className="text-sm text-muted-foreground">
                {result.skipped} row{result.skipped !== 1 ? 's were' : ' was'} skipped.
                <Button variant="link" className="px-1 h-auto" onClick={downloadErrorCsv}>Download error report</Button>
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>Close</Button>
              <Button onClick={goList}>View imported data</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function BranchSelect({ value, onChange }) {
  const [list, setList] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const load = async () => {
    if (loaded) return;
    try {
      const { data } = await api.get('/branches');
      setList(data.branches || []);
      setLoaded(true);
    } catch { /* ignore */ }
  };
  return (
    <Select
      className="w-full max-w-md"
      value={value}
      onFocus={load}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Select branch</option>
      {list.map((b) => (
        <option key={b.id} value={b.id}>{b.name}</option>
      ))}
    </Select>
  );
}
