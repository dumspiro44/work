import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useLanguage } from '@/contexts/LanguageContext';
import { Loader2, AlertCircle, AlertTriangle, CheckCircle2, Check } from 'lucide-react';
import type { WordPressPost } from '@/types';
import type { Settings } from '@shared/schema';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

type ContentType = 'posts' | 'pages' | 'all';

export default function SEOOptimization() {
  const { toast } = useToast();
  const { t, language } = useLanguage();
  
  const [contentType, setContentType] = useState<ContentType>('all');
  const [page, setPage] = useState(1);
  const [selectedPosts, setSelectedPosts] = useState<number[]>([]);
  const [processedPostIds, setProcessedPostIds] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem('seo_processed_posts');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('seo_processed_posts', JSON.stringify(processedPostIds));
  }, [processedPostIds]);

  const { data: settings } = useQuery<Settings>({
    queryKey: ['/api/settings'],
  });

  const { data: seoPosts = [], isLoading, isError, error } = useQuery<WordPressPost[]>({
    queryKey: ['/api/seo-posts'],
    queryFn: () => apiRequest('GET', '/api/seo-posts'),
    select: (data) => {
      let filtered = data;
      
      if (contentType === 'posts') {
        filtered = filtered.filter(p => p.type === 'post');
      } else if (contentType === 'pages') {
        filtered = filtered.filter(p => p.type === 'page');
      }
      
      return filtered;
    },
  });

  const itemsPerPage = 10;
  const paginatedPosts = useMemo(() => {
    const start = (page - 1) * itemsPerPage;
    return seoPosts.slice(start, start + itemsPerPage);
  }, [seoPosts, page]);

  const totalPages = Math.ceil(seoPosts.length / itemsPerPage);

  const updateFocusKeywordsMutation = useMutation({
    mutationFn: async (postIds: number[]) => {
      const results = await Promise.all(
        postIds.map(postId => {
          const post = seoPosts.find(p => p.id === postId);
          const focusKeyword = post?.title.rendered || '';
          return apiRequest('PATCH', `/api/seo-posts/${postId}`, { focusKeyword });
        })
      );
      return results;
    },
    onSuccess: () => {
      toast({
        title: language === 'ru' ? 'Успешно' : 'Success',
        description: language === 'ru' ? `${selectedPosts.length} фокусных ключевых слов обновлены` : `${selectedPosts.length} focus keywords updated`,
      });
      setProcessedPostIds(prev => [...prev, ...selectedPosts]);
      setSelectedPosts([]);
      queryClient.invalidateQueries({ queryKey: ['/api/seo-posts'] });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: language === 'ru' ? 'Ошибка' : 'Error',
        description: error.message,
      });
    },
  });

  const togglePost = (postId: number) => {
    setSelectedPosts(prev =>
      prev.includes(postId)
        ? prev.filter(id => id !== postId)
        : [...prev, postId]
    );
  };

  const toggleAll = () => {
    if (selectedPosts.length === paginatedPosts.length) {
      setSelectedPosts([]);
    } else {
      setSelectedPosts(paginatedPosts.map(p => p.id));
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{language === 'ru' ? '🎯 SEO Оптимизация' : '🎯 SEO Optimization'}</h1>
        <p className="text-muted-foreground">
          {language === 'ru' 
            ? 'Установите фокусные ключевые слова для всего контента'
            : 'Set focus keywords for all your content'}
        </p>
      </div>

      {/* Info */}
      <Alert className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950">
        <div className="flex gap-3 items-start">
          <CheckCircle2 className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm text-blue-900 dark:text-blue-100">
              {language === 'ru' 
                ? '✅ Система автоматически заполняет фокусные ключевые слова'
                : '✅ System automatically fills focus keywords'}
            </p>
            <p className="text-xs mt-1 text-blue-700 dark:text-blue-300">
              {language === 'ru'
                ? 'Фокусные ключевые слова устанавливаются на основе названия контента для SEO плагинов (Yoast, Rank Math, All in One SEO)'
                : 'Focus keywords are set based on content title for SEO plugins (Yoast, Rank Math, All in One SEO)'}
            </p>
          </div>
        </div>
      </Alert>

      {/* Stats & Filters */}
      <Card className="p-4 bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-950/30 dark:to-red-950/30 border-orange-200 dark:border-orange-800">
        <div className="flex gap-4 items-center justify-between flex-wrap">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {language === 'ru' 
                ? `⚠️ ${Math.max(0, seoPosts.length - processedPostIds.length)} контента требуют SEO оптимизации`
                : `⚠️ ${Math.max(0, seoPosts.length - processedPostIds.length)} items need SEO optimization`}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {language === 'ru'
                ? 'Это приоритетное действие для улучшения SEO'
                : 'This is a priority action to improve SEO'}
            </p>
          </div>

          <Select value={contentType} onValueChange={(value: any) => {
            setContentType(value);
            setPage(1);
          }}>
            <SelectTrigger className="w-48" data-testid="select-content-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{language === 'ru' ? 'Всё' : 'All'}</SelectItem>
              <SelectItem value="posts">{language === 'ru' ? 'Посты' : 'Posts'}</SelectItem>
              <SelectItem value="pages">{language === 'ru' ? 'Страницы' : 'Pages'}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : isError ? (
        <Card className="p-8 text-center border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950">
          <AlertCircle className="w-12 h-12 text-red-600 dark:text-red-400 mx-auto mb-3" />
          <p className="font-semibold text-red-900 dark:text-red-100">
            {language === 'ru' 
              ? '❌ Ошибка подключения к WordPress'
              : '❌ WordPress connection error'}
          </p>
          <p className="text-sm text-red-700 dark:text-red-300 mt-2">
            {language === 'ru'
              ? 'Проверьте данные подключения на странице Настроек'
              : 'Check your connection details in Settings'}
          </p>
        </Card>
      ) : seoPosts.length === 0 ? (
        <Card className="p-8 text-center border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950">
          <CheckCircle2 className="w-12 h-12 text-green-600 dark:text-green-400 mx-auto mb-3" />
          <p className="font-semibold text-green-900 dark:text-green-100">
            {language === 'ru' 
              ? 'Поздравляем! Все посты уже имеют фокусные ключевые слова 🎉'
              : 'Congratulations! All posts have focus keywords 🎉'}
          </p>
        </Card>
      ) : (
        <>
          {/* Posts List */}
          <div className="space-y-3">
            {/* Select All Checkbox */}
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <Checkbox
                checked={selectedPosts.length === paginatedPosts.length && paginatedPosts.length > 0}
                onCheckedChange={toggleAll}
                data-testid="checkbox-select-all"
              />
              <label className="text-sm font-medium cursor-pointer flex-1">
                {selectedPosts.length === 0
                  ? language === 'ru' ? 'Выбрать всё на странице' : 'Select all on page'
                  : language === 'ru' ? `Выбрано: ${selectedPosts.length}` : `Selected: ${selectedPosts.length}`}
              </label>
              {selectedPosts.length > 0 && (
                <Badge variant="default">{selectedPosts.length}</Badge>
              )}
            </div>

            {/* Posts */}
            {paginatedPosts.map((post) => (
              <div key={post.id} className="flex items-start gap-3 p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                <Checkbox
                  checked={selectedPosts.includes(post.id)}
                  onCheckedChange={() => togglePost(post.id)}
                  data-testid={`checkbox-post-${post.id}`}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <h3 className="font-semibold truncate">{post.title.rendered}</h3>
                      <p className="text-sm text-muted-foreground">
                        {post.type === 'post' ? (language === 'ru' ? 'Пост' : 'Post') : (language === 'ru' ? 'Страница' : 'Page')} • ID: {post.id}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {processedPostIds.includes(post.id) ? (
                        <>
                          <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
                          <span className="text-xs font-semibold text-green-700 dark:text-green-300 whitespace-nowrap">
                            {language === 'ru' ? 'Исправлено' : 'Fixed'}
                          </span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                          <span className="text-xs font-semibold text-yellow-700 dark:text-yellow-300 whitespace-nowrap">
                            {language === 'ru' ? 'Нет ключевого слова' : 'No keyword'}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex gap-2 justify-center pt-4">
              <Button
                variant="outline"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
              >
                {language === 'ru' ? 'Назад' : 'Previous'}
              </Button>
              <div className="flex items-center px-4 text-sm">
                {language === 'ru' 
                  ? `Страница ${page} из ${totalPages}`
                  : `Page ${page} of ${totalPages}`}
              </div>
              <Button
                variant="outline"
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
              >
                {language === 'ru' ? 'Далее' : 'Next'}
              </Button>
            </div>
          )}
        </>
      )}

      {/* Action Button */}
      {selectedPosts.length > 0 && (
        <div className="sticky bottom-6 flex justify-center">
          <Button
            onClick={() => updateFocusKeywordsMutation.mutate(selectedPosts)}
            disabled={updateFocusKeywordsMutation.isPending}
            size="lg"
            className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 shadow-lg"
            data-testid="button-fix-keywords"
          >
            {updateFocusKeywordsMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {language === 'ru' 
              ? `🔧 Исправить ${selectedPosts.length} элемент(ов)` 
              : `🔧 Fix ${selectedPosts.length} item(s)`}
          </Button>
        </div>
      )}
    </div>
  );
}
