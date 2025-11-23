import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, Languages, Clock, Zap } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import type { DashboardStats } from '@/types';

export default function Dashboard() {
  const { language, t } = useLanguage();
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ['/api/stats'],
  });

  const statCards = [
    {
      titleKey: 'total_posts',
      descKey: 'total_posts_desc',
      value: stats?.totalPosts ?? 0,
      icon: FileText,
    },
    {
      titleKey: 'translated_posts',
      descKey: 'translated_posts_desc',
      value: stats?.translatedPosts ?? 0,
      icon: Languages,
    },
    {
      titleKey: 'pending_jobs',
      descKey: 'pending_jobs_desc',
      value: stats?.pendingJobs ?? 0,
      icon: Clock,
    },
    {
      titleKey: 'tokens_used',
      descKey: 'tokens_used_desc',
      value: stats?.tokensUsed ?? 0,
      icon: Zap,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-primary/10 to-primary/5 dark:from-primary/20 dark:to-primary/10 px-6 md:px-8 py-6 md:py-8 rounded-lg border border-primary/20 dark:border-primary/30">
        <h2 className="text-lg font-semibold text-primary mb-2" data-testid="text-app-name">
          WP PolyLingo Auto-Translator
        </h2>
        <p className="text-sm text-foreground leading-relaxed" data-testid="text-app-tagline">
          {t('app_tagline')}
        </p>
      </div>

      <div className="p-6 md:p-8 space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">{t('dashboard_title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('overview')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((stat) => (
            <Card key={stat.titleKey} data-testid={`card-stat-${stat.titleKey}`}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t(stat.titleKey)}
                </CardTitle>
                <stat.icon className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-10 w-24" />
                ) : (
                  <>
                    <div className="text-3xl font-bold" data-testid={`text-${stat.titleKey}-value`}>
                      {stat.value.toLocaleString()}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t(stat.descKey)}
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('getting_started')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <h3 className="font-medium">{t('configure_wp')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('configure_wp_desc')}
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="font-medium">{t('select_posts')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('select_posts_desc')}
              </p>
            </div>
            <div className="space-y-2">
              <h3 className="font-medium">{t('monitor_progress')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('monitor_progress_desc')}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
