import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useLanguage } from '@/contexts/LanguageContext';
import { Loader2, AlertCircle, Upload, CheckCircle2, Trash2, ExternalLink } from 'lucide-react';
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

type ContentType = 'posts' | 'pages' | 'all' | string; // Support custom post types

export default function Posts() {
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const [, setLocation] = useLocation();
  
  const [selectedPosts, setSelectedPosts] = useState<number[]>([]);
  const [editingPost, setEditingPost] = useState<{ id: number; title: string; content: string } | null>(null);
  const [editedContent, setEditedContent] = useState('');
  const [contentType, setContentType] = useState<ContentType>('all');
  const [availablePostTypes, setAvailablePostTypes] = useState<string[]>(['post', 'page']); // Always include defaults
  const [page, setPage] = useState(1);
  const [polylangChecked, setPolylangChecked] = useState(false);
  const [translationProgress, setTranslationProgress] = useState<{ jobId: string; progress: number } | null>(null);
  const [activeTranslationIds, setActiveTranslationIds] = useState<number[]>([]);
  const [expectedJobsCount, setExpectedJobsCount] = useState(0);
  const [showCompletionMessage, setShowCompletionMessage] = useState(false);
  const [completionNotified, setCompletionNotified] = useState(false);
  const [translationStartTime, setTranslationStartTime] = useState<number>(0);
  const [remainingTime, setRemainingTime] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [selectedLanguageFilter, setSelectedLanguageFilter] = useState<string>('');
  const [perPage, setPerPage] = useState(10);
  const [searchName, setSearchName] = useState('');
  const [translationStatusFilter, setTranslationStatusFilter] = useState<'all' | 'translated' | 'untranslated'>('all');
  const [editedPostIds, setEditedPostIds] = useState<Set<number>>(new Set());
  const [recentlyPublishedPostIds, setRecentlyPublishedPostIds] = useState<Set<number>>(new Set());

  // Delete translation job mutation
  const deleteJobMutation = useMutation({
    mutationFn: (jobId: string) => apiRequest('DELETE', `/api/jobs/${jobId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      toast({
        title: language === 'ru' ? '🗑️ Перевод удален' : '🗑️ Translation deleted',
        description: language === 'ru' ? 'Вы можете переводить контент еще раз' : 'You can translate the content again',
      });
    },
    onError: () => {
      toast({
        title: language === 'ru' ? '❌ Ошибка' : '❌ Error',
        description: language === 'ru' ? 'Не удалось удалить перевод' : 'Failed to delete translation',
        variant: 'destructive',
      });
    },
  });

  // Fetch settings to get target languages
  const { data: settings } = useQuery<Settings>({
    queryKey: ['/api/settings'],
  });

  // Fetch available post types for filtering
  const { data: postTypesData } = useQuery<{ available: string[] }>({
    queryKey: ['/api/post-types'],
  });

  useEffect(() => {
    // Use API types to load custom post types
    const apiTypes = postTypesData?.available || [];
    const allTypes = [...new Set(['post', 'page', ...apiTypes])];
    
    if (allTypes.length > 2) { // More than just 'post' and 'page'
      setAvailablePostTypes(allTypes);
      console.log('[POST-TYPES] Loaded available types:', allTypes);
    }
  }, [postTypesData]);

  // Initialize language filter to source language when settings load
  useEffect(() => {
    if (settings?.sourceLanguage && !selectedLanguageFilter) {
      console.log('[INIT] Setting selectedLanguageFilter to:', settings.sourceLanguage);
      setSelectedLanguageFilter(settings.sourceLanguage);
    }
  }, [settings?.sourceLanguage]);

  // Fetch jobs to map translations
  const { data: jobs = [] } = useQuery<TranslationJob[]>({
    queryKey: ['/api/jobs'],
    refetchInterval: 500, // Auto-refresh frequently to show language badges instantly
  });

  // Track translation progress
  useEffect(() => {
    if (activeTranslationIds.length === 0 || expectedJobsCount === 0) {
      setCompletionNotified(false);
      return;
    }

    // Get NEWEST jobs for active posts only (most recent jobs from this translation session)
    const activePostJobs = jobs
      .filter(j => activeTranslationIds.includes(j.postId))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, expectedJobsCount);
    
    const completedJobs = activePostJobs.filter((j) => j.status === 'COMPLETED');

    console.log('[PROGRESS CHECK]', {
      activeIds: activeTranslationIds,
      expectedCount: expectedJobsCount,
      activePostJobsCount: activePostJobs.length,
      completedCount: completedJobs.length,
      notified: completionNotified,
    });

    // Only show completion if:
    // 1. We have found the jobs (activePostJobs.length > 0)
    // 2. We have all expected jobs
    // 3. All are completed
    if (
      expectedJobsCount > 0 &&
      activePostJobs.length > 0 &&
      activePostJobs.length >= expectedJobsCount &&
      completedJobs.length === expectedJobsCount &&
      !completionNotified
    ) {
      setCompletionNotified(true);
      setShowCompletionMessage(true);
      
      // Play notification sound
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        gain.gain.setValueAtTime(0.3, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
      } catch (e) {
        console.log('Audio not available');
      }
      
      toast({
        title: language === 'ru' ? '✅ Переводы выполнены!' : '✅ Translations completed!',
        description: language === 'ru'
          ? `${completedJobs.length} переводов готовы к публикации`
          : `${completedJobs.length} translations ready for publishing`,
      });
      setActiveTranslationIds([]);
      setExpectedJobsCount(0);

      // Auto-hide message after 5 seconds
      setTimeout(() => setShowCompletionMessage(false), 5000);
    }
  }, [jobs, activeTranslationIds, expectedJobsCount, language, toast, completionNotified]);

  // Track remaining time estimation
  useEffect(() => {
    if (translationStartTime === 0 || activeTranslationIds.length === 0 || expectedJobsCount === 0) {
      setRemainingTime(null);
      setElapsedSeconds(0);
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = Math.floor((now - translationStartTime) / 1000);
      setElapsedSeconds(elapsed);

      // Get completed jobs
      const activePostJobs = jobs
        .filter(j => activeTranslationIds.includes(j.postId))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, expectedJobsCount);
      
      const completedJobs = activePostJobs.filter(j => j.status === 'COMPLETED');
      const remainingJobs = expectedJobsCount - completedJobs.length;

      // Estimate time based on average speed
      if (completedJobs.length > 0 && elapsed > 0 && remainingJobs > 0) {
        const avgTimePerJob = elapsed / completedJobs.length;
        const estimatedRemainingSeconds = Math.ceil(avgTimePerJob * remainingJobs);
        
        if (estimatedRemainingSeconds < 60) {
          setRemainingTime(`~${estimatedRemainingSeconds}s`);
        } else {
          const mins = Math.ceil(estimatedRemainingSeconds / 60);
          setRemainingTime(`~${mins}m`);
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [translationStartTime, activeTranslationIds, expectedJobsCount, jobs]);

  // Check Polylang on mount
  const polylangQuery = useQuery<{ success: boolean; message: string }>({
    queryKey: ['/api/check-polylang'],
    enabled: !polylangChecked,
  });

  // Fetch ALL posts/pages once - cached by React Query
  const { data: allPostsData, isLoading } = useQuery<{ data: WordPressPost[] } | null>({
    queryKey: ['/api/posts/all'],
    queryFn: () => {
      console.log('[QUERY] Fetching all posts/pages (cached once)');
      return apiRequest('GET', '/api/posts/all');
    },
  });

  // Apply ALL filters client-side (no re-fetching!)
  const filteredContent = useMemo(() => {
    if (!allPostsData?.data) return [];
    
    let filtered = [...allPostsData.data];
    
    // 1. Filter by language
    if (selectedLanguageFilter) {
      filtered = filtered.filter(p => {
        const post = p as any;
        return post.lang && post.lang.toLowerCase() === selectedLanguageFilter.toLowerCase();
      });
    }
    
    // 2. Filter by search
    if (searchName) {
      filtered = filtered.filter(p => {
        const title = p.title?.rendered || p.title || '';
        return title.toLowerCase().includes(searchName.toLowerCase());
      });
    }
    
    // 3. Filter by translation status
    if (translationStatusFilter === 'translated') {
      filtered = filtered.filter(p => p.translations && Object.keys(p.translations).length > 1);
    } else if (translationStatusFilter === 'untranslated') {
      filtered = filtered.filter(p => !p.translations || Object.keys(p.translations).length <= 1);
    }
    
    // 4. Filter by content type (supports custom post types)
    if (contentType && contentType !== 'all') {
      filtered = filtered.filter(p => p.type === contentType);
    }
    
    return filtered;
  }, [allPostsData?.data, selectedLanguageFilter, searchName, translationStatusFilter, contentType]);

  // Apply pagination client-side
  const totalContent = filteredContent.length;
  const totalPages = Math.ceil(totalContent / perPage);
  const startIndex = (page - 1) * perPage;
  const endIndex = startIndex + perPage;
  const paginatedContent = filteredContent.slice(startIndex, endIndex);

  const translateMutation = useMutation({
    mutationFn: (postIds: number[]) => apiRequest('POST', '/api/translate', { postIds }),
    onSuccess: (data: any, postIds: number[]) => {
      console.log('[TRANSLATE SUCCESS] postIds:', postIds);
      console.log('[TRANSLATE SUCCESS] settings.targetLanguages:', settings?.targetLanguages);
      
      // Show warning that process will take time
      toast({
        title: language === 'ru' ? '⏱️ Перевод начат' : '⏱️ Translation started',
        description: language === 'ru' 
          ? `${postIds.length} элемент(ов) добавлен(о) в очередь. Процесс может занять некоторое время...`
          : `${postIds.length} item(s) queued for translation. This may take a while...`,
      });
      
      // Track active translations using passed postIds
      const totalLanguages = settings?.targetLanguages?.length || 1;
      console.log('[TRANSLATE SUCCESS] Setting activeTranslationIds:', postIds, 'expectedCount:', postIds.length * totalLanguages);
      setActiveTranslationIds(postIds);
      setExpectedJobsCount(postIds.length * totalLanguages);
      setTranslationStartTime(Date.now());
      setShowCompletionMessage(false);
      setCompletionNotified(false);
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
    onSuccess: (data: any, variables: any) => {
      toast({
        title: language === 'ru' ? 'Обновлено' : 'Updated',
        description: language === 'ru' ? 'Контент успешно обновлен' : 'Content updated successfully.',
      });
      setEditedPostIds(prev => new Set([...prev, variables.postId]));
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
    mutationFn: (params: { jobId: string; postId: number }) => apiRequest('POST', '/api/jobs/' + params.jobId + '/publish', {}),
    onSuccess: async (data: any, params: { jobId: string; postId: number }) => {
      toast({
        title: language === 'ru' ? 'Успешно' : 'Success',
        description: data.message,
      });
      setEditedPostIds(prev => {
        const next = new Set(prev);
        next.delete(params.postId);
        return next;
      });
      
      // Track recently published post to hide button immediately
      setRecentlyPublishedPostIds(prev => new Set([...prev, params.postId]));
      setTimeout(() => {
        setRecentlyPublishedPostIds(prev => {
          const next = new Set(prev);
          next.delete(params.postId);
          return next;
        });
      }, 3000);
      
      // Optimistic update: immediately update cache with new translation
      const currentData = queryClient.getQueryData(['/api/posts']) as any;
      if (currentData?.data) {
        const updatedData = {
          ...currentData,
          data: currentData.data.map((post: any) => {
            if (post.id === params.postId) {
              const job = jobs.find(j => j.id === params.jobId);
              if (job && job.targetLanguage) {
                return {
                  ...post,
                  translations: {
                    ...post.translations,
                    [job.targetLanguage]: params.postId, // Add the new translation
                  }
                };
              }
            }
            return post;
          })
        };
        queryClient.setQueryData(['/api/posts'], updatedData);
      }
      
      // Change COMPLETED jobs to PUBLISHED status after successful publish (don't delete!)
      const completedJobs = jobs.filter(j => j.postId === params.postId && j.status === 'COMPLETED');
      await Promise.all(
        completedJobs.map(job => apiRequest('PATCH', `/api/jobs/${job.id}`, { status: 'PUBLISHED' }))
      );
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      // Reload posts to show published translations
      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
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

  const publishAllMutation = useMutation({
    mutationFn: (postId: number) => apiRequest('POST', `/api/posts/${postId}/publish-all`, {}),
    onSuccess: async (data: any, postId: number) => {
      toast({
        title: language === 'ru' ? 'Успешно' : 'Success',
        description: language === 'ru' ? `${data.publishedCount} переводов опубликовано` : `${data.publishedCount} translation(s) published`,
      });
      if (data.errors && data.errors.length > 0) {
        toast({
          variant: 'destructive',
          title: language === 'ru' ? 'Ошибки' : 'Errors',
          description: data.errors.join('; '),
        });
      }
      setEditedPostIds(prev => {
        const next = new Set(prev);
        next.delete(postId);
        return next;
      });
      
      // Track recently published post to hide button immediately
      setRecentlyPublishedPostIds(prev => new Set([...prev, postId]));
      setTimeout(() => {
        setRecentlyPublishedPostIds(prev => {
          const next = new Set(prev);
          next.delete(postId);
          return next;
        });
      }, 3000);
      
      // Optimistic update: immediately update cache with new translations
      const currentData = queryClient.getQueryData(['/api/posts']) as any;
      if (currentData?.data) {
        const updatedData = {
          ...currentData,
          data: currentData.data.map((post: any) => {
            if (post.id === postId) {
              const completedJobs = jobs.filter(j => j.postId === postId && j.status === 'COMPLETED');
              let newTranslations = { ...post.translations };
              for (const job of completedJobs) {
                if (job.targetLanguage) {
                  newTranslations[job.targetLanguage] = postId;
                }
              }
              return {
                ...post,
                translations: newTranslations
              };
            }
            return post;
          })
        };
        queryClient.setQueryData(['/api/posts'], updatedData);
      }
      
      // Change all COMPLETED jobs to PUBLISHED status (don't delete - keep them visible!)
      const completedJobs = jobs.filter(j => j.postId === postId && j.status === 'COMPLETED');
      await Promise.all(
        completedJobs.map(job => apiRequest('PATCH', `/api/jobs/${job.id}`, { status: 'PUBLISHED' }))
      );
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      // Reload posts to show published translations
      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
      // Refetch stats to update dashboard - keep baseline unchanged so it calculates new difference
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: language === 'ru' ? 'Ошибка публикации' : 'Publish failed',
        description: error.message,
      });
    },
  });

  // REMOVED: cleanupMutation was deleting jobs and breaking language badges
  // Keep jobs with PUBLISHED status so badges remain visible

  const checkUpdatesMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/check-updates', {}),
    onSuccess: (data: any) => {
      if (data.newCount > 0) {
        toast({
          title: language === 'ru' ? '✅ Найден новый контент!' : '✅ New content found!',
          description: language === 'ru' 
            ? `Добавлено ${data.newCount} нового элемента. Старое: ${data.oldCount}, Новое: ${data.currentCount}`
            : `${data.newCount} new item(s) added. Previous: ${data.oldCount}, Current: ${data.currentCount}`,
        });
      } else {
        toast({
          title: language === 'ru' ? 'ℹ️ Обновлений не найдено' : 'ℹ️ No new content',
          description: language === 'ru' 
            ? `Всего элементов: ${data.currentCount} (без изменений)`
            : `Total items: ${data.currentCount} (no changes)`,
        });
      }
      // Refresh posts after checking
      setTimeout(() => {
        refetch();
      }, 500);
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: language === 'ru' ? 'Ошибка проверки' : 'Check failed',
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

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [contentType, selectedLanguageFilter]);

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

  // REMOVED: handleCleanup was deleting jobs via cleanupMutation

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
    // Filter out source language from target languages
    const sourceLanguage = settings?.sourceLanguage || 'en';
    const rawTargetLanguages = settings?.targetLanguages || [];
    const targetLanguages = rawTargetLanguages.filter(lang => lang !== sourceLanguage);
    
    if (targetLanguages.length === 0) {
      return <Badge variant="outline">{language === 'ru' ? 'Нет языков' : 'No languages'}</Badge>;
    }

    const badges = targetLanguages.map((lang) => {
      const isTranslated = post.translations && post.translations[lang];
      // Look for jobs with COMPLETED or PUBLISHED status (stay visible after publishing)
      const job = jobs.find(
        (j) => j.postId === post.id && j.targetLanguage === lang && (j.status === 'COMPLETED' || j.status === 'PUBLISHED')
      );
      
      // Don't show badge if no translation and no job
      if (!isTranslated && !job) {
        return null;
      }
      
      // Determine if published (either has PUBLISHED job or translated in WordPress)
      const isPublished = job?.status === 'PUBLISHED' || isTranslated;
      
      const tooltipText = isPublished
        ? (language === 'ru' ? `✅ Опубликовано на ${lang.toUpperCase()} - нажмите для редактирования` : `✅ Published in ${lang.toUpperCase()} - click to edit`)
        : (language === 'ru' ? `Готово к просмотру и редактированию на ${lang.toUpperCase()}` : `Ready to view and edit in ${lang.toUpperCase()}`);
      
      // Different styling for published vs completed/pending
      const badgeClassName = isPublished 
        ? 'bg-emerald-600 hover:bg-emerald-700 cursor-pointer'
        : 'bg-blue-600 hover:bg-blue-700 cursor-pointer';
      
      const badgeText = lang.toUpperCase();
      
      return (
        <Tooltip key={lang}>
          <TooltipTrigger asChild>
            <button
              onClick={() => {
                if (job || isTranslated) {
                  // Navigate to translation edit page
                  if (job) {
                    setLocation(`/translation?id=${job.id}`);
                  } else {
                    // For published translations
                    setLocation(`/translation?id=published-${post.id}-${lang}`);
                  }
                }
              }}
              disabled={!job && !isTranslated}
              className="focus:outline-none"
              data-testid={'button-lang-' + post.id + '-' + lang}
            >
              <Badge 
                variant="default"
                className={badgeClassName}
              >
                {badgeText}
              </Badge>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {tooltipText}
          </TooltipContent>
        </Tooltip>
      );
    }).filter(Boolean);
    
    return badges.length > 0 ? (
      <div className="flex flex-wrap gap-2 items-center" data-testid={'badges-translations-' + post.id}>
        {badges}
      </div>
    ) : null;
  };

  const isPolylangActive = polylangQuery.data?.success;

  if (isLoading) {
    return (
      <div className="p-6 md:p-8 space-y-6 min-h-screen flex flex-col items-center justify-center">
        <div className="text-center space-y-6 max-w-md">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 dark:text-blue-400 mx-auto" />
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">
              {language === 'ru' ? 'Загружаем контент' : 'Loading content'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {language === 'ru' 
                ? 'Получаем посты и страницы с вашего WordPress сайта...'
                : 'Fetching posts and pages from your WordPress site...'}
            </p>
          </div>
          
          <div className="space-y-2 bg-muted/50 p-4 rounded-md">
            <p className="text-xs font-medium text-foreground">
              {language === 'ru' ? '⏱️ Время загрузки' : '⏱️ Loading time'}
            </p>
            <p className="text-xs text-muted-foreground">
              {language === 'ru' 
                ? 'Зависит от количества контента и качества соединения'
                : 'Depends on the amount of content and connection quality'}
            </p>
            <p className="text-xs text-muted-foreground mt-3">
              {language === 'ru' 
                ? '💾 Контент загружается один раз и кэшируется. После первой загрузки переключение между языками и фильтрами будет мгновенным'
                : '💾 Content loads once and is cached. After the first load, switching languages and filters will be instant'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{language === 'ru' ? 'Управление контентом' : 'Content Management'}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('posts_management_desc')}</p>
        </div>
        <div className="flex gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={() => checkUpdatesMutation.mutate()}
                disabled={checkUpdatesMutation.isPending || isLoading}
                variant="outline"
                data-testid="button-check-updates"
              >
                {checkUpdatesMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {language === 'ru' ? 'Проверить обновления' : 'Check Updates'}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <p className="text-xs">
                {language === 'ru' 
                  ? 'Загружает весь контент с WordPress и проверяет наличие новых элементов. Может занять некоторое время в зависимости от количества контента.'
                  : 'Loads all content from WordPress and checks for new items. May take some time depending on the amount of content.'
                }
              </p>
            </TooltipContent>
          </Tooltip>
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

      {/* Translation Progress - only show when we have actual jobs to track */}
      {activeTranslationIds.length > 0 && expectedJobsCount > 0 && jobs.some(j => activeTranslationIds.includes(j.postId)) && (
        <Card className="sticky top-6 z-40 p-4 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 shadow-lg" data-testid="card-progress">
          <div className="space-y-3">
            {(() => {
              // Get NEWEST jobs for active posts only (most recent jobs from this translation session)
              const activePostJobs = jobs
                .filter(j => activeTranslationIds.includes(j.postId))
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .slice(0, expectedJobsCount);
              
              const completedJobs = activePostJobs.filter(j => j.status === 'COMPLETED');
              const failedJobs = activePostJobs.filter(j => j.status === 'FAILED');
              const quotaExceededJob = failedJobs.find(j => j.errorMessage?.includes('quota exceeded'));
              const progressPercent = expectedJobsCount > 0 ? (completedJobs.length / expectedJobsCount) * 100 : 0;
              
              console.log('[PROGRESS] activeIds:', activeTranslationIds, 'expected:', expectedJobsCount, 'activePostJobs:', activePostJobs.length, 'completed:', completedJobs.length);
              
              return (
                <>
                  {/* Gemini Quota Error Banner */}
                  {quotaExceededJob && (
                    <div 
                      className="p-4 rounded-md border-l-4 flex gap-3 items-start bg-red-50 dark:bg-red-950/30 border-l-red-500"
                      data-testid="alert-quota-exceeded"
                    >
                      <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-red-900 dark:text-red-200">
                          {language === 'ru' ? 'Превышена квота Gemini API' : 'Gemini API quota exceeded'}
                        </p>
                        <p className="text-xs text-red-800 dark:text-red-300 mt-1">
                          {quotaExceededJob.errorMessage}
                        </p>
                        <a 
                          href="https://aistudio.google.com/app/api-keys" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-red-700 dark:text-red-400 hover:text-red-900 dark:hover:text-red-200 mt-2 underline"
                          data-testid="link-gemini-dashboard"
                        >
                          {language === 'ru' ? 'Открыть панель Gemini' : 'Open Gemini Dashboard'}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">
                      {language === 'ru' ? '📊 Прогресс перевода' : '📊 Translation Progress'}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono" data-testid="text-progress-count">
                        {completedJobs.length} / {expectedJobsCount}
                      </span>
                      {remainingTime && completedJobs.length < expectedJobsCount && (
                        <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded font-mono" data-testid="text-remaining-time">
                          {language === 'ru' ? 'Осталось: ' : 'ETA: '}{remainingTime}
                        </span>
                      )}
                    </div>
                  </div>
                  <Progress 
                    value={Math.min(progressPercent, 100)}
                    className="h-2"
                    data-testid="progress-translation"
                  />
                  <p className="text-xs text-muted-foreground">
                    {language === 'ru' 
                      ? `${activeTranslationIds.length} элемент(ов) переводится на ${settings?.targetLanguages?.length || 1} язык(ов)...`
                      : `${activeTranslationIds.length} item(s) being translated into ${settings?.targetLanguages?.length || 1} language(s)...`
                    }
                  </p>
                </>
              );
            })()}
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
        <div className="space-y-4">
          {/* Total Count */}
          <div className="text-sm font-semibold">
            {language === 'ru' 
              ? `Всего: ${totalContent || 0} ${contentType === 'posts' ? 'пост(а)' : contentType === 'pages' ? 'страниц(ы)' : 'элемент(ов)'}` 
              : `Total: ${totalContent || 0} ${contentType === 'posts' ? 'post(s)' : contentType === 'pages' ? 'page(s)' : 'item(s)'}`
            }
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <div>
              <Label className="text-sm font-medium mb-2 block">{t('content_type')}</Label>
              <Select value={contentType} onValueChange={(value: ContentType) => {
                setContentType(value);
                setPage(1);
              }}>
                <SelectTrigger data-testid="select-content-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('all_content')}</SelectItem>
                  {availablePostTypes && availablePostTypes.length > 0 ? (
                    availablePostTypes.map(type => (
                      <SelectItem key={type} value={type} data-testid={`select-item-${type}`}>
                        {type === 'post' ? t('posts') : type === 'page' ? t('pages') : type}
                      </SelectItem>
                    ))
                  ) : (
                    <>
                      <SelectItem value="post">{t('posts')}</SelectItem>
                      <SelectItem value="page">{t('pages')}</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label className="text-sm font-medium mb-2 block">{language === 'ru' ? 'Язык' : 'Language'}</Label>
              <select 
                value={selectedLanguageFilter || ''}
                onChange={(e) => {
                  setSelectedLanguageFilter(e.target.value);
                  setPage(1);
                }}
                className="border border-input rounded-md bg-background px-3 py-2 text-sm w-full"
                data-testid="select-language-filter"
              >
                {settings?.sourceLanguage && (
                  <option value={settings.sourceLanguage}>
                    {settings.sourceLanguage.toUpperCase()} ({language === 'ru' ? 'исходный' : 'source'})
                  </option>
                )}
                {settings?.targetLanguages?.map(lang => (
                  <option key={lang} value={lang}>
                    {lang.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <Label className="text-sm font-medium mb-2 block">{language === 'ru' ? 'Поиск' : 'Search'}</Label>
              <input
                type="text"
                placeholder={language === 'ru' ? 'Название...' : 'Title...'}
                value={searchName}
                onChange={(e) => {
                  setSearchName(e.target.value);
                  setPage(1);
                }}
                className="border border-input rounded-md bg-background px-3 py-2 text-sm w-full"
                data-testid="input-search-name"
              />
            </div>
            
            <div>
              <Label className="text-sm font-medium mb-2 block">{language === 'ru' ? 'Статус' : 'Status'}</Label>
              <Select value={translationStatusFilter} onValueChange={(value: any) => {
                setTranslationStatusFilter(value);
                setPage(1);
              }}>
                <SelectTrigger data-testid="select-translation-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{language === 'ru' ? 'Все' : 'All'}</SelectItem>
                  <SelectItem value="translated">{language === 'ru' ? 'Переведенные' : 'Translated'}</SelectItem>
                  <SelectItem value="untranslated">{language === 'ru' ? 'Непереведенные' : 'Untranslated'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label className="text-sm font-medium mb-2 block">{language === 'ru' ? 'На странице' : 'Per page'}</Label>
              <select
                value={perPage}
                onChange={(e) => {
                  setPerPage(parseInt(e.target.value));
                  setPage(1);
                }}
                className="border border-input rounded-md bg-background px-3 py-2 text-sm w-full"
                data-testid="select-per-page"
              >
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
          </div>
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
                        {/* Delete button - show if there are completed jobs */}
                        {jobs.some(j => j.postId === post.id && j.status === 'COMPLETED') && (
                          <Button
                            onClick={async () => {
                              const jobsToDelete = jobs.filter(j => j.postId === post.id && j.status === 'COMPLETED');
                              // Delete all jobs for this post
                              await Promise.all(
                                jobsToDelete.map(job => 
                                  apiRequest('DELETE', `/api/jobs/${job.id}`)
                                )
                              );
                              // Refresh jobs after all deletions complete
                              queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
                              toast({
                                title: language === 'ru' ? '🗑️ Переводы удалены' : '🗑️ Translations deleted',
                                description: language === 'ru' ? `${jobsToDelete.length} переводов удалено` : `${jobsToDelete.length} translation(s) deleted`,
                              });
                            }}
                            size="sm"
                            variant="outline"
                            title={language === 'ru' ? 'Удалить все переводы' : 'Delete all translations'}
                            data-testid={'button-delete-post-' + post.id}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                        {(() => {
                          // Count COMPLETED jobs (ready to publish)
                          const completedCount = jobs.filter(j => j.postId === post.id && j.status === 'COMPLETED').length;
                          
                          const isPublishing = publishMutation.isPending || publishAllMutation.isPending;
                          const isEdited = editedPostIds.has(post.id);
                          
                          // SIMPLE RULE: Show button ONLY if there are COMPLETED jobs OR post was edited
                          // No COMPLETED jobs + not edited = hide button
                          if (completedCount === 0 && !isEdited) {
                            return null;
                          }
                          
                          // If edited but no completed jobs to publish = hide
                          if (isEdited && completedCount === 0) {
                            return null;
                          }
                          
                          if (isEdited && completedCount > 0) {
                            if (completedCount === 1) {
                              return (
                                <Button
                                  onClick={() => {
                                    const job = jobs.find(j => j.postId === post.id && j.status === 'COMPLETED');
                                    if (job) publishMutation.mutate({ jobId: job.id, postId: post.id });
                                  }}
                                  disabled={isPublishing}
                                  size="sm"
                                  variant="secondary"
                                  data-testid={'button-republish-' + post.id}
                                  title={language === 'ru' ? 'Опубликовать заново после редактирования' : 'Re-publish after editing'}
                                >
                                  {isPublishing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                  {language === 'ru' ? 'Опубликовать заново' : 'Republish'}
                                </Button>
                              );
                            }
                            
                            return (
                              <Button
                                onClick={() => publishAllMutation.mutate(post.id)}
                                disabled={isPublishing}
                                size="sm"
                                variant="secondary"
                                data-testid={'button-republish-all-' + post.id}
                                title={language === 'ru' ? `Опубликовать заново все ${completedCount} переводов` : `Re-publish all ${completedCount} translations`}
                              >
                                {isPublishing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {language === 'ru' ? `Опубликовать заново (${completedCount})` : `Republish All (${completedCount})`}
                              </Button>
                            );
                          }
                          
                          if (completedCount === 1) {
                            return (
                              <Button
                                onClick={() => {
                                  const job = jobs.find(j => j.postId === post.id && j.status === 'COMPLETED');
                                  if (job) publishMutation.mutate({ jobId: job.id, postId: post.id });
                                }}
                                disabled={isPublishing}
                                size="sm"
                                data-testid={'button-publish-' + post.id}
                              >
                                {isPublishing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {language === 'ru' ? 'Опубликовать' : 'Publish'}
                              </Button>
                            );
                          }
                          
                          return (
                            <Button
                              onClick={() => publishAllMutation.mutate(post.id)}
                              disabled={isPublishing}
                              size="sm"
                              data-testid={'button-publish-all-' + post.id}
                              title={language === 'ru' ? `Опубликовать все ${completedCount} переводов` : `Publish all ${completedCount} translations`}
                            >
                              {isPublishing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                              {language === 'ru' ? `Опубликовать все (${completedCount})` : `Publish All (${completedCount})`}
                            </Button>
                          );
                        })()}
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

      {/* Floating Translate Button */}
      {selectedPosts.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
          <div className="bg-white dark:bg-slate-950 rounded-lg shadow-lg p-3 border border-border">
            <p className="text-xs text-muted-foreground mb-2">
              {language === 'ru' ? `Выбрано: ${selectedPosts.length}` : `Selected: ${selectedPosts.length}`}
            </p>
            <div className="flex gap-2 flex-col">
              <Button
                onClick={handleTranslate}
                disabled={translateMutation.isPending}
                size="lg"
                className="w-full whitespace-nowrap"
                data-testid="button-translate-selected-floating"
              >
                {translateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('translate_selected')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
