import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert } from '@/components/ui/alert';
import { FileText, Languages, Clock, Zap, CheckCircle, Activity, Globe, Zap as ZapIcon, Sparkles } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useWordPress } from '@/contexts/WordPressContext';
import { AVAILABLE_LANGUAGES } from '@/types';
import { useState, useEffect } from 'react';

export default function Dashboard() {
  const { language, t } = useLanguage();
  const [, setLocation] = useLocation();
  const [sessionTranslatedCount, setSessionTranslatedCount] = useState(0);
  const { stats, statsLoading, settings, settingsLoading, jobs, jobsLoading } = useWordPress();

  // Track published jobs in this session using sessionStorage (persists across page reloads)
  useEffect(() => {
    if (stats) {
      const storageKey = 'dashboard_baseline_translated_count';
      const stored = sessionStorage.getItem(storageKey);
      const sessionPublishedKey = 'dashboard_session_published_count';
      
      if (!stored) {
        // First time in this session: establish baseline
        sessionStorage.setItem(storageKey, stats.translatedPosts.toString());
        sessionStorage.setItem(sessionPublishedKey, '0');
        setSessionTranslatedCount(0);
      } else {
        // Calculate how many NEW translations were published in this session
        const baseline = parseInt(stored, 10);
        const totalNow = stats.translatedPosts;
        const sessionCount = Math.max(0, totalNow - baseline);
        setSessionTranslatedCount(sessionCount);
        
        // Update the session published count in storage for reference
        sessionStorage.setItem(sessionPublishedKey, sessionCount.toString());
      }
    }
  }, [stats]);

  // Check if WordPress is connected (from wpConnected field in database)
  const isWpConnected = (settings as any)?.wpConnected === 1 || (settings as any)?.wpConnected === true;
  
  // Check if API key is set (if it's masked with dots, it means it's saved in DB; or if it has real value)
  const isApiKeySet = settings?.geminiApiKey && settings.geminiApiKey !== '';

  // Get real recent activity from jobs
  const recentActivity = (jobs || [])
    .filter(j => j.status === 'COMPLETED')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 3);

  // Calculate language coverage from stats
  const languageCoverage = (settings?.targetLanguages || [])
    .map(langCode => {
      const langName = AVAILABLE_LANGUAGES.find(l => l.code === langCode)?.name || langCode;
      const percentage = stats?.languageCoverage?.[langCode] || 0;
      
      let color = 'bg-red-500';
      if (percentage >= 75) color = 'bg-green-500';
      else if (percentage >= 50) color = 'bg-yellow-500';
      
      return { code: langCode, name: langName, percentage, color };
    });

  const formatTokens = (v: number) => (v >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : v.toLocaleString());

  const statCards = [
    { titleKey: 'total_posts', value: (stats?.totalPosts ?? 0) + (stats?.totalPages ?? 0), Icon: FileText },
    { titleKey: 'translated_posts', value: stats?.translatedPosts ?? 0, Icon: Languages, sessionCount: sessionTranslatedCount },
    { titleKey: 'pending_jobs', value: stats?.pendingJobs ?? 0, Icon: Clock },
    { titleKey: 'tokens_used', value: stats?.tokensUsed ?? 0, Icon: ZapIcon, format: formatTokens },
  ];

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
    return minutes < 1 ? 'just now' : minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`;
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header with title and status buttons */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('overview')}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* WordPress Connection Status - Navigate to Configuration */}
          <Button 
            size="sm" 
            variant="outline" 
            className={isWpConnected ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}
            onClick={() => setLocation('/configuration')}
            data-testid="button-wp-status"
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            {isWpConnected ? (language === 'ru' ? 'WP подключен' : 'WP Connected') : (language === 'ru' ? 'WP не подключен' : 'WP Not Connected')}
          </Button>

          {/* API Setup Button - Navigate to Configuration */}
          <Button 
            size="sm" 
            variant="outline"
            className={isApiKeySet ? "text-green-600 dark:text-green-400" : ""}
            onClick={() => setLocation('/configuration')}
            data-testid="button-api-status"
          >
            {isApiKeySet ? (language === 'ru' ? 'API установлен' : 'API Configured') : (language === 'ru' ? 'Установить API' : 'Setup API')}
          </Button>

          {/* Import Posts from WordPress */}
          <Button 
            size="sm" 
            variant="default" 
            className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
            disabled={!isWpConnected}
            onClick={() => {
              // Invalidate posts query to ensure fresh data and navigate
              queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
              setLocation('/posts');
            }}
            data-testid="button-import-posts"
          >
            <Activity className="w-4 h-4 mr-2" />
            {language === 'ru' ? 'Получить контент' : 'Get Content'}
          </Button>
        </div>
      </div>

      {statsLoading && isWpConnected && (
        <Alert className="mb-4 bg-blue-950 border-blue-800">
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></div>
            <span>
              {language === 'ru' 
                ? 'Загрузка данных с WordPress... Это может занять некоторое время.' 
                : 'Loading data from WordPress... This may take a moment.'}
            </span>
          </div>
        </Alert>
      )}

      {/* Stat cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat: any) => {
          const Icon = stat.Icon;
          return (
            <Card key={stat.titleKey} className="border-border/50 hover-elevate" data-testid={`card-stat-${stat.titleKey}`}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t(stat.titleKey)}
                </CardTitle>
                <Icon className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="space-y-2">
                {statsLoading ? (
                  <Skeleton className="h-10 w-20" />
                ) : (
                  <>
                    <div className="text-3xl font-bold text-foreground" data-testid={`text-${stat.titleKey}-value`}>
                      {'format' in stat ? (stat.format ? stat.format(stat.value) : stat.value.toLocaleString()) : stat.value.toLocaleString()}
                    </div>
                    {stat.sessionCount !== undefined && (
                      <div className="text-xs text-muted-foreground">
                        {language === 'ru' ? `${stat.sessionCount} опубликовано в этой сессии` : `${stat.sessionCount} published this session`}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent Activity and Language Coverage */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <Card className="border-border/50 hover-elevate" data-testid="card-recent-activity">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-muted-foreground" />
              <CardTitle>{language === 'ru' ? 'Последняя активность' : 'Recent Activity'}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {jobsLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">{language === 'ru' ? 'Нет завершенных переводов' : 'No completed translations yet'}</p>
            ) : (
              recentActivity.map((job) => (
                <div key={job.id} className="flex items-start justify-between gap-3 pb-3 border-b border-border/50 last:pb-0 last:border-0">
                  <div className="flex items-start gap-3 flex-1">
                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{job.postTitle}</p>
                      <p className="text-xs text-muted-foreground mt-1">{formatTime(job.createdAt.toString())}</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-xs flex-shrink-0">
                    {AVAILABLE_LANGUAGES.find(l => l.code === job.targetLanguage)?.code.toUpperCase()}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Language Coverage */}
        <Card className="border-border/50 hover-elevate" data-testid="card-language-coverage">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-muted-foreground" />
              <CardTitle>{language === 'ru' ? 'Охват языков' : 'Language Coverage'}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {settingsLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : languageCoverage.length === 0 ? (
              <p className="text-sm text-muted-foreground">{language === 'ru' ? 'Выберите целевые языки в конфигурации' : 'Select target languages in configuration'}</p>
            ) : (
              languageCoverage.map((lang) => (
                <div key={lang.code}>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-sm font-medium text-foreground">{lang.name}</p>
                    <span className="text-sm font-semibold text-foreground">{lang.percentage}%</span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div
                      className={`${lang.color} h-2 rounded-full transition-all duration-300`}
                      style={{ width: `${lang.percentage}%` }}
                      data-testid={`progress-language-${lang.code}`}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
