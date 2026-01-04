import { useState, useMemo, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useLanguage } from '@/contexts/LanguageContext';
import { useWordPress } from '@/contexts/WordPressContext';
import { Loader2, Archive, Check, X, Eye, Trash2 } from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';

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
  const [selectedType, setSelectedType] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<'approve' | 'reject' | null>(null);
  const [bulkYear, setBulkYear] = useState('');
  const [bulkMonth, setBulkMonth] = useState('');
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [viewingItemId, setViewingItemId] = useState<number | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const { data: allRequests = [], isLoading } = useQuery<ArchiveRequest[]>({
    queryKey: ['/api/archive/requests'],
  });

  const { data: allContentData, isLoading: isAllContentLoading } = useQuery<{ content: any[] }>({
    queryKey: ['/api/archive/all-content', selectedYear, selectedMonth, selectedType],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedYear) params.append('year', selectedYear);
      if (selectedMonth) params.append('month', selectedMonth);
      if (selectedType && selectedType !== 'all') params.append('contentType', selectedType);
      
      return await apiRequest('GET', `/api/archive/all-content?${params.toString()}`);
    }
  });

  const archiveContent = allContentData?.content || [];
  const archiveContentLoading = isAllContentLoading;

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedYear, selectedMonth, selectedType, statusFilter]);

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
    deleteSuccess: 'Content successfully removed from site',
    archiveSuccess: 'Content successfully archived to drafts',
    error: 'Error: WordPress server timed out. This often happens with large catalogs. Please try again in a few moments.',
    bulkArchive: 'Archive All Older Than',
    bulkConfirm: 'Archive all content older than selected date?',
    bulkSuccess: 'Bulk archive started. This may take a few minutes.',
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
    deleteSuccess: 'Контент успешно удален с сайта',
    archiveSuccess: 'Контент успешно перемещен в черновики',
    error: 'Ошибка: WordPress сервер не ответил вовремя. Это часто случается при больших каталогах. Попробуйте еще раз через минуту.',
    bulkArchive: 'Архивировать всё старше чем',
    bulkConfirm: 'Архивировать весь контент старше выбранной даты?',
    bulkSuccess: 'Массовое архивирование началось. Это может занять несколько минут.',
  };


  const suggestedContent = useMemo(() => {
    return archiveContent.filter((item: any) => {
      // Filter out items that already have a request (pending or approved)
      const hasRequest = allRequests.some(req => 
        req.postId === item.id && 
        req.postType === (item.type === 'page' ? 'page' : 'post') &&
        req.status !== 'rejected'
      );
      if (hasRequest) return false;

      const itemYear = new Date(item.date).getFullYear().toString();
      const itemMonth = (new Date(item.date).getMonth() + 1).toString();
      const itemType = item.type;
      
      if (selectedYear && itemYear !== selectedYear) return false;
      if (selectedMonth && itemMonth !== selectedMonth) return false;
      if (selectedType && selectedType !== 'all' && itemType !== selectedType) return false;
      return true;
    });
  }, [archiveContent, selectedYear, selectedMonth, selectedType, allRequests]);

  const viewingItem = useMemo(() => {
    if (!viewingItemId) return null;
    return suggestedContent.find((item: any) => item.id === viewingItemId) || null;
  }, [viewingItemId, suggestedContent]);

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
    onSuccess: async (data, id) => {
      const request = allRequests.find(r => r.id === id);
      const message = request?.reason === 'delete' ? labels.deleteSuccess : labels.archiveSuccess;
      
      toast({ title: message });
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
    mutationFn: async ({ item, action }: { item: any, action?: string }) => {
      return await apiRequest('POST', '/api/archive/create-request', {
        postId: item.id,
        postTitle: item.title,
        postType: item.type,
        postDate: item.date,
        year: new Date(item.date).getFullYear(),
        month: new Date(item.date).getMonth() + 1,
        reason: action || 'archive',
      });
    },
    onSuccess: (_, variables) => {
      const actionText = variables.action === 'delete' 
        ? (language === 'en' ? 'Delete request created' : 'Запрос на удаление создан')
        : (language === 'en' ? 'Archive request created' : 'Запрос на архивацию создан');
      
      toast({ title: actionText });
      queryClient.invalidateQueries({ queryKey: ['/api/archive/requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/archive/all-content'] });
    },
    onError: () => {
      toast({ title: labels.error, variant: 'destructive' });
    },
  });

  const bulkArchiveMutation = useMutation({
    mutationFn: async () => {
      if (!bulkYear || !bulkMonth) throw new Error('Year and month required');
      return await apiRequest('POST', '/api/archive/bulk-archive', {
        year: parseInt(bulkYear),
        month: parseInt(bulkMonth),
      });
    },
    onSuccess: () => {
      toast({ title: labels.bulkSuccess });
      queryClient.invalidateQueries({ queryKey: ['/api/archive/requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/archive/suggest'] });
      setShowBulkConfirm(false);
      setBulkYear('');
      setBulkMonth('');
    },
    onError: () => {
      toast({ title: labels.error, variant: 'destructive' });
    },
  });

  const availableYears = Array.from(
    new Set(archiveContent.map((item: any) => new Date(item.date).getFullYear()).filter(Boolean))
  ).sort((a: number, b: number) => b - a);

  // Fallback years if nothing loaded yet
  const years = availableYears.length > 0 ? availableYears : [new Date().getFullYear(), new Date().getFullYear() - 1];

  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  if (isLoading || archiveContentLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">{labels.title}</h1>
          <p className="text-muted-foreground">{labels.subtitle}</p>
        </div>
        <Card className="p-12 flex flex-col items-center justify-center space-y-4 bg-slate-50 dark:bg-slate-900/50">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <div className="text-center space-y-2">
            <h3 className="text-lg font-semibold">
              {language === 'en' ? 'Loading Content...' : 'Загрузка контента...'}
            </h3>
            <p className="text-sm text-muted-foreground max-w-md">
              {language === 'en' 
                ? 'We are fetching all posts and pages from WordPress. Since your catalog is large, this may take up to a minute. Please wait.' 
                : 'Мы загружаем все записи и страницы из WordPress. Так как у вас большой каталог, это может занять до минуты. Пожалуйста, подождите.'}
            </p>
          </div>
          <div className="w-full max-w-md space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4 mx-auto" />
          </div>
        </Card>
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

      <Card className="p-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
        <div className="space-y-2">
          <p className="font-semibold text-sm">
            {language === 'en' ? 'ℹ️ Important: Content is Not Deleted' : 'ℹ️ Важно: контент не удаляется'}
          </p>
          <p className="text-sm text-muted-foreground">
            {language === 'en' 
              ? 'When you archive content, it is NOT permanently deleted. Instead, it\'s moved to "draft" status in WordPress. This means the content remains in your database and can be recovered or republished at any time. You can safely archive old content knowing you can always restore it later.'
              : 'Когда вы архивируете контент, он НЕ удаляется полностью. Вместо этого он переносится в статус "draft" в WordPress. Это означает, что контент остаётся в вашей базе данных и может быть восстановлен или переопубликован в любое время. Вы можете безопасно архивировать старый контент, зная, что всегда сможете его восстановить позже.'
            }
          </p>
        </div>
      </Card>

      <div className="space-y-4">
        <div className="flex gap-4 flex-wrap">
          <div className="flex-1 min-w-40">
            <label className="text-sm font-medium">{labels.selectYear}</label>
            <Select value={selectedYear || "all"} onValueChange={(v) => setSelectedYear(v === "all" ? "" : v)}>
              <SelectTrigger data-testid="select-year">
                <SelectValue placeholder={labels.noFilter} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{labels.noFilter}</SelectItem>
                {years.map((year: number) => (
                  <SelectItem key={String(year)} value={String(year)}>
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
                {months.map((month: number) => (
                  <SelectItem key={String(month)} value={String(month)}>
                    {month}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 min-w-40">
            <label className="text-sm font-medium">{language === 'en' ? 'Content Type' : 'Тип контента'}</label>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger data-testid="select-type">
                <SelectValue placeholder={language === 'en' ? 'All types' : 'Все типы'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{language === 'en' ? 'All types' : 'Все типы'}</SelectItem>
                <SelectItem value="post">Posts</SelectItem>
                <SelectItem value="page">Pages</SelectItem>
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

        <Card className="p-4 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <div className="flex gap-4 items-end flex-wrap">
            <div className="flex-1 min-w-40">
              <label className="text-sm font-medium">{labels.bulkArchive} - Year</label>
              <Select value={bulkYear} onValueChange={setBulkYear}>
                <SelectTrigger data-testid="select-bulk-year">
                  <SelectValue placeholder={language === 'en' ? 'Select year' : 'Выбрать год'} />
                </SelectTrigger>
                <SelectContent>
                  {years.map((year: number) => (
                    <SelectItem key={String(year)} value={String(year)}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 min-w-40">
              <label className="text-sm font-medium">{labels.bulkArchive} - Month</label>
              <Select value={bulkMonth} onValueChange={setBulkMonth}>
                <SelectTrigger data-testid="select-bulk-month">
                  <SelectValue placeholder={language === 'en' ? 'Select month' : 'Выбрать месяц'} />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((month: number) => (
                    <SelectItem key={String(month)} value={String(month)}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="destructive"
              onClick={() => setShowBulkConfirm(true)}
              disabled={!bulkYear || !bulkMonth || bulkArchiveMutation.isPending}
              data-testid="button-bulk-archive"
            >
              {bulkArchiveMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Archive className="w-4 h-4 mr-2" />
              )}
              {labels.bulkArchive}
            </Button>
          </div>
        </Card>
      </div>

      {archiveContentLoading && (
        <Alert className="mb-4 bg-blue-950 border-blue-800">
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></div>
            <span>
              {language === 'en' 
                ? 'Loading content from WordPress... This may take a moment.' 
                : 'Загрузка контента из WordPress... Это может занять некоторое время.'}
            </span>
          </div>
        </Alert>
      )}

      {suggestedContent.length > 0 && (
        <Card className="p-6 space-y-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">{language === 'en' ? 'Available Content' : 'Доступный контент'}</h2>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelectedItems(new Set(suggestedContent.map((item: any) => item.id)))}
                data-testid="button-select-all"
              >
                {language === 'en' ? 'Select All' : 'Выбрать все'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelectedItems(new Set())}
                data-testid="button-deselect-all"
              >
                {language === 'en' ? 'Deselect All' : 'Отменить выделение'}
              </Button>
            </div>
          </div>
          <div className="text-sm text-muted-foreground mb-4">
            {language === 'en' 
              ? `Found ${suggestedContent.length} items matching filter • ${selectedItems.size} selected`
              : `Найдено ${suggestedContent.length} элементов по фильтру • ${selectedItems.size} выбрано`
            }
          </div>
          {selectedItems.size > 0 && (
            <Button
              variant="default"
              onClick={() => {
                const itemsToArchive = suggestedContent.filter((item: any) => selectedItems.has(item.id));
                itemsToArchive.forEach((item: any) => archiveItemMutation.mutate(item));
                setSelectedItems(new Set());
              }}
              disabled={archiveItemMutation.isPending}
              className="w-full"
              data-testid="button-archive-selected"
            >
              {archiveItemMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Archive className="w-4 h-4 mr-2" />
              )}
              {language === 'en' ? `Archive Selected (${selectedItems.size})` : `Архивировать выбранные (${selectedItems.size})`}
            </Button>
          )}
          <div className="space-y-2">
            {suggestedContent.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE).map((item: any) => (
              <div key={`${item.id}-${item.type}`} className="flex items-center gap-2 p-3 border rounded-md bg-white dark:bg-slate-900">
                <Checkbox
                  checked={selectedItems.has(item.id)}
                  onCheckedChange={(checked) => {
                    const newSelected = new Set(selectedItems);
                    if (checked) {
                      newSelected.add(item.id);
                    } else {
                      newSelected.delete(item.id);
                    }
                    setSelectedItems(newSelected);
                  }}
                  data-testid={`checkbox-item-${item.id}`}
                />
                <div className="flex-1">
                  <div className="font-medium">{item.title}</div>
                  <div className="text-sm text-muted-foreground">
                    {new Date(item.date).toLocaleDateString()} • {item.type === 'page' ? (language === 'en' ? 'Page' : 'Страница') : (language === 'en' ? 'Post' : 'Пост')}
                  </div>
                </div>
                <div className="flex gap-1">
                  {item.link && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setViewingItemId(item.id)}
                      data-testid={`button-view-item-${item.id}`}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    onClick={() => archiveItemMutation.mutate({ item, action: 'delete' })}
                    disabled={archiveItemMutation.isPending}
                    data-testid={`button-delete-item-${item.id}`}
                    title={language === 'en' ? 'Delete' : 'Удалить'}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => archiveItemMutation.mutate({ item, action: 'archive' })}
                    disabled={archiveItemMutation.isPending}
                    data-testid={`button-archive-item-${item.id}`}
                    title={language === 'en' ? 'Archive' : 'Архивировать'}
                  >
                    <Archive className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {suggestedContent.length > ITEMS_PER_PAGE && (
            <div className="flex items-center justify-center gap-2 pt-4 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                {language === 'en' ? 'Previous' : 'Назад'}
              </Button>
              <span className="text-sm text-muted-foreground">
                {language === 'en' 
                  ? `Page ${currentPage} of ${Math.ceil(suggestedContent.length / ITEMS_PER_PAGE)}` 
                  : `Страница ${currentPage} из ${Math.ceil(suggestedContent.length / ITEMS_PER_PAGE)}`}
              </span>
              <span className="text-xs text-muted-foreground ml-2">
                ({suggestedContent.length} {language === 'en' ? 'items' : 'элементов'})
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(Math.ceil(suggestedContent.length / ITEMS_PER_PAGE), prev + 1))}
                disabled={currentPage === Math.ceil(suggestedContent.length / ITEMS_PER_PAGE)}
              >
                {language === 'en' ? 'Next' : 'Вперед'}
              </Button>
            </div>
          )}
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
                      <div className="font-medium flex items-center gap-2">
                        {req.postTitle}
                        {req.reason === 'delete' && (
                          <Badge variant="destructive" className="text-[10px] px-1 h-4">
                            {language === 'en' ? 'Delete' : 'Удалить'}
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {req.postDate && new Date(req.postDate).toLocaleDateString()} {req.reason && req.reason !== 'delete' && req.reason !== 'archive' && `• ${req.reason}`}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => {
                          setConfirmingId(req.id);
                          approveMutation.mutate(req.id);
                        }}
                        disabled={approveMutation.isPending || rejectMutation.isPending}
                        data-testid={`button-approve-${req.id}`}
                      >
                        {(approveMutation.isPending && confirmingId === req.id) ? (
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
                          rejectMutation.mutate(req.id);
                        }}
                        disabled={approveMutation.isPending || rejectMutation.isPending}
                        data-testid={`button-reject-${req.id}`}
                      >
                        {(rejectMutation.isPending && confirmingId === req.id) ? (
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

      {/* AlertDialog for individual items removed for better UX - direct action now */}

      <AlertDialog open={showBulkConfirm} onOpenChange={setShowBulkConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {labels.bulkArchive}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'en' 
                ? `${labels.bulkConfirm} (${bulkMonth}/${bulkYear})`
                : `${labels.bulkConfirm} (${bulkMonth}/${bulkYear})`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{labels.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkArchiveMutation.mutate()}
            >
              {labels.bulkArchive}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!viewingItemId} onOpenChange={(open) => { if (!open) setViewingItemId(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>{viewingItem?.title}</DialogTitle>
            <div className="text-sm text-muted-foreground mt-2">
              <p>{language === 'en' ? 'Date: ' : 'Дата: '}{viewingItem?.date && new Date(viewingItem.date).toLocaleDateString()}</p>
              <p>{language === 'en' ? 'Type: ' : 'Тип: '}{viewingItem?.type === 'page' ? (language === 'en' ? 'Page' : 'Страница') : (language === 'en' ? 'Post' : 'Пост')}</p>
            </div>
            <DialogClose />
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {viewingItem?.content ? (
              <div className="prose dark:prose-invert max-w-none p-4">
                <div dangerouslySetInnerHTML={{ __html: viewingItem.content }} />
              </div>
            ) : (
              <div className="p-4 text-muted-foreground">
                {language === 'en' ? 'No content available' : 'Контент недоступен'}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
