import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useLanguage } from '@/contexts/LanguageContext';
import { useWordPress } from '@/contexts/WordPressContext';
import { Input } from '@/components/ui/input';
import { Loader2, RefreshCw, Eye, Sparkles, CheckCircle2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface CategoryIssue {
  categoryId: number;
  categoryName: string;
  description: string;
  postsFound: number;
  status: 'broken' | 'fixed';
  contentType?: 'TYPE_1_OFFER' | 'TYPE_2_CATALOG' | 'TYPE_3_REALTY' | 'TYPE_4_NAVIGATION';
  analysis?: {
    explanation: string;
    proposedActions: string[];
    refactoredContent?: string;
    newPosts?: any[];
  };
}

export default function ContentCorrection() {
  const { toast } = useToast();
  const { language } = useLanguage();
  const { correctionStats, correctionStatsLoading: isLoading } = useWordPress();
  const [scanning, setScanning] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [viewingCategory, setViewingCategory] = useState<CategoryIssue | null>(null);
  
  const ITEMS_PER_PAGE = 20;

  const labels = language === 'en' ? {
    title: 'Content Refactoring',
    subtitle: 'Advanced AI-powered content classification and restructuring',
    scanBtn: 'Scan for Issues',
    analyzeBtn: 'AI Analysis',
    correctBtn: 'Apply Refactoring',
    totalCategories: 'Total Categories',
    brokenCategories: 'Candidates',
    fixedCategories: 'Refactored',
    newPosts: 'New Posts',
    categoryName: 'Category',
    foundPosts: 'Items',
    status: 'Status',
    broken: 'Pending',
    fixed: 'Fixed',
  } : {
    title: 'Рефакторинг контента',
    subtitle: 'Продвинутая классификация и реорганизация контента с помощью ИИ',
    scanBtn: 'Сканировать',
    analyzeBtn: 'ИИ Анализ',
    correctBtn: 'Применить',
    totalCategories: 'Всего категорий',
    brokenCategories: 'Кандидаты',
    fixedCategories: 'Обработано',
    newPosts: 'Новых постов',
    categoryName: 'Категория',
    foundPosts: 'Элементов',
    status: 'Статус',
    broken: 'Ожидает',
    fixed: 'Исправлено',
  };

  const scanMutation = useMutation({
    mutationFn: async () => {
      setScanning(true);
      const result = await apiRequest('POST', '/api/content-correction/scan', {});
      return result;
    },
    onSuccess: () => {
      toast({ title: language === 'en' ? 'Scan complete' : 'Сканирование завершено' });
      queryClient.invalidateQueries({ queryKey: ['/api/content-correction/stats'] });
    },
    onSettled: () => setScanning(false)
  });

  const analyzeMutation = useMutation({
    mutationFn: async (issue: CategoryIssue) => {
      return await apiRequest('POST', '/api/content-correction/analyze', {
        categoryId: issue.categoryId,
        categoryName: issue.categoryName,
        description: issue.description,
      });
    },
    onSuccess: (data, variables) => {
      toast({ title: language === 'en' ? 'Analysis complete' : 'Анализ завершен' });
      queryClient.setQueryData(['/api/content-correction/stats'], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          issues: old.issues.map((i: any) => 
            i.categoryId === variables.categoryId ? { ...i, analysis: data, contentType: data.type || data.contentType } : i
          )
        };
      });
    },
    onError: (error: any) => {
      console.error('Analysis error:', error);
      toast({ 
        title: language === 'en' ? 'Analysis failed' : 'Анализ не удался',
        description: error.message || (language === 'en' ? 'Check logs for details' : 'Проверьте логи для деталей'),
        variant: 'destructive'
      });
    }
  });

  const applyMutation = useMutation({
    mutationFn: async (issue: CategoryIssue) => {
      if (!issue.analysis) return;
      setCorrecting(true);
      return await apiRequest('POST', '/api/content-correction/apply-refactoring', {
        categoryId: issue.categoryId,
        result: issue.analysis
      });
    },
    onSuccess: () => {
      toast({ title: language === 'en' ? 'Refactoring applied' : 'Рефакторинг применен' });
      queryClient.invalidateQueries({ queryKey: ['/api/content-correction/stats'] });
    },
    onSettled: () => setCorrecting(false)
  });

  if (isLoading) return <div className="p-6 space-y-6"><Skeleton className="h-40" /><Skeleton className="h-64" /></div>;

  const issues = (correctionStats?.issues || []) as CategoryIssue[];
  const filteredIssues = issues.filter(i => i.categoryName.toLowerCase().includes(searchTerm.toLowerCase()));
  const paginatedIssues = filteredIssues.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const getBadgeForType = (type?: string) => {
    switch (type) {
      case 'TYPE_1_OFFER': return <Badge variant="outline" className="bg-blue-50 text-blue-700">TYPE 1: Offer</Badge>;
      case 'TYPE_2_CATALOG': return <Badge variant="outline" className="bg-purple-50 text-purple-700">TYPE 2: Catalog</Badge>;
      case 'TYPE_3_REALTY': return <Badge variant="outline" className="bg-orange-50 text-orange-700">TYPE 3: Realty</Badge>;
      case 'TYPE_4_NAVIGATION': return <Badge variant="outline" className="bg-slate-50 text-slate-700">TYPE 4: Nav</Badge>;
      default: return null;
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold">{labels.title}</h1>
          <p className="text-muted-foreground">{labels.subtitle}</p>
        </div>
        <Button onClick={() => scanMutation.mutate()} disabled={scanning}>
          {scanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          {labels.scanBtn}
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4"><div className="text-sm text-muted-foreground">{labels.totalCategories}</div><div className="text-2xl font-bold">{correctionStats?.totalCategories || 0}</div></Card>
        <Card className="p-4"><div className="text-sm text-muted-foreground">{labels.brokenCategories}</div><div className="text-2xl font-bold text-red-500">{correctionStats?.brokenCategories || 0}</div></Card>
        <Card className="p-4"><div className="text-sm text-muted-foreground">{labels.fixedCategories}</div><div className="text-2xl font-bold text-green-500">{correctionStats?.fixedCategories || 0}</div></Card>
        <Card className="p-4"><div className="text-sm text-muted-foreground">{labels.newPosts}</div><div className="text-2xl font-bold">{correctionStats?.totalNewPosts || 0}</div></Card>
      </div>

      <Card className="p-6">
        <div className="flex gap-4 mb-6">
          <Input 
            placeholder={language === 'en' ? "Search categories..." : "Поиск категорий..."} 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-xs"
          />
        </div>

        <div className="space-y-3">
          {paginatedIssues.map(issue => (
            <div key={issue.categoryId} className="flex items-center justify-between p-4 border rounded-lg hover-elevate transition-colors cursor-pointer" onClick={() => analyzeMutation.mutate(issue)}>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-semibold text-lg">{issue.categoryName}</span>
                  {getBadgeForType(issue.contentType)}
                  {issue.status === 'fixed' && <Badge variant="default" className="bg-green-500">Fixed</Badge>}
                  {!issue.analysis && issue.status !== 'fixed' && (
                    <Badge variant="outline" className="text-yellow-600 border-yellow-200 bg-yellow-50">
                      {language === 'en' ? 'Needs Analysis' : 'Требуется анализ'}
                    </Badge>
                  )}
                </div>
                <div className="text-sm text-muted-foreground flex gap-4">
                  <span>ID: {issue.categoryId}</span>
                  <span>{issue.postsFound} {labels.foundPosts}</span>
                </div>
                {issue.analysis && (
                  <p className="text-xs mt-2 text-slate-500 italic max-w-2xl line-clamp-2">
                    {issue.analysis.explanation}
                  </p>
                )}
                
                {issue.analysis && issue.contentType === 'TYPE_1_OFFER' && (
                  <div className="mt-2 text-xs text-blue-600 font-medium">
                    {language === 'en' ? '✓ SEO Optimization Ready' : '✓ SEO-оптимизация готова'}
                  </div>
                )}
              </div>
              
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={(e) => { e.stopPropagation(); analyzeMutation.mutate(issue); }}
                  disabled={analyzeMutation.isPending}
                >
                  {analyzeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  <span className="ml-2">{labels.analyzeBtn}</span>
                </Button>
                
                {issue.analysis && issue.status !== 'fixed' && (
                  <Button 
                    size="sm" 
                    variant="default" 
                    onClick={(e) => { e.stopPropagation(); applyMutation.mutate(issue); }}
                    disabled={applyMutation.isPending}
                  >
                    {applyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    <span className="ml-2">{labels.correctBtn}</span>
                  </Button>
                )}
                
                <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setViewingCategory(issue); }}>
                  <Eye className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {filteredIssues.length > ITEMS_PER_PAGE && (
          <div className="flex items-center justify-center gap-4 mt-6 pt-6 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              {language === 'en' ? 'Previous' : 'Назад'}
            </Button>
            <span className="text-sm text-muted-foreground">
              {language === 'en' ? `Page ${currentPage} of ${Math.ceil(filteredIssues.length / ITEMS_PER_PAGE)}` : `Страница ${currentPage} из ${Math.ceil(filteredIssues.length / ITEMS_PER_PAGE)}`}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(Math.ceil(filteredIssues.length / ITEMS_PER_PAGE), p + 1))}
              disabled={currentPage === Math.ceil(filteredIssues.length / ITEMS_PER_PAGE)}
            >
              {language === 'en' ? 'Next' : 'Вперед'}
            </Button>
          </div>
        )}
      </Card>

      <Dialog open={!!viewingCategory} onOpenChange={() => setViewingCategory(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewingCategory?.categoryName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {viewingCategory?.analysis && (
              <div className="p-4 bg-accent/50 rounded-lg space-y-2">
                <h4 className="font-bold text-accent-foreground">AI Analysis Result</h4>
                <p className="text-sm">{viewingCategory.analysis.explanation}</p>
                <div className="mt-2">
                  <p className="text-xs font-bold uppercase text-accent-foreground/70">Proposed Actions:</p>
                  <ul className="list-disc list-inside text-sm">
                    {viewingCategory.analysis.proposedActions.map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                </div>
              </div>
            )}
            <div>
              <h4 className="font-bold mb-2">Original Content Preview</h4>
              <div 
                className="p-4 border rounded bg-muted/50 text-xs overflow-auto max-h-96 whitespace-pre-wrap font-mono text-foreground [&_*]:text-foreground [&_*]:!bg-transparent"
                dangerouslySetInnerHTML={{ __html: viewingCategory?.description || '' }}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
