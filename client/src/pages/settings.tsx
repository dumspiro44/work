import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useLanguage } from '@/contexts/LanguageContext';
import { Loader2, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';
import type { Settings } from '@shared/schema';
import { AVAILABLE_LANGUAGES, type Language } from '@/types';
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

export default function SettingsPage() {
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const [showPassword, setShowPassword] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    wpUrl: '',
    wpUsername: '',
    wpPassword: '',
    sourceLanguage: 'en',
    targetLanguages: [] as string[],
    geminiApiKey: '',
    systemInstruction: '',
  });

  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ['/api/settings'],
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        wpUrl: settings.wpUrl || '',
        wpUsername: settings.wpUsername || '',
        wpPassword: settings.wpPassword || '',
        sourceLanguage: settings.sourceLanguage || 'en',
        targetLanguages: settings.targetLanguages || [],
        geminiApiKey: settings.geminiApiKey || '',
        systemInstruction: settings.systemInstruction || '',
      });
    }
  }, [settings]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const saveMutation = useMutation({
    mutationFn: (data: typeof formData) => apiRequest('POST', '/api/settings', data),
    onSuccess: () => {
      toast({
        title: t('settings_saved'),
        description: t('settings_saved_desc'),
      });
      setHasUnsavedChanges(false);
      queryClient.invalidateQueries({ queryKey: ['/api/settings'] });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: t('save_failed'),
        description: error.message,
      });
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/test-connection', {}),
    onSuccess: (data: { success: boolean; message: string }) => {
      toast({
        title: data.success ? t('connection_success') : t('connection_failed'),
        description: data.message,
        variant: data.success ? 'default' : 'destructive',
      });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: t('connection_failed'),
        description: error.message,
      });
    },
  });

  const installPolylangMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/install-polylang', {}),
    onSuccess: (data: { success: boolean; message: string }) => {
      toast({
        title: data.success ? t('polylang_status') : t('connection_failed'),
        description: data.message,
        variant: data.success ? 'default' : 'destructive',
      });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: t('connection_failed'),
        description: error.message,
      });
    },
  });

  const handleChange = (field: string, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasUnsavedChanges(true);
    
    // Validate Gemini API key
    if (field === 'geminiApiKey') {
      const apiKey = value as string;
      if (apiKey && !apiKey.startsWith('AIza')) {
        setApiKeyError(language === 'ru' 
          ? 'Ключ API должен начинаться с "AIza"' 
          : 'API key must start with "AIza"');
      } else if (apiKey && apiKey.length < 20) {
        setApiKeyError(language === 'ru' 
          ? 'Ключ API слишком короткий' 
          : 'API key is too short');
      } else if (apiKey) {
        setApiKeyError(null);
      }
    }
  };

  const toggleLanguage = (langCode: string) => {
    const newLanguages = formData.targetLanguages.includes(langCode)
      ? formData.targetLanguages.filter(l => l !== langCode)
      : [...formData.targetLanguages, langCode];
    handleChange('targetLanguages', newLanguages);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formData);
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t('configuration_title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('configuration_desc')}
          </p>
        </div>
        {hasUnsavedChanges && (
          <Badge variant="secondary">{t('unsaved_changes')}</Badge>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('wordpress_connection')}</CardTitle>
            <CardDescription>
              {t('wordpress_connection_desc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="wpUrl">{t('wordpress_url')}</Label>
                <Input
                  id="wpUrl"
                  type="url"
                  placeholder={t('wordpress_url_placeholder')}
                  value={formData.wpUrl}
                  onChange={(e) => handleChange('wpUrl', e.target.value)}
                  className="font-mono"
                  data-testid="input-wp-url"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wpUsername">{t('wordpress_username')}</Label>
                <Input
                  id="wpUsername"
                  type="text"
                  placeholder={t('wordpress_username_placeholder')}
                  value={formData.wpUsername}
                  onChange={(e) => handleChange('wpUsername', e.target.value)}
                  data-testid="input-wp-username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wpPassword">{t('admin_password')}</Label>
                <div className="relative">
                  <Input
                    id="wpPassword"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="xxxx xxxx xxxx xxxx"
                    value={formData.wpPassword}
                    onChange={(e) => handleChange('wpPassword', e.target.value)}
                    className="font-mono pr-10"
                    data-testid="input-wp-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="button-toggle-password"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                type="button"
                variant="outline"
                onClick={() => testConnectionMutation.mutate()}
                disabled={testConnectionMutation.isPending || !formData.wpUsername || !formData.wpPassword}
                data-testid="button-test-connection"
              >
                {testConnectionMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                {t('test_connection')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => installPolylangMutation.mutate()}
                disabled={installPolylangMutation.isPending || !formData.wpUrl || !formData.wpUsername || !formData.wpPassword}
                data-testid="button-install-polylang"
              >
                {installPolylangMutation.isPending ? (
                  <Loader2 className="mr-2 w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle className="mr-2 w-4 h-4" />
                )}
                {t('check_polylang_status')}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('translation_settings')}</CardTitle>
            <CardDescription>
              {t('select_target_languages')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sourceLanguage">{t('source_language')}</Label>
              <select
                id="sourceLanguage"
                value={formData.sourceLanguage}
                onChange={(e) => handleChange('sourceLanguage', e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                data-testid="select-source-language"
              >
                {AVAILABLE_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.flag} {lang.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>{t('target_languages')}</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {AVAILABLE_LANGUAGES.filter(l => l.code !== formData.sourceLanguage).map((lang) => (
                  <Button
                    key={lang.code}
                    type="button"
                    variant={formData.targetLanguages.includes(lang.code) ? 'default' : 'outline'}
                    onClick={() => toggleLanguage(lang.code)}
                    className="justify-start"
                    data-testid={`button-language-${lang.code}`}
                  >
                    <span className="mr-2">{lang.flag}</span>
                    {lang.name}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('gemini_api')}</CardTitle>
            <CardDescription>
              {t('gemini_api_desc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="geminiApiKey">{t('gemini_api_key')}</Label>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 underline"
                  data-testid="link-gemini-api-key"
                >
                  {language === 'ru' ? 'Получить ключ API' : 'Get API Key'}
                </a>
              </div>
              <div className="relative flex items-center">
                <Input
                  id="geminiApiKey"
                  type={showApiKey ? 'text' : 'password'}
                  placeholder="AIza..."
                  value={formData.geminiApiKey}
                  onChange={(e) => handleChange('geminiApiKey', e.target.value)}
                  className={`font-mono pr-10 ${apiKeyError ? 'border-red-500' : ''}`}
                  data-testid="input-gemini-api-key"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="button-toggle-api-key"
                  title={showApiKey ? 'Hide API key' : 'Show API key'}
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {apiKeyError && (
                <div className="flex items-center gap-2 text-sm text-red-500" data-testid="error-api-key">
                  <AlertCircle className="w-4 h-4" />
                  <span>{apiKeyError}</span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="systemInstruction">{t('system_instruction')}</Label>
              <Textarea
                id="systemInstruction"
                placeholder="You are a professional translator..."
                value={formData.systemInstruction}
                onChange={(e) => handleChange('systemInstruction', e.target.value)}
                rows={4}
                data-testid="textarea-system-instruction"
              />
              <p className="text-xs text-muted-foreground">
                {language === 'ru' 
                  ? 'Инструкции для AI переводчика для сохранения HTML структуры и шорткодов'
                  : 'Instructions for the AI translator to preserve HTML structure and shortcodes'
                }
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={saveMutation.isPending || !hasUnsavedChanges}
            data-testid="button-save-settings"
          >
            {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saveMutation.isPending ? t('saving') : t('save_settings')}
          </Button>
        </div>
      </form>

      <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to leave this page?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay on page</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              setHasUnsavedChanges(false);
              if (pendingNavigation) {
                window.location.href = pendingNavigation;
              }
            }}>
              Leave without saving
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
