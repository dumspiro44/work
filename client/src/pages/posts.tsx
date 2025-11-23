import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useLanguage } from '@/contexts/LanguageContext';
import { Edit2, Loader2, AlertCircle } from 'lucide-react';
import type { WordPressPost } from '@/types';
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
  const [contentType, setContentType] = useState<ContentType>('posts');
  const [page, setPage] = useState(1);
  const [polylangChecked, setPolylangChecked] = useState(false);

  // Check Polylang on mount
  const polylangQuery = useQuery<{ success: boolean; message: string }>({
    queryKey: ['/api/check-polylang'],
    enabled: !polylangChecked,
  });

  // Fetch posts/pages
  const { data: allContent = [], isLoading, refetch } = useQuery<WordPressPost[]>({
    queryKey: ['/api/posts', contentType],
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
      toast({
        title: language === 'ru' ? 'Перевод начат' : 'Translation started',
        description: `${selectedPosts.length} ${language === 'ru' ? 'элемент(ов) добавлен(о) в очередь' : 'item(s) queued for translation'}.`,
      });
      setSelectedPosts([]);
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
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

  const getTranslationStatus = (post: WordPressPost) => {
    if (post.lang && post.translations && Object.keys(post.translations).length > 0) {
      return <Badge variant="default" data-testid={`badge-status-${post.id}`}>{t('translated')}</Badge>;
    }
    if (post.lang) {
      return <Badge variant="secondary" data-testid={`badge-status-${post.id}`}>{t('source')}</Badge>;
    }
    return <Badge variant="outline" data-testid={`badge-status-${post.id}`}>{t('missing_lang')}</Badge>;
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
        <Button
          onClick={handleTranslate}
          disabled={selectedPosts.length === 0 || translateMutation.isPending}
          data-testid="button-translate-selected"
        >
          {translateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('translate_selected')} ({selectedPosts.length})
        </Button>
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
                  <tr key={post.id} className="border-b hover-elevate" data-testid={`row-post-${post.id}`}>
                    <td className="p-4">
                      <Checkbox
                        checked={selectedPosts.includes(post.id)}
                        onCheckedChange={() => togglePost(post.id)}
                        data-testid={`checkbox-post-${post.id}`}
                      />
                    </td>
                    <td className="p-4 text-sm font-mono">{post.id}</td>
                    <td className="p-4 text-sm font-medium">{post.title.rendered}</td>
                    <td className="p-4 text-sm">{post.type === 'post' ? t('post') : t('page')}</td>
                    <td className="p-4">{getTranslationStatus(post)}</td>
                    <td className="p-4">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(post)}
                        data-testid={`button-edit-${post.id}`}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
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
              {language === 'ru' ? `Страница ${page} из ${totalPages}` : `Page ${page} of ${totalPages}`}
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
    </div>
  );
}
