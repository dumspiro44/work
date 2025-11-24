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
import { Loader2, Eye, EyeOff, CheckCircle, AlertCircle, HelpCircle } from 'lucide-react';
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export default function SettingsPage() {
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const [showPassword, setShowPassword] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [diagnosticData, setDiagnosticData] = useState<any>(null);

  const [formData, setFormData] = useState({
    wpUrl: '',
    wpUsername: '',
    wpPassword: '',
    sourceLanguage: 'en',
    targetLanguages: [] as string[],
    geminiApiKey: '',
    systemInstruction: '',
  });

  // Track if we just saved to prevent overwriting user's input with masked values
  const [justSaved, setJustSaved] = useState(false);
  
  // Initialize saved values from sessionStorage on component mount
  const [savedPassword, setSavedPassword] = useState<string>(() => 
    typeof window !== 'undefined' ? sessionStorage.getItem('wpPassword') || '' : ''
  );
  const [savedApiKey, setSavedApiKey] = useState<string>(() => 
    typeof window !== 'undefined' ? sessionStorage.getItem('geminiApiKey') || '' : ''
  );

  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ['/api/settings'],
  });

  useEffect(() => {
    // Only initialize form data if it's empty (initial load)
    // Don't override user's changes when settings are refetched
    if (settings && !hasUnsavedChanges && !justSaved) {
      // If settings have the masked values, use the saved password/API key
      const passwordToUse = (settings.wpPassword && settings.wpPassword !== '••••••••') 
        ? settings.wpPassword 
        : savedPassword;
      const apiKeyToUse = (settings.geminiApiKey && settings.geminiApiKey !== '••••••••') 
        ? settings.geminiApiKey 
        : savedApiKey;
        
      setFormData(prev => {
        // Use target languages from settings, fallback to prev, or empty array
        const targetLanguages = (settings.targetLanguages && settings.targetLanguages.length > 0) 
          ? settings.targetLanguages 
          : (prev.targetLanguages && prev.targetLanguages.length > 0)
            ? prev.targetLanguages
            : [];
        
        // Keep current form values if they're not empty, otherwise use saved values
        // If we have saved values (from previous input in this session), use those
        // This way passwords/API keys persist within the same session
        const password = prev.wpPassword || savedPassword || '';
        const apiKey = prev.geminiApiKey || savedApiKey || '';
        
        return {
          wpUrl: settings.wpUrl || prev.wpUrl,
          wpUsername: settings.wpUsername || prev.wpUsername,
          wpPassword: password,
          sourceLanguage: settings.sourceLanguage || prev.sourceLanguage || 'en',
          targetLanguages,
          geminiApiKey: apiKey,
          systemInstruction: settings.systemInstruction || prev.systemInstruction,
        };
      });
    }
    // Reset justSaved flag after a short delay
    if (justSaved) {
      const timer = setTimeout(() => setJustSaved(false), 100);
      return () => clearTimeout(timer);
    }
  }, [settings, hasUnsavedChanges, justSaved, savedPassword, savedApiKey]);

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
      // Set flag to prevent useEffect from overwriting form with masked values
      setJustSaved(true);
      // Store the saved values in sessionStorage to preserve them across page navigations
      if (formData.wpPassword) {
        sessionStorage.setItem('wpPassword', formData.wpPassword);
      }
      if (formData.geminiApiKey) {
        sessionStorage.setItem('geminiApiKey', formData.geminiApiKey);
      }
      setSavedPassword(formData.wpPassword);
      setSavedApiKey(formData.geminiApiKey);
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
    mutationFn: (data: typeof formData) => apiRequest('POST', '/api/test-connection', data),
    onSuccess: (data: { success: boolean; message: string; language?: string }) => {
      // If a language was detected, automatically set it as source language
      if (data.success && data.language) {
        handleChange('sourceLanguage', data.language);
        toast({
          title: t('connection_success'),
          description: language === 'ru' 
            ? `${data.message}. Язык источника установлен на ${data.language.toUpperCase()}.`
            : `${data.message}. Source language set to ${data.language.toUpperCase()}.`,
          variant: 'default',
        });
      } else {
        toast({
          title: data.success ? t('connection_success') : t('connection_failed'),
          description: data.message,
          variant: data.success ? 'default' : 'destructive',
        });
      }
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
    mutationFn: (data: typeof formData) => apiRequest('POST', '/api/install-polylang', data),
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

  const diagnosticMutation = useMutation({
    mutationFn: () => apiRequest('GET', '/api/wordpress-diagnostics', null),
    onSuccess: (data) => {
      setDiagnosticData(data);
      toast({
        title: language === 'ru' ? 'Диагностика завершена' : 'Diagnostics complete',
        description: language === 'ru' 
          ? `Обнаружено page builders: ${data.detectedBuilders.join(', ') || 'Нет'}`
          : `Detected page builders: ${data.detectedBuilders.join(', ') || 'None'}`,
      });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: language === 'ru' ? 'Ошибка диагностики' : 'Diagnostics failed',
        description: error.message,
      });
    },
  });

  const handleChange = (field: string, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasUnsavedChanges(true);
    
    // Save the actual value when user changes password or API key
    if (field === 'wpPassword') {
      const password = value as string;
      // Only save if it's not the masked value
      if (password !== '••••••••') {
        setSavedPassword(password);
      }
    }
    
    if (field === 'geminiApiKey') {
      const apiKey = value as string;
      // Only save if it's not the masked value
      if (apiKey !== '••••••••') {
        setSavedApiKey(apiKey);
      }
      
      // Validate Gemini API key
      if (!apiKey) {
        // Clear error when field is empty
        setApiKeyError(null);
      } else if (apiKey.length < 10) {
        setApiKeyError(language === 'ru' 
          ? 'Ключ API слишком короткий' 
          : 'API key is too short');
      } else if (apiKey.startsWith('AIza') && apiKey.length < 20) {
        setApiKeyError(language === 'ru' 
          ? 'Gemini ключ API должен быть минимум 20 символов' 
          : 'Gemini API key must be at least 20 characters');
      } else {
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
                <div className="flex items-center gap-2">
                  <Label htmlFor="wpUrl">{t('wordpress_url')}</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs">
                      {language === 'ru' 
                        ? 'Полный URL вашего WordPress сайта, например: https://example.com'
                        : 'Full URL of your WordPress site, e.g., https://example.com'
                      }
                    </TooltipContent>
                  </Tooltip>
                </div>
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
                <div className="flex items-center gap-2">
                  <Label htmlFor="wpUsername">{t('wordpress_username')}</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs">
                      {language === 'ru' 
                        ? 'Имя пользователя администратора WordPress'
                        : 'WordPress administrator username'
                      }
                    </TooltipContent>
                  </Tooltip>
                </div>
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
                <div className="flex items-center gap-2">
                  <Label htmlFor="wpPassword">{t('admin_password')}</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-sm">
                      <div className="space-y-2">
                        <p className="font-semibold">
                          {language === 'ru' ? 'Application Password (не обычный пароль!)' : 'Application Password (NOT regular password!)'}
                        </p>
                        <ol className="list-decimal list-inside space-y-1 text-xs">
                          <li>{language === 'ru' 
                            ? 'Перейдите в админ-панель WordPress'
                            : 'Go to WordPress admin panel'
                          }</li>
                          <li>{language === 'ru' 
                            ? 'Users → Your Profile'
                            : 'Users → Your Profile'
                          }</li>
                          <li>{language === 'ru' 
                            ? 'Найдите "Application Passwords"'
                            : 'Find "Application Passwords"'
                          }</li>
                          <li>{language === 'ru' 
                            ? 'Нажмите "Generate Application Password"'
                            : 'Click "Generate Application Password"'
                          }</li>
                          <li>{language === 'ru' 
                            ? 'Скопируйте сгенерированный пароль'
                            : 'Copy the generated password'
                          }</li>
                        </ol>
                        <p className="text-xs italic">
                          {language === 'ru' 
                            ? 'WordPress требует этого для безопасности REST API'
                            : 'WordPress requires this for REST API security'
                          }
                        </p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </div>
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
                onClick={() => testConnectionMutation.mutate(formData)}
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
                onClick={() => installPolylangMutation.mutate(formData)}
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
              <Button
                type="button"
                variant="outline"
                onClick={() => diagnosticMutation.mutate()}
                disabled={diagnosticMutation.isPending || !formData.wpUrl || !formData.wpUsername || !formData.wpPassword}
                data-testid="button-diagnose-builders"
              >
                {diagnosticMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                {language === 'ru' ? 'Диагностика' : 'Diagnose'}
              </Button>
            </div>
            {diagnosticData && (
              <div className="mt-4 p-4 bg-secondary/50 rounded-lg space-y-3 text-sm">
                <div>
                  <p className="font-semibold mb-2">
                    {language === 'ru' ? 'Page Builders обнаружены:' : 'Detected Page Builders:'}
                  </p>
                  {diagnosticData.detectedBuilders.length > 0 ? (
                    <div className="space-y-1">
                      {diagnosticData.detectedBuilders.map((builder: string) => (
                        <div key={builder} className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                          <span>{builder}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-muted-foreground">
                      {language === 'ru' ? 'Page builders не обнаружены' : 'No page builders detected'}
                    </div>
                  )}
                </div>
                
                {diagnosticData.foundMetaFields && Object.keys(diagnosticData.foundMetaFields).length > 0 && (
                  <div>
                    <p className="font-semibold mb-2 text-green-600 dark:text-green-400">
                      {language === 'ru' ? 'Найденные метаполя builder:' : 'Found Builder Meta Fields:'}
                    </p>
                    <div className="space-y-1">
                      {Object.entries(diagnosticData.foundMetaFields as Record<string, boolean>).map(([key, value]: [string, boolean]) => (
                        value && (
                          <div key={key} className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                            <code className="text-xs bg-background/50 px-2 py-1 rounded">{key}</code>
                          </div>
                        )
                      ))}
                    </div>
                  </div>
                )}
                
                <p className="text-xs text-muted-foreground">
                  {language === 'ru' 
                    ? `Все мета поля (${diagnosticData.metaFieldsAvailable.length}): ${diagnosticData.metaFieldsAvailable.join(', ') || 'нет'}`
                    : `All meta fields (${diagnosticData.metaFieldsAvailable.length}): ${diagnosticData.metaFieldsAvailable.join(', ') || 'none'}`
                  }
                </p>
              </div>
            )}
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
                className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                data-testid="select-source-language"
              >
                {AVAILABLE_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code} className="bg-background text-foreground">
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
            disabled={saveMutation.isPending || !hasUnsavedChanges || !!apiKeyError}
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
