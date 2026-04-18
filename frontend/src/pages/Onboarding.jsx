import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import useAuthStore from '@/store/authStore';
import api from '@/lib/api';
import useTerms from '@/hooks/useTerms';

const SELL_TERMS = ['Product', 'Medicine', 'Material', 'Item', 'Part', 'Goods', 'Article', 'Service'];

export default function OnboardingPage() {
  const { user, company, setCompany } = useAuthStore();
  const [step, setStep] = useState(1);
  const [companyForm, setCompanyForm] = useState({
    name: company?.name || '',
    gstin: company?.gstin || '',
    state_code: '',
    phone: user?.phone || '',
    email: user?.email || '',
  });
  const [branchForm, setBranchForm] = useState({
    name: 'Main Branch',
    city: '',
    state: '',
    pincode: '',
  });
  const [itemTerm, setItemTerm] = useState(company?.item_terminology || 'Product');
  const previewTerms = useTerms();

  const updateCompany = useMutation({
    mutationFn: (payload) => api.patch(`/companies/${user.company_id}`, payload),
    onSuccess: ({ data }) => setCompany(data.company),
  });

  const createBranch = useMutation({
    mutationFn: (payload) => api.post('/branches', payload),
  });

  const finishOnboarding = async () => {
    await updateCompany.mutateAsync({
      ...companyForm,
      item_terminology: itemTerm,
      item_terminology_plural: itemTerm.endsWith('s') ? itemTerm : `${itemTerm}s`,
      onboarding_completed: true,
    });
    try {
      await createBranch.mutateAsync(branchForm);
    } catch {
      // ignore duplicate/default branch failures and let user continue
    }
    setStep(4);
  };

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-6">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>{step < 4 ? `Quick Setup · Step ${step} of 3` : `Welcome to ${companyForm.name || company?.name || 'BizERP'}!`}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Company name</Label><Input value={companyForm.name} onChange={(e) => setCompanyForm((prev) => ({ ...prev, name: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>GSTIN</Label><Input value={companyForm.gstin} onChange={(e) => setCompanyForm((prev) => ({ ...prev, gstin: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>State code</Label><Input value={companyForm.state_code} onChange={(e) => setCompanyForm((prev) => ({ ...prev, state_code: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>Phone</Label><Input value={companyForm.phone} onChange={(e) => setCompanyForm((prev) => ({ ...prev, phone: e.target.value }))} /></div>
                <div className="space-y-1.5 md:col-span-2"><Label>Email</Label><Input value={companyForm.email} onChange={(e) => setCompanyForm((prev) => ({ ...prev, email: e.target.value }))} /></div>
              </div>
              <Button onClick={() => setStep(2)}>Continue</Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Branch name</Label><Input value={branchForm.name} onChange={(e) => setBranchForm((prev) => ({ ...prev, name: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>City</Label><Input value={branchForm.city} onChange={(e) => setBranchForm((prev) => ({ ...prev, city: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>State</Label><Input value={branchForm.state} onChange={(e) => setBranchForm((prev) => ({ ...prev, state: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>Pincode</Label><Input value={branchForm.pincode} onChange={(e) => setBranchForm((prev) => ({ ...prev, pincode: e.target.value }))} /></div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                <Button onClick={() => setStep(3)}>Continue</Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>What do you call your products?</Label>
                <Input value={itemTerm} onChange={(e) => setItemTerm(e.target.value)} className="text-lg" />
              </div>
              <div className="flex flex-wrap gap-2">
                {SELL_TERMS.map((term) => (
                  <Button key={term} type="button" variant="outline" size="sm" onClick={() => setItemTerm(term)}>
                    {term}
                  </Button>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">That’s it. You can add more details in Settings anytime.</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
                <Button onClick={finishOnboarding} disabled={updateCompany.isPending || createBranch.isPending}>Finish Setup</Button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link to="/inventory" className="rounded-xl border border-border p-5 hover:bg-accent">
                <h3 className="font-semibold mb-2">Add your first {previewTerms.item.toLowerCase()}</h3>
                <p className="text-sm text-muted-foreground">Start building your inventory.</p>
              </Link>
              <Link to="/sales" className="rounded-xl border border-border p-5 hover:bg-accent">
                <h3 className="font-semibold mb-2">Create an invoice</h3>
                <p className="text-sm text-muted-foreground">Bill your first customer right away.</p>
              </Link>
              <Link to="/settings" className="rounded-xl border border-border p-5 hover:bg-accent">
                <h3 className="font-semibold mb-2">Set up your team</h3>
                <p className="text-sm text-muted-foreground">Fine-tune terminology and custom fields later.</p>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
