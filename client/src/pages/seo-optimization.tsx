import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useLanguage } from '@/contexts/LanguageContext';
import { Loader2, ExternalLink } from 'lucide-react';
import type { WordPressPost } from '@/types';
import type { Settings } from '@shared/schema';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

type ContentType = 'posts' | 'pages' | 'all';

export default function SEOOptimization() {
  const { toast } = useToast();
  const { t, language } = useLanguage();
  
  const [contentType, setContentType] = useState<ContentType>('all');
  const [page, setPage] = useState(1);
  const [editingPost, setEditingPost] = useState<{ id: number; title: string } | null>(null);
  const [focusKeyword, setFocusKeyword] = useState('');

  // Fetch settings
  const { data: settings } = useQuery<Settings>({
    queryKey: ['/api/settings'],
  });

  // Fetch SEO posts without focus keyword
  const { data: seoPosts = [], isLoading } = useQuery<WordPressPost[]>({
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

  // Pagination
  const itemsPerPage = 10;
  const paginatedPosts = useMemo(() => {
    const start = (page - 1) * itemsPerPage;
    return seoPosts.slice(start, start + itemsPerPage);
  }, [seoPosts, page]);

  const totalPages = Math.ceil(seoPosts.length / itemsPerPage);

  const updateFocusKeywordMutation = useMutation({
    mutationFn: ({ postId, focusKeyword }: { postId: number; focusKeyword: string }) =>
      apiRequest('PATCH', `/api/seo-posts/${postId}`, { focusKeyword }),
    onSuccess: () => {
      toast({
        title: language === 'ru' ? 'Сохранено' : 'Saved',
        description: language === 'ru' ? 'Фокусное ключевое слово обновлено' : 'Focus keyword updated',
      });
      setEditingPost(null);
      setFocusKeyword('');
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

  const handleSetFocusKeyword = (post: WordPressPost) => {
    setEditingPost({ id: post.id, title: post.title.rendered });
    setFocusKeyword(post.title.rendered);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{language === 'ru' ? 'SEO Оптимизация' : 'SEO Optimization'}</h1>
        <p className="text-muted-foreground">
          {language === 'ru' 
            ? 'Управление фокусными ключевыми словами Yoast SEO'
            : 'Manage Yoast SEO focus keywords'}
        </p>
      </div>

      <Card className="p-4">
        <div className="flex gap-4 items-center flex-wrap">
          <div className="min-w-max">
            <Label>{language === 'ru' ? 'Тип контента' : 'Content Type'}</Label>
            <Select value={contentType} onValueChange={(value: any) => {
              setContentType(value);
              setPage(1);
            }}>
              <SelectTrigger data-testid="select-content-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{language === 'ru' ? 'Всё' : 'All'}</SelectItem>
                <SelectItem value="posts">{language === 'ru' ? 'Посты' : 'Posts'}</SelectItem>
                <SelectItem value="pages">{language === 'ru' ? 'Страницы' : 'Pages'}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="text-sm text-muted-foreground">
            {language === 'ru' 
              ? `${seoPosts.length} контента без фокусного ключевого слова`
              : `${seoPosts.length} content without focus keyword`}
          </div>
        </div>
      </Card>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : seoPosts.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">
            {language === 'ru' 
              ? 'Все посты уже имеют фокусные ключевые слова 🎉'
              : 'All posts have focus keywords 🎉'}
          </p>
        </Card>
      ) : (
        <>
          <div className="space-y-3">
            {paginatedPosts.map((post) => (
              <Card key={post.id} className="p-4">
                <div className="flex gap-4 items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{post.title.rendered}</h3>
                    <p className="text-sm text-muted-foreground">
                      {post.type === 'post' ? (language === 'ru' ? 'Пост' : 'Post') : (language === 'ru' ? 'Страница' : 'Page')} • ID: {post.id}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSetFocusKeyword(post)}
                      data-testid={`button-set-yoast-${post.id}`}
                    >
                      {language === 'ru' ? 'Установить ключевое слово' : 'Set Keyword'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const editUrl = `${settings?.wpUrl}/wp-admin/post.php?post=${post.id}&action=edit`;
                        window.open(editUrl, '_blank');
                      }}
                      data-testid={`button-edit-${post.id}`}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex gap-2 justify-center">
              <Button
                variant="outline"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
              >
                {language === 'ru' ? 'Назад' : 'Previous'}
              </Button>
              <div className="flex items-center px-4">
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

      <Dialog open={editingPost !== null} onOpenChange={(open) => {
        if (!open) {
          setEditingPost(null);
          setFocusKeyword('');
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{language === 'ru' ? 'Установить фокусное ключевое слово' : 'Set Focus Keyword'}</DialogTitle>
            <DialogDescription>
              {language === 'ru' ? `Для: ${editingPost?.title}` : `For: ${editingPost?.title}`}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="focus-keyword">{language === 'ru' ? 'Фокусное ключевое слово' : 'Focus Keyword'}</Label>
              <Input
                id="focus-keyword"
                value={focusKeyword}
                onChange={(e) => setFocusKeyword(e.target.value)}
                placeholder={language === 'ru' ? 'Введите ключевое слово' : 'Enter keyword'}
                data-testid="input-focus-keyword"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditingPost(null);
                setFocusKeyword('');
              }}
            >
              {language === 'ru' ? 'Отмена' : 'Cancel'}
            </Button>
            <Button
              onClick={() => {
                if (editingPost && focusKeyword.trim()) {
                  updateFocusKeywordMutation.mutate({
                    postId: editingPost.id,
                    focusKeyword: focusKeyword.trim(),
                  });
                }
              }}
              disabled={updateFocusKeywordMutation.isPending || !focusKeyword.trim()}
              data-testid="button-save-keyword"
            >
              {updateFocusKeywordMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {language === 'ru' ? 'Сохранить' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
