import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useLanguage } from '@/contexts/LanguageContext';
import { useWordPress } from '@/contexts/WordPressContext';
import { Input } from '@/components/ui/input';
import { Loader2, AlertCircle, CheckCircle2, RefreshCw, Search, Eye } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
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
  const { correctionStats, correctionStatsLoading: isLoading } = useWordPress();
  const [scanning, setScanning] = useState(false);
  const [correcting, setCorrecting] = useState(false);
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
    success: 'Items corrected successfully',
    scanSuccess: 'Categories scanned successfully',
    error: 'Error scanning or fixing content',
    searchPlaceholder: 'Search categories...',
    noResults: 'No categories found for your search. Try clicking "Scan for Issues" to refresh.',
    previewBtn: 'Preview Posts',
    previewTitle: 'Posts to be created for {category}',
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
    newPosts: 'Будет создано новых постов',
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
    scanSuccess: 'Сканирование успешно завершено',
    error: 'Ошибка при сканировании или исправлении контента',
    searchPlaceholder: 'Поиск категорий (по названию)...',
    noResults: 'По вашему запросу ничего не найдено. Попробуйте нажать "Сканировать проблемы", чтобы обновить список всех категорий.',
    previewBtn: 'Просмотр списка',
    previewTitle: 'Посты для создания в категории "{category}"',
  };

  const stats = correctionStats;
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [viewingCategory, setViewingCategory] = useState<{ id: number; name: string } | null>(null);
  const [previewItems, setPreviewItems] = useState<any[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const ITEMS_PER_PAGE = 10;

  // Reset page when searching
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const scanMutation = useMutation({
    mutationFn: async () => {
      setScanning(true);
      const result = await apiRequest('POST', '/api/content-correction/scan', {});
      setCurrentPage(1);
      return result;
    },
    onSuccess: () => {
      toast({ title: labels.scanSuccess });
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
      setCorrecting(true);
      const result = await apiRequest('POST', '/api/content-correction/fix', {
        categoryIds: selectedIssues.length > 0 ? selectedIssues : undefined,
      });
      return result;
    },
    onSuccess: (data: any) => {
      if (data.fixed && data.fixed.length > 0) {
        toast({ title: labels.success, description: `${labels.newPosts}: ${data.totalPostsCreated}` });
      } else {
        toast({ title: 'No issues fixed', description: 'Make sure you selected categories with broken HTML catalogs.', variant: 'default' });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/content-correction/stats'] });
      setSelectedIssues([]);
      setShowConfirm(false);
    },
    onError: (error: Error) => {
      console.error('[CORRECTION] Fix error:', error);
      toast({ title: labels.error, description: error.message, variant: 'destructive' });
    },
    onSettled: () => {
      setCorrecting(false);
    },
  });

  const handleSelectAll = () => {
    if (stats?.issues) {
      const brokenIds = (stats.issues as any[])
        .filter((issue: any) => issue.status === 'broken')
        .map((issue: any) => issue.categoryId);
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

  const brokenIssues = ((stats?.issues as any[])?.filter((i: any) => i.status === 'broken' || i.status === 'fixed') || [])
    .filter((i: any) => i.categoryName.toLowerCase().includes(searchTerm.toLowerCase()));
  const fixedIssues = ((stats?.issues as any[])?.filter((i: any) => i.status === 'fixed') || [])
    .filter((i: any) => i.categoryName.toLowerCase().includes(searchTerm.toLowerCase()));

  const totalPages = Math.ceil(brokenIssues.length / ITEMS_PER_PAGE);
  const paginatedIssues = brokenIssues.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    const fetchPreview = async (category: { id: number; name: string }) => {
      setLoadingPreview(true);
      setViewingCategory(category);
      try {
        const data = await apiRequest('GET', `/api/content-correction/preview/${category.id}`);
        setPreviewItems(data.items || []);
      } catch (err) {
        toast({ title: labels.error, variant: 'destructive' });
      } finally {
        setLoadingPreview(false);
      }
    };

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

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
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
            disabled={brokenIssues.length === 0 || correcting || correctMutation.isPending || (selectedIssues.length === 0 && (stats?.issues as any[])?.some((i: any) => i.status === 'broken'))}
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

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={labels.searchPlaceholder}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {brokenIssues.length === 0 && fixedIssues.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          {searchTerm ? labels.noResults : labels.noIssues}
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
              <div className="space-y-2">
                {paginatedIssues.map((issue: any) => (
                  <div
                    key={`${issue.categoryId}-${issue.status}`}
                    className="flex items-center gap-3 p-3 border rounded-md hover-elevate cursor-pointer group"
                    onClick={() => toggleIssue(issue.categoryId)}
                  >
                    <Checkbox
                      id={`check-${issue.categoryId}`}
                      checked={selectedIssues.includes(issue.categoryId)}
                      onCheckedChange={() => toggleIssue(issue.categoryId)}
                      onClick={(e) => e.stopPropagation()}
                      data-testid={`checkbox-category-${issue.categoryId}`}
                      className="w-5 h-5"
                    />
                    <div className="flex-1">
                      <div className="font-medium leading-none mb-1">{issue.categoryName}</div>
                      <div className="text-sm text-muted-foreground">{issue.postsFound} {labels.foundPosts}</div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        fetchPreview({ id: issue.categoryId, name: issue.categoryName });
                      }}
                      className="gap-2"
                    >
                      <Eye className="h-4 w-4" />
                      {labels.previewBtn}
                    </Button>
                    <Badge variant="destructive">{labels.broken}</Badge>
                  </div>
                ))}
              </div>

              {totalPages > 1 && (
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
                    {language === 'en' ? `Page ${currentPage} of ${totalPages}` : `Страница ${currentPage} из ${totalPages}`}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                  >
                    {language === 'en' ? 'Next' : 'Вперед'}
                  </Button>
                </div>
              )}
            </Card>
          )}

          {fixedIssues.length > 0 && (
            <Card className="p-6 space-y-4">
              <h2 className="text-xl font-semibold">{labels.fixedCategories}</h2>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {fixedIssues.map((issue: any) => (
                  <div
                    key={`${issue.categoryId}-${issue.status}`}
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

      <Dialog open={!!viewingCategory} onOpenChange={(open) => !open && setViewingCategory(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {labels.previewTitle.replace('{category}', viewingCategory?.name || '')}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto mt-4 space-y-4">
            {loadingPreview ? (
              <div className="flex flex-col items-center justify-center p-12 space-y-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">{labels.scanning}</p>
              </div>
            ) : previewItems.length > 0 ? (
              <div className="space-y-3">
                {previewItems.map((item, idx) => (
                  <div key={idx} className="p-3 border rounded-md space-y-1 bg-slate-50 dark:bg-slate-900/50">
                    <h1 className="text-lg font-bold">
                      {item.title.charAt(0).toUpperCase() + item.title.slice(1).toLowerCase()}
                    </h1>
                    {item.link && (
                      <a 
                        href={item.link.startsWith('http') ? item.link : `https://${item.link}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-xs text-blue-500 truncate hover:underline block"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {item.link}
                      </a>
                    )}
                    {item.description && (
                      <div className="text-sm text-muted-foreground">{item.description}</div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center p-12 text-muted-foreground italic">
                {language === 'en' ? 'No items found to convert' : 'Элементы для конвертации не найдены'}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
