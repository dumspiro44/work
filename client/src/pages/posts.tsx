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
import { useWordPress } from '@/contexts/WordPressContext';
import { Loader2, AlertCircle, Upload, CheckCircle2, Trash2, Eye, ExternalLink, Maximize2, Minimize2 } from 'lucide-react';
import type { WordPressPost } from '@/types';
import type { Settings, TranslationJob } from '@shared/schema';
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

type ContentType = 'posts' | 'pages' | 'news' | 'all';

export default function Posts() {
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const [, setLocation] = useLocation();
  
  const [selectedPosts, setSelectedPosts] = useState<number[]>([]);
  const [editingPost, setEditingPost] = useState<{ id: number; title: string; content: string } | null>(null);
  const [editedContent, setEditedContent] = useState('');
  const [contentType, setContentType] = useState<ContentType>('all');
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
  const [allContentLoaded, setAllContentLoaded] = useState<WordPressPost[] | null>(null);
  const [showGetContentDialog, setShowGetContentDialog] = useState(false);
  const [isLoadingAllContent, setIsLoadingAllContent] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [viewingPost, setViewingPost] = useState<WordPressPost | null>(null);
  const [viewFullscreen, setViewFullscreen] = useState(false);
  const [editFullscreen, setEditFullscreen] = useState(false);

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

  const { settings, jobs } = useWordPress();
  const jobsList = jobs || [];

  // Initialize language filter to source language when settings load
  useEffect(() => {
    if (settings?.sourceLanguage && !selectedLanguageFilter) {
      console.log('[INIT] Setting selectedLanguageFilter to:', settings.sourceLanguage);
      setSelectedLanguageFilter(settings.sourceLanguage);
    }
  }, [settings?.sourceLanguage]);

  // Track translation progress
  useEffect(() => {
    if (activeTranslationIds.length === 0 || expectedJobsCount === 0) {
      setCompletionNotified(false);
      return;
    }

    // Get NEWEST jobs for active posts only (most recent jobs from this translation session)
    const activePostJobs = jobsList
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
  }, [jobsList, activeTranslationIds, expectedJobsCount, language, toast, completionNotified]);

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

  // Fetch posts with pagination (only if all content NOT loaded)
  const { data: postsData, isLoading } = useQuery<{ data: WordPressPost[]; total: number } | null>({
    queryKey: ['/api/posts', page, perPage, selectedLanguageFilter, searchName, translationStatusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      params.append('page', String(page));
      params.append('per_page', String(perPage));
      if (selectedLanguageFilter) params.append('lang', selectedLanguageFilter);
      if (searchName) params.append('search', searchName);
      if (translationStatusFilter !== 'all') params.append('translation_status', translationStatusFilter);
      return apiRequest('GET', `/api/posts?${params.toString()}`);
    },
    enabled: allContentLoaded === null && !showGetContentDialog && !isLoadingAllContent, // Disable when dialog opens
  });

  // Use local data if loaded, otherwise use API
  let filteredContent: WordPressPost[] = [];
  let paginatedContent: WordPressPost[] = [];
  let totalContent = 0;
  let totalPages = 0;

  if (allContentLoaded) {
    // Use locally loaded data with client-side filtering
    filteredContent = allContentLoaded;
    
    if (selectedLanguageFilter) {
      filteredContent = filteredContent.filter(p => {
        const post = p as any;
        return post.lang && post.lang.toLowerCase() === selectedLanguageFilter.toLowerCase();
      });
    }
    
    if (searchName) {
      filteredContent = filteredContent.filter(p => {
        const title = typeof p.title === 'string' ? p.title : (p.title?.rendered || '');
        return title.toLowerCase().includes(searchName.toLowerCase());
      });
    }
    
    if (translationStatusFilter === 'translated') {
      filteredContent = filteredContent.filter(p => p.translations && Object.keys(p.translations).length > 1);
    } else if (translationStatusFilter === 'untranslated') {
      filteredContent = filteredContent.filter(p => !p.translations || Object.keys(p.translations).length <= 1);
    }
    
    totalContent = filteredContent.length;
    totalPages = Math.ceil(totalContent / perPage);
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    paginatedContent = filteredContent.slice(startIndex, endIndex);
  } else {
    // Use API data
    paginatedContent = postsData?.data || [];
    totalContent = postsData?.total || 0;
    totalPages = Math.ceil(totalContent / perPage);
  }

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
      setEditedPostIds(prev => new Set([...Array.from(prev), variables.postId]));
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

  // Load all content at once
  const getContentMutation = useMutation({
    mutationFn: () => apiRequest('GET', '/api/posts/all'),
    onSuccess: (data: any) => {
      setAllContentLoaded(data.data || []);
      setPage(1); // Reset to first page
      setIsLoadingAllContent(false);
      setLoadingProgress(100);
      
      toast({
        title: language === 'ru' ? '✅ Контент загружен' : '✅ Content loaded',
        description: language === 'ru' 
          ? `Загружено ${data.data?.length || 0} элемент(ов). Теперь пагинация работает мгновенно.`
          : `Loaded ${data.data?.length || 0} item(s). Pagination is now instant.`,
      });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: language === 'ru' ? '❌ Ошибка загрузки' : '❌ Load failed',
        description: error.message,
      });
      setIsLoadingAllContent(false);
      setLoadingProgress(0);
    },
  });

  // Simulate loading progress
  useEffect(() => {
    if (!isLoadingAllContent) return;
    
    const interval = setInterval(() => {
      setLoadingProgress(prev => {
        if (prev >= 90) return prev;
        return prev + Math.random() * 20;
      });
    }, 500);
    
    return () => clearInterval(interval);
  }, [isLoadingAllContent]);

  // Archive post mutation
  const archivePostMutation = useMutation({
    mutationFn: (postId: number) => apiRequest('POST', `/api/archive/create-request`, { postId }),
    onSuccess: () => {
      toast({
        title: language === 'ru' ? '✅ В архив' : '✅ Archived',
        description: language === 'ru' ? 'Контент отправлен в архив' : 'Content sent to archive',
      });
      setViewingPost(null);
      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: language === 'ru' ? 'Ошибка' : 'Error',
        description: error.message,
      });
    },
  });

  // Move to draft mutation
  const moveToDraftMutation = useMutation({
    mutationFn: (postId: number) => apiRequest('PATCH', `/api/posts/${postId}/status`, { status: 'draft' }),
    onSuccess: () => {
      toast({
        title: language === 'ru' ? '✅ Снято с публикации' : '✅ Unpublished',
        description: language === 'ru' ? 'Контент перемещен в черновики' : 'Content moved to drafts',
      });
      setViewingPost(null);
      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
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
      setRecentlyPublishedPostIds(prev => new Set([...Array.from(prev), params.postId]));
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
      const completedJobs = jobsList.filter(j => j.postId === params.postId && j.status === 'COMPLETED');
      await Promise.all(
        completedJobs.map(job => apiRequest('PATCH', `/api/jobs/${job.id}`, { status: 'PUBLISHED' }))
      );
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      // Reload posts to show published translations
      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
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
      setRecentlyPublishedPostIds(prev => new Set([...Array.from(prev), postId]));
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
              const completedJobs = jobsList.filter(j => j.postId === postId && j.status === 'COMPLETED');
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
        queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
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

  return (
    <>
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
      {activeTranslationIds.length > 0 && expectedJobsCount > 0 && jobsList.some(j => activeTranslationIds.includes(j.postId)) && (
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

      {/* Get All Content Button (only show if not yet loaded) */}
      {allContentLoaded === null && (
        <Card className="p-4 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <h3 className="font-semibold text-sm text-blue-900 dark:text-blue-100">
                {isLoadingAllContent ? (language === 'ru' ? '⏳ Загрузка контента...' : '⏳ Loading content...') : (language === 'ru' ? '⚡ Получить весь контент' : '⚡ Load All Content')}
              </h3>
              {isLoadingAllContent && (
                <div className="mt-3 space-y-2">
                  <Progress 
                    value={Math.min(loadingProgress, 100)}
                    className="h-2"
                    data-testid="progress-loading-content"
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      {language === 'ru' ? 'Загрузка...' : 'Loading...'}
                    </p>
                    <span className="text-xs font-mono text-blue-700 dark:text-blue-300">
                      {Math.round(Math.min(loadingProgress, 100))}%
                    </span>
                  </div>
                </div>
              )}
              {!isLoadingAllContent && (
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                  {language === 'ru' 
                    ? 'Загрузить все содержимое сразу (~1.5 минуты), потом пагинация работает мгновенно без задержек'
                    : 'Load all content at once (~1.5 minutes), then pagination works instantly with no delays'
                  }
                </p>
              )}
            </div>
            <Button 
              onClick={() => {
                setIsLoadingAllContent(true);
                setLoadingProgress(10);
                getContentMutation.mutate();
              }}
              disabled={isLoadingAllContent || getContentMutation.isPending}
              data-testid="button-get-content"
              className="flex-shrink-0"
            >
              {isLoadingAllContent || getContentMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {language === 'ru' ? 'Получить контент' : 'Get Content'}
            </Button>
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
                <option value="">{language === 'ru' ? 'Все языки' : 'All Languages'}</option>
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
      {!isLoadingAllContent && (
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
                    {isLoadingAllContent ? (language === 'ru' ? 'Загружаем контент...' : 'Loading content...') : t('no_content_found')}
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
                    <td className="p-4 text-sm">
                      {post.type === 'post' ? t('post') : post.type === 'page' ? t('page') : post.type}
                    </td>
                    <td className="p-4">{getTranslationBadges(post)}</td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        {/* View button */}
                        <Button
                          onClick={() => setViewingPost(post)}
                          size="sm"
                          variant="outline"
                          title={language === 'ru' ? 'Просмотр' : 'View'}
                          data-testid={'button-view-post-' + post.id}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        {/* Delete button - show if there are completed jobs */}
                        {jobsList.some(j => j.postId === post.id && j.status === 'COMPLETED') && (
                          <Button
                            onClick={async () => {
                              const jobsToDelete = jobsList.filter(j => j.postId === post.id && j.status === 'COMPLETED');
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
                          const completedCount = jobsList.filter(j => j.postId === post.id && j.status === 'COMPLETED').length;
                          
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
      )}

      {/* View Dialog */}
      <Dialog open={viewingPost !== null} onOpenChange={(open) => !open && setViewingPost(null)}>
        <DialogContent className={`overflow-y-auto ${viewFullscreen ? 'fixed inset-0 max-w-none max-h-none rounded-none' : 'max-w-2xl max-h-[80vh]'}`}>
          <DialogHeader className={`flex flex-row items-start justify-between ${viewFullscreen ? 'sticky top-0 bg-background z-10 pb-4 border-b' : ''}`}>
            <div className="flex-1">
              <DialogTitle>{language === 'ru' ? 'Просмотр контента' : 'View Content'}</DialogTitle>
              <DialogDescription>
                {viewingPost?.type === 'post' ? t('post') : viewingPost?.type === 'page' ? t('page') : viewingPost?.type}
              </DialogDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setViewFullscreen(!viewFullscreen)}
              className="ml-2"
              data-testid="button-toggle-view-fullscreen"
            >
              {viewFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
          </DialogHeader>
          {viewingPost && (
            <div className="space-y-4 py-4">
              <div>
                <Label className="text-sm font-medium">{t('post_title')}</Label>
                <p className="mt-2 text-sm">{viewingPost.title.rendered}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">{t('status_col')}</Label>
                <p className="mt-2 text-sm">{viewingPost.status}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">{language === 'ru' ? 'Контент' : 'Content'}</Label>
                <div className="mt-2 p-3 bg-muted rounded-md text-sm max-h-64 overflow-y-auto">
                  <div dangerouslySetInnerHTML={{ __html: viewingPost.content.rendered }} />
                </div>
              </div>
              {viewingPost.translations && Object.keys(viewingPost.translations).length > 0 && (
                <div>
                  <Label className="text-sm font-medium">{language === 'ru' ? 'Переводы' : 'Translations'}</Label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(viewingPost.translations).map(([lang, id]) => (
                      <Badge key={lang}>{lang.toUpperCase()}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => setViewingPost(null)}
              data-testid="button-cancel-view"
            >
              {t('cancel')}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (viewingPost) moveToDraftMutation.mutate(viewingPost.id);
              }}
              disabled={moveToDraftMutation.isPending}
              data-testid="button-move-to-draft"
            >
              {moveToDraftMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {language === 'ru' ? 'Снять с публикации' : 'Move to Draft'}
            </Button>
            <Button
              onClick={() => {
                if (viewingPost) archivePostMutation.mutate(viewingPost.id);
              }}
              disabled={archivePostMutation.isPending}
              data-testid="button-archive-post"
            >
              {archivePostMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {language === 'ru' ? 'В архив' : 'Archive'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editingPost !== null} onOpenChange={(open) => !open && setEditingPost(null)}>
        <DialogContent className={`overflow-y-auto ${editFullscreen ? 'fixed inset-0 max-w-none max-h-none rounded-none' : 'max-w-4xl max-h-[80vh]'}`}>
          <DialogHeader className={`flex flex-row items-start justify-between ${editFullscreen ? 'sticky top-0 bg-background z-10 pb-4 border-b' : ''}`}>
            <div className="flex-1">
              <DialogTitle>{t('edit_translation')}</DialogTitle>
              <DialogDescription>{t('make_corrections')}</DialogDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setEditFullscreen(!editFullscreen)}
              className="ml-2"
              data-testid="button-toggle-edit-fullscreen"
            >
              {editFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
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

      {/* Dialog - OUTSIDE ternary to always render */}
      <Dialog open={showGetContentDialog} onOpenChange={setShowGetContentDialog}>
        <DialogContent data-testid="dialog-get-content" className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {language === 'ru' ? '⏱️ Это займет время' : '⏱️ This will take time'}
            </DialogTitle>
            <DialogDescription>
              {language === 'ru' 
                ? 'Загрузка всего контента займет примерно 1-2 минуты. Пожалуйста, не закрывайте страницу.'
                : 'Loading all content will take approximately 1-2 minutes. Please do not close this page.'
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-2">
            <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded">
              <p className="text-xs text-amber-900 dark:text-amber-100">
                {language === 'ru' 
                  ? '✓ Пагинация будет работать без задержек'
                  : '✓ Pagination will work instantly'
                }
              </p>
            </div>
            
            <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded">
              <p className="text-xs text-blue-900 dark:text-blue-100">
                {language === 'ru' 
                  ? '✓ Фильтры работают мгновенно'
                  : '✓ Filters work instantly'
                }
              </p>
            </div>
          </div>
          
          <DialogFooter className="gap-2">
            <Button 
              variant="outline"
              onClick={() => setShowGetContentDialog(false)}
              disabled={getContentMutation.isPending}
              data-testid="button-cancel-get-content"
            >
              {language === 'ru' ? 'Отмена' : 'Cancel'}
            </Button>
            <Button 
              onClick={() => {
                setIsLoadingAllContent(true);
                getContentMutation.mutate();
              }}
              disabled={getContentMutation.isPending}
              data-testid="button-confirm-get-content"
            >
              {getContentMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {language === 'ru' ? 'Загружается...' : 'Loading...'}
                </>
              ) : (
                language === 'ru' ? 'Загрузить' : 'Load'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
