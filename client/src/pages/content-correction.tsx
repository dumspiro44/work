import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useLanguage } from '@/contexts/LanguageContext';
import { Loader2, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
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

interface CategoryIssue {
  categoryId: number;
  categoryName: string;
  description: string;
  postsFound: number;
  status: 'broken' | 'fixed';
}

interface CorrectionStats {
  totalCategories: number;
  brokenCategories: number;
  fixedCategories: number;
  totalNewPosts: number;
  issues: CategoryIssue[];
}

export default function ContentCorrection() {
  const { toast } = useToast();
  const { language } = useLanguage();
  const [scanning, setScanning] = useState(false);
  const [correcting, setCorreacting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [selectedIssues, setSelectedIssues] = useState<number[]>([]);

  const labels = language === 'en' ? {
    title: 'Content Correction',
    subtitle: 'Fix broken category descriptions and reorganize content structure',
    scanBtn: 'Scan for Issues',
    correctBtn: 'Fix Selected Issues',
    scanDesc: 'Scans WordPress categories for HTML catalogs in descriptions (broken architecture)',
    correctionDesc: 'Converts HTML catalog items into proper WordPress posts within their categories',
    totalCategories: 'Total Categories',
    brokenCategories: 'Broken Categories',
    fixedCategories: 'Fixed Categories',
    newPosts: 'New Posts Created',
    noIssues: 'No broken categories found',
    scanning: 'Scanning categories...',
    correcting: 'Fixing issues...',
    categoryName: 'Category',
    foundPosts: 'Posts Found',
    status: 'Status',
    broken: 'Broken',
    fixed: 'Fixed',
    selectAll: 'Select All',
    deselectAll: 'Deselect All',
    confirmTitle: 'Fix Content Structure',
    confirmDesc: 'This will create new posts from HTML catalogs in category descriptions and clean up the descriptions. Continue?',
    success: 'Content corrected successfully',
    error: 'Error scanning or fixing content',
  } : {
    title: 'Коррекция контента',
    subtitle: 'Исправление неправильных описаний категорий и переорганизация структуры контента',
    scanBtn: 'Сканировать проблемы',
    correctBtn: 'Исправить выбранное',
    scanDesc: 'Сканирует категории WordPress на наличие HTML-каталогов в описаниях (нарушенная архитектура)',
    correctionDesc: 'Преобразует элементы HTML-каталога в правильные посты WordPress в их категориях',
    totalCategories: 'Всего категорий',
    brokenCategories: 'Нарушенных категорий',
    fixedCategories: 'Исправленных категорий',
    newPosts: 'Создано новых постов',
    noIssues: 'Нарушенных категорий не найдено',
    scanning: 'Сканирование категорий...',
    correcting: 'Исправление проблем...',
    categoryName: 'Категория',
    foundPosts: 'Найдено постов',
    status: 'Статус',
    broken: 'Нарушена',
    fixed: 'Исправлена',
    selectAll: 'Выбрать все',
    deselectAll: 'Отменить выбор',
    confirmTitle: 'Исправить структуру контента',
    confirmDesc: 'Это создаст новые посты из HTML-каталогов в описаниях категорий и очистит описания. Продолжить?',
    success: 'Контент успешно исправлен',
    error: 'Ошибка при сканировании или исправлении контента',
  };

  const { data: stats, isLoading } = useQuery<CorrectionStats>({
    queryKey: ['/api/content-correction/stats'],
    refetchInterval: 5000,
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      setScanning(true);
      const result = await apiRequest('POST', '/api/content-correction/scan', {});
      return result;
    },
    onSuccess: () => {
      toast({ title: labels.success });
      queryClient.invalidateQueries({ queryKey: ['/api/content-correction/stats'] });
    },
    onError: () => {
      toast({ title: labels.error, variant: 'destructive' });
    },
    onSettled: () => {
      setScanning(false);
    },
  });

  const correctMutation = useMutation({
    mutationFn: async () => {
      setCorreacting(true);
      const result = await apiRequest('POST', '/api/content-correction/fix', {
        categoryIds: selectedIssues.length > 0 ? selectedIssues : undefined,
      });
      return result;
    },
    onSuccess: () => {
      toast({ title: labels.success });
      queryClient.invalidateQueries({ queryKey: ['/api/content-correction/stats'] });
      setSelectedIssues([]);
      setShowConfirm(false);
    },
    onError: () => {
      toast({ title: labels.error, variant: 'destructive' });
    },
    onSettled: () => {
      setCorreacting(false);
    },
  });

  const handleSelectAll = () => {
    if (stats?.issues) {
      const brokenIds = stats.issues
        .filter(issue => issue.status === 'broken')
        .map(issue => issue.categoryId);
      setSelectedIssues(brokenIds);
    }
  };

  const handleDeselectAll = () => {
    setSelectedIssues([]);
  };

  const toggleIssue = (categoryId: number) => {
    setSelectedIssues(prev =>
      prev.includes(categoryId)
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const brokenIssues = stats?.issues.filter(i => i.status === 'broken') || [];
  const fixedIssues = stats?.issues.filter(i => i.status === 'fixed') || [];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{labels.title}</h1>
        <p className="text-muted-foreground">{labels.subtitle}</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">{labels.totalCategories}</div>
          <div className="text-3xl font-bold">{stats?.totalCategories || 0}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">{labels.brokenCategories}</div>
          <div className="text-3xl font-bold text-red-500">{stats?.brokenCategories || 0}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">{labels.fixedCategories}</div>
          <div className="text-3xl font-bold text-green-500">{stats?.fixedCategories || 0}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">{labels.newPosts}</div>
          <div className="text-3xl font-bold">{stats?.totalNewPosts || 0}</div>
        </Card>
      </div>

      <div className="flex gap-2">
        <Button
          onClick={() => scanMutation.mutate()}
          disabled={scanning || scanMutation.isPending}
          data-testid="button-scan-content"
        >
          {scanning || scanMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {labels.scanning}
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4 mr-2" />
              {labels.scanBtn}
            </>
          )}
        </Button>
        <Button
          onClick={() => setShowConfirm(true)}
          disabled={brokenIssues.length === 0 || correcting || correctMutation.isPending}
          variant="default"
          data-testid="button-correct-content"
        >
          {correcting || correctMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {labels.correcting}
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              {labels.correctBtn}
            </>
          )}
        </Button>
      </div>

      {brokenIssues.length === 0 && fixedIssues.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          {labels.noIssues}
        </Card>
      ) : (
        <>
          {brokenIssues.length > 0 && (
            <Card className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">{labels.brokenCategories}</h2>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={handleSelectAll} data-testid="button-select-all">
                    {labels.selectAll}
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleDeselectAll} data-testid="button-deselect-all">
                    {labels.deselectAll}
                  </Button>
                </div>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {brokenIssues.map(issue => (
                  <div
                    key={issue.categoryId}
                    className="flex items-center gap-3 p-3 border rounded-md hover-elevate cursor-pointer"
                    onClick={() => toggleIssue(issue.categoryId)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIssues.includes(issue.categoryId)}
                      onChange={() => toggleIssue(issue.categoryId)}
                      data-testid={`checkbox-category-${issue.categoryId}`}
                    />
                    <div className="flex-1">
                      <div className="font-medium">{issue.categoryName}</div>
                      <div className="text-sm text-muted-foreground">{issue.postsFound} {labels.foundPosts}</div>
                    </div>
                    <Badge variant="destructive">{labels.broken}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {fixedIssues.length > 0 && (
            <Card className="p-6 space-y-4">
              <h2 className="text-xl font-semibold">{labels.fixedCategories}</h2>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {fixedIssues.map(issue => (
                  <div
                    key={issue.categoryId}
                    className="flex items-center justify-between p-3 border rounded-md bg-green-50 dark:bg-green-900/20"
                  >
                    <div>
                      <div className="font-medium">{issue.categoryName}</div>
                      <div className="text-sm text-muted-foreground">{issue.postsFound} {labels.foundPosts}</div>
                    </div>
                    <Badge variant="default" className="bg-green-500">{labels.fixed}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{labels.confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{labels.confirmDesc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{language === 'en' ? 'Cancel' : 'Отмена'}</AlertDialogCancel>
            <AlertDialogAction onClick={() => correctMutation.mutate()}>
              {language === 'en' ? 'Fix Issues' : 'Исправить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
