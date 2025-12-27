import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useLanguage } from '@/contexts/LanguageContext';
import { Loader2, Archive, Check, X } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ArchiveRequest {
  id: string;
  postId: number;
  postTitle: string;
  postType: string;
  postDate: string;
  reason?: string;
  year?: number;
  month?: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  approvedAt?: string;
}

export default function ArchivePage() {
  const { toast } = useToast();
  const { language } = useLanguage();
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<'approve' | 'reject' | null>(null);

  const labels = language === 'en' ? {
    title: 'Content Archive',
    subtitle: 'Archive or remove old content with approval workflow',
    selectYear: 'Filter by Year',
    selectMonth: 'Filter by Month',
    noFilter: 'All years',
    filterBtn: 'Apply Filters',
    pending: 'Pending Approval',
    approved: 'Approved',
    rejected: 'Rejected',
    postTitle: 'Post Title',
    date: 'Date',
    status: 'Status',
    reason: 'Reason',
    approve: 'Approve',
    reject: 'Reject',
    approveTitle: 'Approve Archive Request',
    approveDesc: 'This will mark this content for archival. Continue?',
    rejectTitle: 'Reject Archive Request',
    rejectDesc: 'This will reject the archival request. Continue?',
    cancel: 'Cancel',
    noPending: 'No pending archive requests',
    success: 'Request updated successfully',
    error: 'Error updating request',
  } : {
    title: 'Архивирование контента',
    subtitle: 'Архивирование или удаление старого контента с workflow утверждения',
    selectYear: 'Фильтр по году',
    selectMonth: 'Фильтр по месяцу',
    noFilter: 'Все годы',
    filterBtn: 'Применить фильтры',
    pending: 'На утверждении',
    approved: 'Одобрено',
    rejected: 'Отклонено',
    postTitle: 'Название поста',
    date: 'Дата',
    status: 'Статус',
    reason: 'Причина',
    approve: 'Одобрить',
    reject: 'Отклонить',
    approveTitle: 'Одобрить архивирование',
    approveDesc: 'Это отметит контент для архивирования. Продолжить?',
    rejectTitle: 'Отклонить запрос архивирования',
    rejectDesc: 'Это отклонит запрос архивирования. Продолжить?',
    cancel: 'Отмена',
    noPending: 'Нет запросов на архивирование',
    success: 'Запрос обновлен успешно',
    error: 'Ошибка обновления запроса',
  };

  const { data: suggestedContent = [] } = useQuery<any[]>({
    queryKey: ['/api/archive/suggest', selectedYear, selectedMonth],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedYear) params.append('year', selectedYear);
      if (selectedMonth) params.append('month', selectedMonth);
      const res = await fetch(`/api/archive/suggest?${params}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await res.json();
      return data.content || [];
    },
  });

  const { data: allRequests = [], isLoading } = useQuery<ArchiveRequest[]>({
    queryKey: ['/api/archive/requests'],
    refetchInterval: 5000,
  });

  const filteredRequests = useMemo(() => {
    return allRequests.filter(req => {
      if (statusFilter !== 'all' && req.status !== statusFilter) return false;
      if (selectedYear && req.year !== parseInt(selectedYear)) return false;
      if (selectedMonth && req.month !== parseInt(selectedMonth)) return false;
      return true;
    });
  }, [allRequests, statusFilter, selectedYear, selectedMonth]);

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('POST', '/api/archive/approve', { requestId: id });
    },
    onSuccess: () => {
      toast({ title: labels.success });
      queryClient.invalidateQueries({ queryKey: ['/api/archive/requests'] });
      setConfirmingId(null);
    },
    onError: () => {
      toast({ title: labels.error, variant: 'destructive' });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('POST', '/api/archive/reject', { requestId: id });
    },
    onSuccess: () => {
      toast({ title: labels.success });
      queryClient.invalidateQueries({ queryKey: ['/api/archive/requests'] });
      setConfirmingId(null);
    },
    onError: () => {
      toast({ title: labels.error, variant: 'destructive' });
    },
  });

  const archiveItemMutation = useMutation({
    mutationFn: async (item: any) => {
      return await apiRequest('POST', '/api/archive/create-request', {
        postId: item.id,
        postTitle: item.title,
        postType: item.type,
        postDate: item.date,
        year: new Date(item.date).getFullYear(),
        month: new Date(item.date).getMonth() + 1,
      });
    },
    onSuccess: () => {
      toast({ title: labels.success });
      queryClient.invalidateQueries({ queryKey: ['/api/archive/requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/archive/suggest'] });
    },
    onError: () => {
      toast({ title: labels.error, variant: 'destructive' });
    },
  });

  const years = Array.from(
    new Set(allRequests.map(r => r.year).filter(Boolean))
  ).sort((a, b) => (b || 0) - (a || 0));

  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-40" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const pendingRequests = filteredRequests.filter(r => r.status === 'pending');
  const approvedRequests = filteredRequests.filter(r => r.status === 'approved');
  const rejectedRequests = filteredRequests.filter(r => r.status === 'rejected');

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{labels.title}</h1>
        <p className="text-muted-foreground">{labels.subtitle}</p>
      </div>

      <div className="flex gap-4 flex-wrap">
        <div className="flex-1 min-w-40">
          <label className="text-sm font-medium">{labels.selectYear}</label>
          <Select value={selectedYear || "all"} onValueChange={(v) => setSelectedYear(v === "all" ? "" : v)}>
            <SelectTrigger data-testid="select-year">
              <SelectValue placeholder={labels.noFilter} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{labels.noFilter}</SelectItem>
              {years.map(year => (
                <SelectItem key={year} value={String(year)}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 min-w-40">
          <label className="text-sm font-medium">{labels.selectMonth}</label>
          <Select value={selectedMonth || "all"} onValueChange={(v) => setSelectedMonth(v === "all" ? "" : v)}>
            <SelectTrigger data-testid="select-month">
              <SelectValue placeholder={labels.noFilter} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{labels.noFilter}</SelectItem>
              {months.map(month => (
                <SelectItem key={month} value={String(month)}>
                  {month}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-end gap-2">
          <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
            <SelectTrigger className="w-40" data-testid="select-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">{labels.pending}</SelectItem>
              <SelectItem value="approved">{labels.approved}</SelectItem>
              <SelectItem value="rejected">{labels.rejected}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {suggestedContent.length > 0 && (
        <Card className="p-6 space-y-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <h2 className="text-xl font-semibold">{language === 'en' ? 'Available Content' : 'Доступный контент'}</h2>
          <div className="text-sm text-muted-foreground mb-4">
            {language === 'en' 
              ? `Found ${suggestedContent.length} items matching filter`
              : `Найдено ${suggestedContent.length} элементов по фильтру`
            }
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {suggestedContent.map((item: any) => (
              <div key={`${item.id}-${item.type}`} className="flex items-center justify-between p-3 border rounded-md bg-white dark:bg-slate-900">
                <div className="flex-1">
                  <div className="font-medium">{item.title}</div>
                  <div className="text-sm text-muted-foreground">
                    {new Date(item.date).toLocaleDateString()} • {item.type === 'page' ? 'Page' : 'Post'}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => archiveItemMutation.mutate(item)}
                  disabled={archiveItemMutation.isPending}
                  data-testid={`button-archive-item-${item.id}`}
                >
                  {archiveItemMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    language === 'en' ? 'Archive' : 'Архивировать'
                  )}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {pendingRequests.length === 0 && approvedRequests.length === 0 && rejectedRequests.length === 0 && suggestedContent.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          {labels.noPending}
        </Card>
      ) : (
        <>
          {pendingRequests.length > 0 && (
            <Card className="p-6 space-y-4">
              <h2 className="text-xl font-semibold">{labels.pending}</h2>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {pendingRequests.map(req => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between p-4 border rounded-md bg-amber-50 dark:bg-amber-900/20"
                  >
                    <div className="flex-1">
                      <div className="font-medium">{req.postTitle}</div>
                      <div className="text-sm text-muted-foreground">
                        {req.postDate && new Date(req.postDate).toLocaleDateString()} {req.reason && `• ${req.reason}`}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => {
                          setConfirmingId(req.id);
                          setConfirmAction('approve');
                        }}
                        disabled={approveMutation.isPending}
                        data-testid={`button-approve-${req.id}`}
                      >
                        {approveMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <Check className="w-4 h-4 mr-1" />
                            {labels.approve}
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setConfirmingId(req.id);
                          setConfirmAction('reject');
                        }}
                        disabled={rejectMutation.isPending}
                        data-testid={`button-reject-${req.id}`}
                      >
                        {rejectMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <X className="w-4 h-4 mr-1" />
                            {labels.reject}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {approvedRequests.length > 0 && (
            <Card className="p-6 space-y-4">
              <h2 className="text-xl font-semibold">{labels.approved}</h2>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {approvedRequests.map(req => (
                  <div key={req.id} className="flex items-center justify-between p-4 border rounded-md bg-green-50 dark:bg-green-900/20">
                    <div>
                      <div className="font-medium">{req.postTitle}</div>
                      <div className="text-sm text-muted-foreground">
                        {req.postDate && new Date(req.postDate).toLocaleDateString()} {req.reason && `• ${req.reason}`}
                      </div>
                    </div>
                    <Badge variant="default" className="bg-green-500">{labels.approved}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {rejectedRequests.length > 0 && (
            <Card className="p-6 space-y-4">
              <h2 className="text-xl font-semibold">{labels.rejected}</h2>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {rejectedRequests.map(req => (
                  <div key={req.id} className="flex items-center justify-between p-4 border rounded-md opacity-60">
                    <div>
                      <div className="font-medium">{req.postTitle}</div>
                      <div className="text-sm text-muted-foreground">
                        {req.postDate && new Date(req.postDate).toLocaleDateString()} {req.reason && `• ${req.reason}`}
                      </div>
                    </div>
                    <Badge variant="outline">{labels.rejected}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      <AlertDialog open={!!confirmingId} onOpenChange={(open) => { if (!open) setConfirmingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === 'approve' ? labels.approveTitle : labels.rejectTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === 'approve' ? labels.approveDesc : labels.rejectDesc}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{labels.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmingId && confirmAction) {
                  if (confirmAction === 'approve') {
                    approveMutation.mutate(confirmingId);
                  } else {
                    rejectMutation.mutate(confirmingId);
                  }
                }
              }}
            >
              {confirmAction === 'approve' ? labels.approve : labels.reject}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
