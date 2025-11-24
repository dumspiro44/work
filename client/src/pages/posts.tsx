import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useLanguage } from '@/contexts/LanguageContext';
import { Loader2, AlertCircle, Upload, CheckCircle2 } from 'lucide-react';
import { EditTranslationModal } from '@/components/edit-translation-modal';
import type { WordPressPost } from '@/types';
import type { Settings, TranslationJob } from '@shared/schema';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

type ContentType = 'posts' | 'pages' | 'all';

export default function Posts() {
  const { toast } = useToast();
  const { t, language } = useLanguage();
  
  const [selectedPosts, setSelectedPosts] = useState<number[]>([]);
  const [editingPost, setEditingPost] = useState<{ id: number; title: string; content: string } | null>(null);
  const [editedContent, setEditedContent] = useState('');
  const [contentType, setContentType] = useState<ContentType>('all');
  const [page, setPage] = useState(1);
  const [polylangChecked, setPolylangChecked] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [translationProgress, setTranslationProgress] = useState<{ jobId: string; progress: number } | null>(null);
  const [activeTranslationIds, setActiveTranslationIds] = useState<number[]>([]);
  const [showCompletionMessage, setShowCompletionMessage] = useState(false);

  // Fetch settings to get target languages
  const { data: settings } = useQuery<Settings>({
    queryKey: ['/api/settings'],
  });

  // Fetch jobs to map translations
  const { data: jobs = [] } = useQuery<TranslationJob[]>({
    queryKey: ['/api/jobs'],
    refetchInterval: 2000, // Auto-refresh every 2 seconds
  });

  // Track translation progress
  useEffect(() => {
    if (activeTranslationIds.length === 0) return;

    const completedJobs = jobs.filter(
      (j) => activeTranslationIds.includes(j.postId) && j.status === 'COMPLETED'
    );

    // If all translations are completed
    if (completedJobs.length === activeTranslationIds.length) {
      setShowCompletionMessage(true);
      toast({
        title: language === 'ru' ? '✅ Переводы выполнены!' : '✅ Translations completed!',
        description: language === 'ru'
          ? `${completedJobs.length} переводов готовы к публикации`
          : `${completedJobs.length} translations ready for publishing`,
      });
      setActiveTranslationIds([]);

      // Auto-hide message after 5 seconds
      setTimeout(() => setShowCompletionMessage(false), 5000);
    }
  }, [jobs, activeTranslationIds, language, toast]);

  // Check Polylang on mount
  const polylangQuery = useQuery<{ success: boolean; message: string }>({
    queryKey: ['/api/check-polylang'],
    enabled: !polylangChecked,
  });

  // Fetch posts/pages
  const { data: allContent = [], isLoading, refetch } = useQuery<WordPressPost[]>({
    queryKey: ['/api/posts'],
    queryFn: () => apiRequest('GET', '/api/posts'),
    select: (data) => {
      if (contentType === 'posts') {
        return data.filter(p => p.type === 'post');
      } else if (contentType === 'pages') {
        return data.filter(p => p.type === 'page');
      }
      return data;
    },
  });

  // Pagination
  const itemsPerPage = 10;
  const paginatedContent = useMemo(() => {
    const start = (page - 1) * itemsPerPage;
    return allContent.slice(start, start + itemsPerPage);
  }, [allContent, page]);

  const totalPages = Math.ceil(allContent.length / itemsPerPage);

  const translateMutation = useMutation({
    mutationFn: (postIds: number[]) => apiRequest('POST', '/api/translate', { postIds }),
    onSuccess: (data: any) => {
      // Show warning that process will take time
      toast({
        title: language === 'ru' ? '⏱️ Перевод начат' : '⏱️ Translation started',
        description: language === 'ru' 
          ? `${selectedPosts.length} элемент(ов) добавлен(о) в очередь. Процесс может занять некоторое время...`
          : `${selectedPosts.length} item(s) queued for translation. This may take a while...`,
      });
      
      // Track active translations
      setActiveTranslationIds(selectedPosts);
      setShowCompletionMessage(false);
      setSelectedPosts([]);
      
      // Fetch jobs to track progress
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
        queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      }, 1000);
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: language === 'ru' ? 'Ошибка перевода' : 'Translation failed',
        description: error.message,
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ postId, content }: { postId: number; content: string }) =>
      apiRequest('PATCH', `/api/posts/${postId}`, { content }),
    onSuccess: () => {
      toast({
        title: language === 'ru' ? 'Обновлено' : 'Updated',
        description: language === 'ru' ? 'Контент успешно обновлен' : 'Content updated successfully.',
      });
      setEditingPost(null);
      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: language === 'ru' ? 'Ошибка обновления' : 'Update failed',
        description: error.message,
      });
    },
  });

  const manualTranslateMutation = useMutation({
    mutationFn: (postId: number) => apiRequest('POST', `/api/translate-manual`, { postId }),
    onSuccess: () => {
      toast({
        title: language === 'ru' ? 'Перевод запущен' : 'Translation started',
        description: language === 'ru' ? 'Контент переводится' : 'Content is being translated.',
      });
      setEditingPost(null);
      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: language === 'ru' ? 'Ошибка' : 'Error',
        description: error.message,
      });
    },
  });

  const publishMutation = useMutation({
    mutationFn: (jobId: string) => apiRequest('POST', '/api/jobs/' + jobId + '/publish', {}),
    onSuccess: (data: any) => {
      toast({
        title: language === 'ru' ? 'Успешно' : 'Success',
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      setSelectedJobId(null);
    },
    onError: (error: Error) => {
      if (error.message.includes('POLYLANG_NOT_INSTALLED')) {
        toast({
          variant: 'destructive',
          title: language === 'ru' ? 'Polylang не установлен' : 'Polylang not installed',
          description: language === 'ru' ? 'Установите плагин Polylang на сайте WordPress' : 'Please install Polylang plugin on your WordPress site',
        });
      } else {
        toast({
          variant: 'destructive',
          title: language === 'ru' ? 'Ошибка публикации' : 'Publish failed',
          description: error.message,
        });
      }
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
    if (selectedPosts.length === paginatedContent.length) {
      setSelectedPosts([]);
    } else {
      setSelectedPosts(paginatedContent.map(p => p.id));
    }
  };

  const handleTranslate = () => {
    if (selectedPosts.length === 0) {
      toast({
        variant: 'destructive',
        title: language === 'ru' ? 'Не выбрано' : 'No items selected',
        description: language === 'ru' ? 'Выберите контент для перевода' : 'Please select at least one item to translate.',
      });
      return;
    }
    translateMutation.mutate(selectedPosts);
  };

  const openEditDialog = (post: WordPressPost) => {
    setEditingPost({
      id: post.id,
      title: post.title.rendered,
      content: post.content.rendered,
    });
    setEditedContent(post.content.rendered);
  };

  const handleSaveEdit = () => {
    if (editingPost) {
      updateMutation.mutate({ postId: editingPost.id, content: editedContent });
    }
  };

  const handleManualTranslate = () => {
    if (editingPost) {
      manualTranslateMutation.mutate(editingPost.id);
    }
  };

  const getTranslationBadges = (post: WordPressPost) => {
    const targetLanguages = settings?.targetLanguages || [];
    
    if (targetLanguages.length === 0) {
      return <Badge variant="outline">{language === 'ru' ? 'Нет языков' : 'No languages'}</Badge>;
    }

    return (
      <div className="flex flex-wrap gap-2 items-center" data-testid={'badges-translations-' + post.id}>
        {targetLanguages.map((lang) => {
          const isTranslated = post.translations && post.translations[lang];
          const job = jobs.find(
            (j) => j.postId === post.id && j.targetLanguage === lang && j.status === 'COMPLETED'
          );
          const cursorClass = job ? 'cursor-pointer' : 'cursor-not-allowed';
          const badgeClass = (isTranslated || job) ? 'bg-green-600 hover:bg-green-700' : '';
          const tooltipText = job 
            ? (language === 'ru' ? `Просмотр и редактирование перевода на ${lang.toUpperCase()}` : `View and edit translation in ${lang.toUpperCase()}`)
            : (language === 'ru' ? `Перевод на ${lang.toUpperCase()} ещё не готов` : `Translation to ${lang.toUpperCase()} not ready yet`);
          
          return (
            <Tooltip key={lang}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => job && setSelectedJobId(job.id)}
                  disabled={!job}
                  className="focus:outline-none"
                  data-testid={'button-lang-' + post.id + '-' + lang}
                >
                  <Badge 
                    variant={isTranslated || job ? "default" : "secondary"}
                    className={cursorClass + ' ' + badgeClass}
                  >
                    {lang.toUpperCase()}
                  </Badge>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {tooltipText}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    );
  };

  const isPolylangActive = polylangQuery.data?.success;

  if (isLoading) {
    return (
      <div className="p-6 md:p-8 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t('posts_management')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('posts_management_desc')}</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => refetch()}
            disabled={isLoading}
            variant="outline"
            data-testid="button-refresh-posts"
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {language === 'ru' ? 'Обновить' : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* Polylang Alert */}
      {polylangQuery.data && !isPolylangActive && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <span className="font-semibold">{t('polylang_required')}</span>: {t('install_polylang')}
          </AlertDescription>
        </Alert>
      )}

      {/* Translation Progress */}
      {activeTranslationIds.length > 0 && (
        <Card className="p-4 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">
                {language === 'ru' ? '📊 Прогресс перевода' : '📊 Translation Progress'}
              </span>
              <span className="text-sm font-mono">
                {jobs.filter(j => activeTranslationIds.includes(j.postId) && j.status === 'COMPLETED').length} / {activeTranslationIds.length * (settings?.targetLanguages?.length || 1)}
              </span>
            </div>
            <Progress 
              value={(jobs.filter(j => activeTranslationIds.includes(j.postId) && j.status === 'COMPLETED').length / (activeTranslationIds.length * (settings?.targetLanguages?.length || 1))) * 100}
              className="h-2"
              data-testid="progress-translation"
            />
            <p className="text-xs text-muted-foreground">
              {language === 'ru' 
                ? `${activeTranslationIds.length} элемент(ов) переводится на ${settings?.targetLanguages?.length || 0} язык(ов)...`
                : `${activeTranslationIds.length} item(s) being translated into ${settings?.targetLanguages?.length || 0} language(s)...`
              }
            </p>
          </div>
        </Card>
      )}

      {/* Completion Message */}
      {showCompletionMessage && (
        <Card className="p-4 bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
            <div>
              <p className="font-semibold text-sm text-green-900 dark:text-green-100">
                {language === 'ru' ? '✅ Все переводы завершены!' : '✅ All translations completed!'}
              </p>
              <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                {language === 'ru' 
                  ? 'Вы можете просмотреть и отредактировать переводы перед публикацией'
                  : 'You can now review and edit translations before publishing'
                }
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label className="text-sm font-medium mb-2 block">{t('content_type')}</Label>
            <Select value={contentType} onValueChange={(value: any) => {
              setContentType(value);
              setPage(1);
            }}>
              <SelectTrigger data-testid="select-content-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="posts">{t('posts')}</SelectItem>
                <SelectItem value="pages">{t('pages')}</SelectItem>
                <SelectItem value="all">{t('all_content')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isLoading}
            data-testid="button-import"
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('import_content')}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setPolylangChecked(false);
              polylangQuery.refetch();
            }}
            data-testid="button-check-polylang"
          >
            {t('check_polylang')}
          </Button>
        </div>
      </Card>

      {/* Content Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b">
              <tr className="text-left">
                <th className="p-4 w-12">
                  <Checkbox
                    checked={selectedPosts.length === paginatedContent.length && paginatedContent.length > 0}
                    onCheckedChange={toggleAll}
                    data-testid="checkbox-select-all"
                  />
                </th>
                <th className="p-4 text-xs font-semibold uppercase text-muted-foreground">{t('id_col')}</th>
                <th className="p-4 text-xs font-semibold uppercase text-muted-foreground">{t('title_col')}</th>
                <th className="p-4 text-xs font-semibold uppercase text-muted-foreground">{t('type_col')}</th>
                <th className="p-4 text-xs font-semibold uppercase text-muted-foreground">{t('status_col')}</th>
                <th className="p-4 text-xs font-semibold uppercase text-muted-foreground">{t('actions_col')}</th>
              </tr>
            </thead>
            <tbody>
              {paginatedContent.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    {t('no_content_found')}
                  </td>
                </tr>
              ) : (
                paginatedContent.map((post) => (
                  <tr key={post.id} className="border-b hover-elevate" data-testid={'row-post-' + post.id}>
                    <td className="p-4">
                      <Checkbox
                        checked={selectedPosts.includes(post.id)}
                        onCheckedChange={() => togglePost(post.id)}
                        data-testid={'checkbox-post-' + post.id}
                      />
                    </td>
                    <td className="p-4 text-sm font-mono">{post.id}</td>
                    <td className="p-4 text-sm font-medium">{post.title.rendered}</td>
                    <td className="p-4 text-sm">{post.type === 'post' ? t('post') : t('page')}</td>
                    <td className="p-4">{getTranslationBadges(post)}</td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        <Button
                          onClick={() => {
                            const job = jobs.find(j => j.postId === post.id && j.status === 'COMPLETED');
                            if (job) publishMutation.mutate(job.id);
                          }}
                          disabled={!jobs.find(j => j.postId === post.id && j.status === 'COMPLETED') || publishMutation.isPending}
                          size="sm"
                          data-testid={'button-publish-' + post.id}
                        >
                          {publishMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          {language === 'ru' ? 'Опубликовать' : 'Publish'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              data-testid="button-prev-page"
            >
              {language === 'ru' ? 'Назад' : 'Previous'}
            </Button>
            <span className="text-sm text-muted-foreground">
              {language === 'ru' ? 'Страница ' + page + ' из ' + totalPages : 'Page ' + page + ' of ' + totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              data-testid="button-next-page"
            >
              {language === 'ru' ? 'Вперёд' : 'Next'}
            </Button>
          </div>
        )}

        {/* Footer with Translate Button */}
        <div className="flex items-center justify-between p-4 border-t bg-muted/30">
          <span className="text-sm text-muted-foreground">
            {selectedPosts.length === 0 
              ? (language === 'ru' ? 'Выберите контент для перевода' : 'Select content to translate')
              : (language === 'ru' ? `Выбрано: ${selectedPosts.length}` : `Selected: ${selectedPosts.length}`)}
          </span>
          <Button
            onClick={handleTranslate}
            disabled={selectedPosts.length === 0 || translateMutation.isPending}
            size="lg"
            data-testid="button-translate-selected"
          >
            {translateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('translate_selected')}
          </Button>
        </div>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editingPost !== null} onOpenChange={(open) => !open && setEditingPost(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('edit_translation')}</DialogTitle>
            <DialogDescription>{t('make_corrections')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-sm font-medium">{t('post_title')}</Label>
              <p className="mt-1 text-sm text-muted-foreground">{editingPost?.title}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="content">{t('content')}</Label>
              <Textarea
                id="content"
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                rows={15}
                className="font-mono text-xs"
                data-testid="textarea-edit-content"
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => setEditingPost(null)}
              data-testid="button-cancel-edit"
            >
              {t('cancel')}
            </Button>
            <Button
              variant="secondary"
              onClick={handleManualTranslate}
              disabled={manualTranslateMutation.isPending}
              data-testid="button-manual-translate"
            >
              {manualTranslateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('auto_translate')}
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updateMutation.isPending}
              data-testid="button-save-edit"
            >
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('save_changes')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Translation Modal */}
      <EditTranslationModal 
        open={selectedJobId !== null} 
        jobId={selectedJobId}
        onClose={() => setSelectedJobId(null)}
      />
    </div>
  );
}
