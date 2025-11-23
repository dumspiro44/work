import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileText, Languages, Clock, Zap, CheckCircle, Activity, Globe, Zap as ZapIcon, Eye, EyeOff } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { AVAILABLE_LANGUAGES } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import type { DashboardStats } from '@/types';
import type { TranslationJob, Settings } from '@shared/schema';

export default function Dashboard() {
  const { language, t } = useLanguage();
  const { toast } = useToast();
  const [showApiModal, setShowApiModal] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ['/api/stats'],
  });

  const { data: settings, isLoading: settingsLoading } = useQuery<Settings>({
    queryKey: ['/api/settings'],
  });

  const { data: jobs, isLoading: jobsLoading } = useQuery<TranslationJob[]>({
    queryKey: ['/api/jobs'],
  });

  // Mutation for saving API key
  const saveApiKeyMutation = useMutation({
    mutationFn: async () => {
      if (!settings) return;
      return apiRequest('POST', '/api/settings', {
        ...settings,
        geminiApiKey: apiKeyInput,
      });
    },
    onSuccess: () => {
      toast({
        title: language === 'ru' ? 'API ключ сохранен' : 'API key saved',
        description: language === 'ru' ? 'API Google Gemini подключен' : 'Google Gemini API connected',
      });
      setShowApiModal(false);
      setApiKeyInput('');
      queryClient.invalidateQueries({ queryKey: ['/api/settings'] });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: language === 'ru' ? 'Ошибка' : 'Error',
        description: error.message,
      });
    },
  });

  // Check if WordPress is connected
  const isWpConnected = settings?.wpUrl && settings?.wpUsername && settings?.wpPassword;
  
  // Check if API key is set
  const isApiKeySet = settings?.geminiApiKey && settings.geminiApiKey !== '••••••••';

  // Get real recent activity from jobs
  const recentActivity = (jobs || [])
    .filter(j => j.status === 'COMPLETED')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 3);

  // Calculate language coverage
  const languageCoverage = (settings?.targetLanguages || [])
    .map(langCode => {
      const langName = AVAILABLE_LANGUAGES.find(l => l.code === langCode)?.name || langCode;
      const completed = (jobs || []).filter(j => j.targetLanguage === langCode && j.status === 'COMPLETED').length;
      const total = (jobs || []).filter(j => j.targetLanguage === langCode).length;
      const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
      
      let color = 'bg-red-500';
      if (percentage >= 75) color = 'bg-green-500';
      else if (percentage >= 50) color = 'bg-yellow-500';
      
      return { code: langCode, name: langName, percentage, color };
    });

  const formatTokens = (v: number) => (v >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : v.toLocaleString());

  const statCards = [
    { titleKey: 'total_posts', value: stats?.totalPosts ?? 0, Icon: FileText },
    { titleKey: 'translated_posts', value: stats?.translatedPosts ?? 0, Icon: Languages },
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
          {/* WordPress Connection Status */}
          <Button 
            size="sm" 
            variant="outline" 
            className={isWpConnected ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}
            disabled
            data-testid="button-wp-status"
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            {isWpConnected ? (language === 'ru' ? 'WP подключен' : 'WP Connected') : (language === 'ru' ? 'WP не подключен' : 'WP Not Connected')}
          </Button>

          {/* API Setup Button */}
          <Button 
            size="sm" 
            variant="outline"
            className={isApiKeySet ? "text-green-600 dark:text-green-400" : ""}
            onClick={() => setShowApiModal(true)}
            disabled={!isWpConnected}
            data-testid="button-api-status"
          >
            {isApiKeySet ? (language === 'ru' ? 'API подключен' : 'API Connected') : (language === 'ru' ? 'Установить API' : 'Setup API')}
          </Button>

          {/* Run Auto-Scan Button */}
          <Button 
            size="sm" 
            variant="default" 
            className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
            disabled={!isWpConnected || !isApiKeySet}
            data-testid="button-run-auto-scan"
          >
            <Activity className="w-4 h-4 mr-2" />
            {language === 'ru' ? 'Запустить сканирование' : 'Run Auto-Scan'}
          </Button>
        </div>
      </div>

      {/* API Setup Modal */}
      <Dialog open={showApiModal} onOpenChange={setShowApiModal}>
        <DialogContent data-testid="dialog-api-setup">
          <DialogHeader>
            <DialogTitle>{language === 'ru' ? 'Установить Google Gemini API' : 'Setup Google Gemini API'}</DialogTitle>
            <DialogDescription>
              {language === 'ru' ? 'Введите ваш ключ API Google Gemini' : 'Enter your Google Gemini API key'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="apiKeyInput">{language === 'ru' ? 'API ключ' : 'API Key'}</Label>
              <div className="relative">
                <Input
                  id="apiKeyInput"
                  type={showApiKey ? 'text' : 'password'}
                  placeholder="AIza..."
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  className="font-mono pr-10"
                  data-testid="input-api-key"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="button-toggle-api-visibility"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApiModal(false)} data-testid="button-cancel-api">
              {language === 'ru' ? 'Отмена' : 'Cancel'}
            </Button>
            <Button 
              onClick={() => saveApiKeyMutation.mutate()}
              disabled={!apiKeyInput || saveApiKeyMutation.isPending}
              data-testid="button-save-api"
            >
              {saveApiKeyMutation.isPending ? (language === 'ru' ? 'Сохранение...' : 'Saving...') : (language === 'ru' ? 'Сохранить' : 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stat cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => {
          const Icon = stat.Icon;
          return (
            <Card key={stat.titleKey} className="border-border/50 hover-elevate" data-testid={`card-stat-${stat.titleKey}`}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t(stat.titleKey)}
                </CardTitle>
                <Icon className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-10 w-20" />
                ) : (
                  <div className="text-3xl font-bold text-foreground" data-testid={`text-${stat.titleKey}-value`}>
                    {'format' in stat ? (stat.format ? stat.format(stat.value) : stat.value.toLocaleString()) : stat.value.toLocaleString()}
                  </div>
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
