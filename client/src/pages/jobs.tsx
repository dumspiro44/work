import { useMutation } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle, XCircle, Clock, Loader2, Upload } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useLanguage } from '@/contexts/LanguageContext';
import type { TranslationJob } from '@shared/schema';

export default function Jobs() {
  const { t, language } = useLanguage();
  const { toast } = useToast();

  const { data: jobs, isLoading } = useQuery<TranslationJob[]>({
    queryKey: ['/api/jobs'],
    refetchInterval: 3000,
  });

  const publishMutation = useMutation({
    mutationFn: (jobId: string) => apiRequest('POST', `/api/jobs/${jobId}/publish`, {}),
    onSuccess: (data: any) => {
      toast({
        title: language === 'ru' ? 'Успешно опубликовано' : 'Published successfully',
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: t('publish_failed'),
        description: error.message,
      });
    },
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'FAILED':
        return <XCircle className="w-4 h-4 text-red-600" />;
      case 'PROCESSING':
        return <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />;
      default:
        return <Clock className="w-4 h-4 text-yellow-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      COMPLETED: 'default',
      FAILED: 'destructive',
      PROCESSING: 'secondary',
      PENDING: 'outline',
    };
    return (
      <Badge variant={variants[status] || 'outline'} data-testid={`badge-status-${status}`}>
        {language === 'ru' ? 
          ({
            'COMPLETED': 'Завершено',
            'FAILED': 'Ошибка',
            'PROCESSING': 'В обработке',
            'PENDING': 'В ожидании',
          }[status] || status)
          : status
        }
      </Badge>
    );
  };

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
      <div>
        <h1 className="text-2xl font-semibold">{t('translation_jobs_page')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('monitor_translations')}</p>
      </div>

      {jobs?.length === 0 ? (
        <Card className="p-8">
          <div className="text-center space-y-2">
            <Briefcase className="w-12 h-12 mx-auto text-muted-foreground opacity-50" />
            <h3 className="font-medium">{t('no_jobs')}</h3>
            <p className="text-sm text-muted-foreground">{t('start_translation')}</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {jobs?.map((job) => (
            <Card key={job.id} className="p-6" data-testid={`card-job-${job.id}`}>
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {getStatusIcon(job.status)}
                      <h3 className="font-medium truncate" data-testid={`text-job-title-${job.id}`}>
                        {job.postTitle}
                      </h3>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                      <span className="font-mono">Post #{job.postId}</span>
                      <span>•</span>
                      <span>{job.sourceLanguage} → {job.targetLanguage}</span>
                      {job.tokensUsed !== null && job.tokensUsed > 0 && (
                        <>
                          <span>•</span>
                          <span>{job.tokensUsed.toLocaleString()} {t('tokens')}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div data-testid={`badge-job-status-${job.id}`}>
                    {getStatusBadge(job.status)}
                  </div>
                </div>

                {(job.status === 'PROCESSING' || job.status === 'PENDING') && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{t('progress')}</span>
                      <span data-testid={`text-job-progress-${job.id}`}>{job.progress}%</span>
                    </div>
                    <Progress value={job.progress} data-testid={`progress-job-${job.id}`} />
                  </div>
                )}

                {job.status === 'FAILED' && job.errorMessage && (
                  <div className="p-3 bg-destructive/10 rounded-md">
                    <p className="text-sm text-destructive" data-testid={`text-job-error-${job.id}`}>
                      {job.errorMessage}
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-2">
                  <span>{t('created')} {new Date(job.createdAt).toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US')}</span>
                  <span>{t('updated')} {new Date(job.updatedAt).toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US')}</span>
                </div>

                {/* Publish Button for Completed Jobs */}
                {job.status === 'COMPLETED' && (
                  <div className="pt-4 border-t">
                    <Button
                      onClick={() => publishMutation.mutate(job.id)}
                      disabled={publishMutation.isPending}
                      className="w-full"
                      data-testid={`button-publish-${job.id}`}
                    >
                      {publishMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      <Upload className="mr-2 h-4 w-4" />
                      {t('publish_to_wordpress')}
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Briefcase({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}
