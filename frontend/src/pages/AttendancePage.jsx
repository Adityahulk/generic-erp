import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import useAuthStore from '@/store/authStore';
import { formatDate, cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Clock, LogIn, LogOut, Users, Download, Loader2,
  CheckCircle2, XCircle, MinusCircle, CalendarPlus, ClipboardCheck,
} from 'lucide-react';

function formatTime(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function formatHours(h) {
  if (h == null) return '—';
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs}h ${mins}m`;
}

// ────────────────────────── Clock Card (shared) ──────────────────────────

function ClockCard() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['my-attendance'],
    queryFn: () => api.get('/attendance/me').then((r) => r.data.record),
    refetchInterval: 30_000,
  });

  const clockInMut = useMutation({
    mutationFn: () => api.post('/attendance/clockin'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-attendance'] }),
  });

  const clockOutMut = useMutation({
    mutationFn: () => api.post('/attendance/clockout'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-attendance'] }),
  });

  const isClockedIn = data?.clock_in && !data?.clock_out;
  const isClockedOut = data?.clock_in && data?.clock_out;
  const notClockedIn = !data;

  return (
    <Card className="overflow-hidden">
      <div className={cn(
        'h-1.5',
        isClockedIn && 'bg-emerald-500',
        isClockedOut && 'bg-blue-500',
        notClockedIn && 'bg-muted-foreground/30',
      )} />
      <CardContent className="pt-6 pb-6">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="flex-1 text-center sm:text-left">
            <div className="flex items-center gap-2 justify-center sm:justify-start mb-1">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Today&apos;s Attendance</span>
            </div>

            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin mx-auto sm:mx-0" />
            ) : isClockedIn ? (
              <div>
                <p className="text-lg font-semibold text-emerald-600">Clocked in at {formatTime(data.clock_in)}</p>
                <p className="text-sm text-muted-foreground">Currently working</p>
              </div>
            ) : isClockedOut ? (
              <div>
                <p className="text-lg font-semibold text-blue-600">Day complete</p>
                <p className="text-sm text-muted-foreground">
                  {formatTime(data.clock_in)} — {formatTime(data.clock_out)}
                </p>
              </div>
            ) : (
              <div>
                <p className="text-lg font-semibold text-muted-foreground">Not clocked in today</p>
                <p className="text-sm text-muted-foreground">Tap the button to start your day</p>
              </div>
            )}
          </div>

          <div className="shrink-0">
            {notClockedIn && (
              <Button
                size="lg"
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-6 text-base"
                onClick={() => clockInMut.mutate()}
                disabled={clockInMut.isPending}
              >
                {clockInMut.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
                Clock In
              </Button>
            )}
            {isClockedIn && (
              <Button
                size="lg"
                variant="destructive"
                className="gap-2 px-8 py-6 text-base"
                onClick={() => clockOutMut.mutate()}
                disabled={clockOutMut.isPending}
              >
                {clockOutMut.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />}
                Clock Out
              </Button>
            )}
            {isClockedOut && (
              <Badge variant="secondary" className="text-sm py-1.5 px-3">
                <CheckCircle2 className="h-4 w-4 mr-1.5" /> Done for today
              </Badge>
            )}
          </div>
        </div>

        {(clockInMut.isError || clockOutMut.isError) && (
          <p className="text-sm text-destructive mt-3 text-center">
            {clockInMut.error?.response?.data?.error || clockOutMut.error?.response?.data?.error || 'Something went wrong'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ────────────────────────── Staff: leave request ──────────────────────────

const LEAVE_STATUS_BADGE = {
  pending: 'warning',
  approved: 'success',
  rejected: 'destructive',
  cancelled: 'secondary',
};

function StaffLeavePanel() {
  const qc = useQueryClient();
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [leaveType, setLeaveType] = useState('casual');
  const [reason, setReason] = useState('');

  const { data: leaves, isLoading } = useQuery({
    queryKey: ['my-leaves'],
    queryFn: () => api.get('/leaves').then((r) => r.data.data),
  });

  const createMut = useMutation({
    mutationFn: () => api.post('/leaves', {
      start_date: start,
      end_date: end,
      leave_type: leaveType,
      reason: reason || undefined,
    }),
    onSuccess: () => {
      toast.success('Leave request submitted for manager approval');
      setStart('');
      setEnd('');
      setReason('');
      qc.invalidateQueries({ queryKey: ['my-leaves'] });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed to submit'),
  });

  const cancelMut = useMutation({
    mutationFn: (id) => api.patch(`/leaves/${id}/cancel`),
    onSuccess: () => {
      toast.success('Request cancelled');
      qc.invalidateQueries({ queryKey: ['my-leaves'] });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Cannot cancel'),
  });

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarPlus className="h-4 w-4" /> Request leave
          </CardTitle>
          <p className="text-sm text-muted-foreground">Your branch manager will approve or reject.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>From</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>To</Label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={leaveType} onChange={(e) => setLeaveType(e.target.value)} className="w-full max-w-xs">
              <option value="casual">Casual</option>
              <option value="sick">Sick</option>
              <option value="earned">Earned</option>
              <option value="other">Other</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Reason (optional)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Short note for your manager" />
          </div>
          <Button
            disabled={!start || !end || createMut.isPending}
            onClick={() => createMut.mutate()}
          >
            {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Submit for approval
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">My leave requests</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 font-medium text-muted-foreground">Dates</th>
                    <th className="text-left py-2 font-medium text-muted-foreground">Type</th>
                    <th className="text-left py-2 font-medium text-muted-foreground">Status</th>
                    <th className="text-right py-2 font-medium text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(leaves || []).map((row) => (
                    <tr key={row.id} className="border-b border-border/50">
                      <td className="py-2">
                        {formatDate(row.start_date)} — {formatDate(row.end_date)}
                      </td>
                      <td className="py-2 capitalize">{row.leave_type}</td>
                      <td className="py-2">
                        <Badge variant={LEAVE_STATUS_BADGE[row.status] || 'secondary'}>{row.status}</Badge>
                        {row.manager_note && (
                          <p className="text-xs text-muted-foreground mt-1">{row.manager_note}</p>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        {row.status === 'pending' && (
                          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => cancelMut.mutate(row.id)}>
                            Cancel
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {(!leaves || leaves.length === 0) && (
                    <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">No requests yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function StaffAttendanceView() {
  return (
    <AppLayout>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold">Attendance & leave</h2>
        <p className="text-sm text-muted-foreground">Clock in/out and submit leave for manager approval</p>
      </div>
      <div className="space-y-6 max-w-3xl">
        <ClockCard />
        <StaffLeavePanel />
      </div>
    </AppLayout>
  );
}

// ────────────────────────── Manager / admin: today table ──────────────────────────

function TodayTable() {
  const { user } = useAuthStore();
  const branchId = user?.branch_id;

  const { data, isLoading } = useQuery({
    queryKey: ['attendance-today', branchId],
    queryFn: () => api.get(`/attendance/today/${branchId}`).then((r) => r.data),
    enabled: !!branchId,
    refetchInterval: 60_000,
  });

  if (!branchId) return null;

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  if (!data) return null;

  const { summary, users } = data;
  const isStaffOnlySelf = user?.role === 'staff';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4" /> {isStaffOnlySelf ? 'My attendance today' : "Today's branch attendance"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-3 mb-4">
          <Badge variant="default">{summary.total} Total</Badge>
          <Badge variant="success">{summary.clocked_in} Working</Badge>
          <Badge variant="secondary">{summary.clocked_out} Done</Badge>
          <Badge variant="destructive">{summary.absent} Absent</Badge>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 font-medium text-muted-foreground">Name</th>
                <th className="text-left py-2 font-medium text-muted-foreground">Role</th>
                <th className="text-center py-2 font-medium text-muted-foreground">Status</th>
                <th className="text-left py-2 font-medium text-muted-foreground">Clock In</th>
                <th className="text-left py-2 font-medium text-muted-foreground">Clock Out</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isIn = u.clock_in && !u.clock_out;
                const isDone = u.clock_in && u.clock_out;
                const isAbsent = !u.clock_in;

                return (
                  <tr key={u.id} className={cn('border-b border-border/50', isAbsent && 'bg-destructive/5')}>
                    <td className="py-2 font-medium">{u.name}</td>
                    <td className="py-2"><Badge variant="outline">{u.role}</Badge></td>
                    <td className="py-2 text-center">
                      {isIn && <Badge variant="success" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Working</Badge>}
                      {isDone && <Badge variant="secondary" className="gap-1"><MinusCircle className="h-3 w-3" /> Done</Badge>}
                      {isAbsent && <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Absent</Badge>}
                    </td>
                    <td className="py-2">{formatTime(u.clock_in)}</td>
                    <td className="py-2">{formatTime(u.clock_out)}</td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">No rows</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ────────────────────────── Manager: leave approvals ──────────────────────────

function ManagerLeaveQueue() {
  const qc = useQueryClient();
  const { data: leaves, isLoading } = useQuery({
    queryKey: ['branch-leaves'],
    queryFn: () => api.get('/leaves').then((r) => r.data.data),
  });

  const reviewMut = useMutation({
    mutationFn: ({ id, status, note }) => api.patch(`/leaves/${id}/review`, { status, manager_note: note }),
    onSuccess: (_, v) => {
      toast.success(v.status === 'approved' ? 'Leave approved' : 'Leave rejected');
      qc.invalidateQueries({ queryKey: ['branch-leaves'] });
    },
    onError: (e) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const pending = (leaves || []).filter((l) => l.status === 'pending');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4" /> Leave approvals
        </CardTitle>
        <p className="text-sm text-muted-foreground">Approve or reject staff leave for your branch</p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : (
          <div className="space-y-4">
            {pending.length === 0 && (
              <p className="text-sm text-muted-foreground py-4">No pending leave requests.</p>
            )}
            {pending.map((row) => (
              <div key={row.id} className="border border-border rounded-lg p-4 space-y-2">
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <p className="font-medium">{row.user_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(row.start_date)} — {formatDate(row.end_date)} · <span className="capitalize">{row.leave_type}</span>
                    </p>
                    {row.reason && <p className="text-sm mt-1">{row.reason}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700"
                      disabled={reviewMut.isPending}
                      onClick={() => reviewMut.mutate({ id: row.id, status: 'approved' })}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={reviewMut.isPending}
                      onClick={() => reviewMut.mutate({ id: row.id, status: 'rejected' })}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            {(leaves || []).filter((l) => l.status !== 'pending').length > 0 && (
              <div className="pt-4 border-t border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Recent history</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 text-muted-foreground">Staff</th>
                        <th className="text-left py-2 text-muted-foreground">Dates</th>
                        <th className="text-left py-2 text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(leaves || []).filter((l) => l.status !== 'pending').slice(0, 15).map((row) => (
                        <tr key={row.id} className="border-b border-border/50">
                          <td className="py-2">{row.user_name}</td>
                          <td className="py-2">{formatDate(row.start_date)} — {formatDate(row.end_date)}</td>
                          <td className="py-2"><Badge variant={LEAVE_STATUS_BADGE[row.status]}>{row.status}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ────────────────────────── Admin-only attendance report ──────────────────────────

function ReportSection() {
  const { user } = useAuthStore();
  const now = new Date();
  const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const today = now.toISOString().split('T')[0];

  const [from, setFrom] = useState(firstDay);
  const [to, setTo] = useState(today);
  const [branchId, setBranchId] = useState('');

  const isAdmin = ['company_admin', 'super_admin'].includes(user?.role);

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get('/branches').then((r) => r.data.branches),
    enabled: isAdmin,
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['attendance-report', from, to, branchId],
    queryFn: () => {
      let url = `/attendance/report?from=${from}&to=${to}`;
      if (branchId) url += `&branch_id=${branchId}`;
      return api.get(url).then((r) => r.data);
    },
    enabled: false,
  });

  const handleExportCSV = () => {
    if (!data?.records?.length) return;
    const header = ['Date', 'Name', 'Role', 'Branch', 'Clock In', 'Clock Out', 'Hours Worked'].join(',');
    const rows = data.records.map((r) => [
      r.date,
      `"${r.user_name}"`,
      r.user_role,
      `"${r.branch_name || ''}"`,
      r.clock_in ? new Date(r.clock_in).toLocaleTimeString('en-IN') : '',
      r.clock_out ? new Date(r.clock_out).toLocaleTimeString('en-IN') : '',
      r.hours_worked != null ? r.hours_worked : '',
    ].join(','));

    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `attendance_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!isAdmin) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Company attendance report</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div className="space-y-1">
            <Label>From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <Label>To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <Label>Branch</Label>
            <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="w-44">
              <option value="">All Branches</option>
              {(branches || []).map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          </div>
          <Button onClick={() => refetch()} disabled={isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Generate
          </Button>
          {data?.records?.length > 0 && (
            <Button variant="outline" onClick={handleExportCSV} className="gap-1.5">
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          )}
        </div>

        {data && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 font-medium text-muted-foreground">Date</th>
                  <th className="text-left py-2 font-medium text-muted-foreground">Name</th>
                  <th className="text-left py-2 font-medium text-muted-foreground">Role</th>
                  <th className="text-left py-2 font-medium text-muted-foreground">Branch</th>
                  <th className="text-left py-2 font-medium text-muted-foreground">Clock In</th>
                  <th className="text-left py-2 font-medium text-muted-foreground">Clock Out</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">Hours</th>
                </tr>
              </thead>
              <tbody>
                {data.records.map((r) => (
                  <tr key={r.id} className="border-b border-border/50">
                    <td className="py-2">{formatDate(r.date)}</td>
                    <td className="py-2 font-medium">{r.user_name}</td>
                    <td className="py-2"><Badge variant="outline">{r.user_role}</Badge></td>
                    <td className="py-2">{r.branch_name || '—'}</td>
                    <td className="py-2">{formatTime(r.clock_in)}</td>
                    <td className="py-2">{formatTime(r.clock_out)}</td>
                    <td className={cn(
                      'py-2 text-right font-medium',
                      r.hours_worked != null && r.hours_worked < 6 && 'text-amber-600',
                      r.hours_worked != null && r.hours_worked >= 8 && 'text-emerald-600',
                    )}>
                      {formatHours(r.hours_worked)}
                    </td>
                  </tr>
                ))}
                {data.records.length === 0 && (
                  <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No records found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {!data && !isLoading && (
          <p className="text-sm text-muted-foreground text-center py-8">Select a date range and click Generate</p>
        )}
      </CardContent>
    </Card>
  );
}

// ────────────────────────── Manager / admin full page ──────────────────────────

function ManagerAdminAttendanceView() {
  const { user } = useAuthStore();
  const isManager = user?.role === 'branch_manager';

  return (
    <AppLayout>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold">Attendance</h2>
        <p className="text-sm text-muted-foreground">
          {isManager ? 'Your branch clock-ins and leave approvals' : 'Company-wide attendance tools'}
        </p>
      </div>

      <div className="space-y-6">
        <ClockCard />
        <TodayTable />
        {isManager && <ManagerLeaveQueue />}
        <ReportSection />
      </div>
    </AppLayout>
  );
}

// ────────────────────────── Entry ──────────────────────────

export default function AttendancePage() {
  const { user } = useAuthStore();
  if (user?.role === 'staff') {
    return <StaffAttendanceView />;
  }
  return <ManagerAdminAttendanceView />;
}
