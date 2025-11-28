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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Copy, ChevronDown } from 'lucide-react';

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
  const [polylangStatus, setPolylangStatus] = useState<{ success: boolean; message?: string } | null>(null);

  const [formData, setFormData] = useState({
    wpUrl: '',
    wpUsername: '',
    wpPassword: '',
    wpAuthMethod: 'basic_auth' as 'basic_auth' | 'application_password',
    sourceLanguage: 'en',
    targetLanguages: [] as string[],
    geminiApiKey: '',
    systemInstruction: '',
  });

  // Track if we just saved to prevent overwriting user's input with masked values
  const [justSaved, setJustSaved] = useState(false);
  
  // Track if diagnostics has been run to avoid duplicate calls
  const [hasDiagnosticsRun, setHasDiagnosticsRun] = useState(false);
  
  // Initialize saved values from localStorage on component mount (persist across page reloads)
  const [savedPassword, setSavedPassword] = useState<string>(() => 
    typeof window !== 'undefined' ? localStorage.getItem('wpPassword') || '' : ''
  );
  const [savedApiKey, setSavedApiKey] = useState<string>(() => 
    typeof window !== 'undefined' ? localStorage.getItem('geminiApiKey') || '' : ''
  );
  const [savedWpUrl, setSavedWpUrl] = useState<string>(() => 
    typeof window !== 'undefined' ? localStorage.getItem('wpUrl') || '' : ''
  );
  const [savedWpUsername, setSavedWpUsername] = useState<string>(() => 
    typeof window !== 'undefined' ? localStorage.getItem('wpUsername') || '' : ''
  );

  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ['/api/settings'],
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
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
          wpUrl: settings.wpUrl || prev.wpUrl || savedWpUrl,
          wpUsername: settings.wpUsername || prev.wpUsername || savedWpUsername,
          wpPassword: password,
          wpAuthMethod: (settings.wpAuthMethod as 'basic_auth' | 'application_password') || prev.wpAuthMethod || 'basic_auth',
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
  }, [settings, hasUnsavedChanges, justSaved, savedPassword, savedApiKey, savedWpUrl, savedWpUsername]);

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

  // Восстановить данные из localStorage при первой загрузке страницы
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const storedWpUrl = localStorage.getItem('wpUrl');
    const storedWpUsername = localStorage.getItem('wpUsername');
    const storedWpPassword = localStorage.getItem('wpPassword');
    const storedGeminiApiKey = localStorage.getItem('geminiApiKey');
    
    if (storedWpUrl || storedWpUsername || storedWpPassword || storedGeminiApiKey) {
      setFormData(prev => ({
        ...prev,
        wpUrl: storedWpUrl || prev.wpUrl,
        wpUsername: storedWpUsername || prev.wpUsername,
        wpPassword: storedWpPassword || prev.wpPassword,
        geminiApiKey: storedGeminiApiKey || prev.geminiApiKey,
      }));
    }
  }, []); // Запустить только один раз при монтировании

  // Auto-run diagnostics on page load if WordPress is connected and diagnostics hasn't been run yet
  useEffect(() => {
    if (formData.wpUrl && !hasDiagnosticsRun && !diagnosticData) {
      setHasDiagnosticsRun(true);
    }
  }, [formData.wpUrl, hasDiagnosticsRun, diagnosticData]);

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
      // Store the saved values in localStorage to preserve them across page reloads and navigation
      if (formData.wpPassword) {
        localStorage.setItem('wpPassword', formData.wpPassword);
      }
      if (formData.geminiApiKey) {
        localStorage.setItem('geminiApiKey', formData.geminiApiKey);
      }
      if (formData.wpUrl) {
        localStorage.setItem('wpUrl', formData.wpUrl);
      }
      if (formData.wpUsername) {
        localStorage.setItem('wpUsername', formData.wpUsername);
      }
      setSavedPassword(formData.wpPassword);
      setSavedApiKey(formData.geminiApiKey);
      setSavedWpUrl(formData.wpUrl);
      setSavedWpUsername(formData.wpUsername);
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
    mutationFn: async (data: typeof formData) => {
      const connectionResult = await apiRequest('POST', '/api/test-connection', data);
      // Check Polylang status (add timestamp to bust cache)
      const polylangResult = await apiRequest('GET', `/api/check-polylang?t=${Date.now()}`, null);
      return { ...connectionResult, polylang: polylangResult };
    },
    onSuccess: (data: { success: boolean; message: string; language?: string; polylang?: any }) => {
      // Store Polylang status
      if (data.polylang) {
        setPolylangStatus(data.polylang);
      }
      
      // If a language was detected, automatically set it as source language
      if (data.success && data.language) {
        handleChange('sourceLanguage', data.language);
        
        // Auto-save settings to DB when connection is successful
        saveMutation.mutate(formData);
        
        toast({
          title: t('connection_success'),
          description: language === 'ru' 
            ? `${data.message}. Язык источника установлен на ${data.language.toUpperCase()}.`
            : `${data.message}. Source language set to ${data.language.toUpperCase()}.`,
          variant: 'default',
        });
        
        // Invalidate settings cache to update AppSidebar
        queryClient.invalidateQueries({ queryKey: ['/api/settings'] });
        
        // Auto-run diagnostics after successful connection
        setTimeout(() => {
          diagnosticMutation.mutate();
        }, 500);
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
    mutationFn: (data: typeof formData & { language?: string }) => apiRequest('POST', '/api/install-polylang', data),
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

  const syncLanguagesMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/sync-languages', null),
    onSuccess: (data: { success: boolean; message: string; languages: string[]; polylangLanguages: string[]; defaultLanguage?: string }) => {
      if (data.success) {
        // Update form data with synced languages and default language
        handleChange('sourceLanguage', data.defaultLanguage || 'en');
        handleChange('targetLanguages', data.languages);
        
        // Save the default sourceLanguage + target languages to DB
        saveMutation.mutate({
          ...formData,
          sourceLanguage: data.defaultLanguage || 'en',
          targetLanguages: data.languages,
        });
        
        toast({
          title: language === 'ru' ? 'Языки синхронизированы' : 'Languages synchronized',
          description: language === 'ru'
            ? `Исходный: ${data.defaultLanguage}, целевые: ${data.languages.join(', ')}`
            : `Source: ${data.defaultLanguage}, targets: ${data.languages.join(', ')}`,
          variant: 'default',
        });
      }
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: language === 'ru' ? 'Ошибка синхронизации' : 'Sync failed',
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
    // Don't allow selecting the source language as a target language
    if (langCode === formData.sourceLanguage) {
      toast({
        variant: 'destructive',
        title: language === 'ru' ? 'Ошибка' : 'Error',
        description: language === 'ru' 
          ? 'Нельзя переводить на исходный язык' 
          : 'Cannot translate to the source language',
      });
      return;
    }
    
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
        {polylangStatus && !polylangStatus.success && (
          <div className="bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h3 className="font-semibold text-yellow-900 dark:text-yellow-100">
                  {language === 'ru' ? '⚠️ Polylang не установлен' : '⚠️ Polylang Not Installed'}
                </h3>
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  {language === 'ru'
                    ? 'Плагин Polylang PRO не обнаружен на вашем WordPress сайте. Пожалуйста, установите и активируйте плагин Polylang PRO для работы с мультиязычностью.'
                    : 'Polylang PRO plugin was not found on your WordPress site. Please install and activate Polylang PRO plugin to enable multilingual functionality.'}
                </p>
              </div>
            </div>
          </div>
        )}
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
              <div className="space-y-2 md:col-span-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="wpAuthMethod">
                    {language === 'ru' ? 'Способ аутентификации' : 'Authentication Method'}
                  </Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-md">
                      <div className="space-y-3 text-xs">
                        <div>
                          <p className="font-semibold mb-2">
                            {language === 'ru' ? '🔒 Обычный пароль администратора' : '🔒 Regular Admin Password'}
                          </p>
                          <p className="mb-2">
                            {language === 'ru' 
                              ? 'Используйте ваш обычный пароль администратора WordPress.'
                              : 'Use your regular WordPress admin password.'
                            }
                          </p>
                          <p className="font-semibold mb-1">
                            {language === 'ru' ? 'Требуется плагин:' : 'Requires plugin:'}
                          </p>
                          <ol className="list-decimal list-inside space-y-1 mb-2">
                            <li>{language === 'ru' 
                              ? 'Перейдите в админ-панель WordPress > Плагины > Добавить новый'
                              : 'Go to WordPress admin > Plugins > Add New'
                            }</li>
                            <li>{language === 'ru' 
                              ? 'Найдите "REST API Authentication for WP" от miniOrange'
                              : 'Search for "REST API Authentication for WP" by miniOrange'
                            }</li>
                            <li>{language === 'ru' 
                              ? 'Нажмите "Установить" и "Активировать"'
                              : 'Click "Install" and "Activate"'
                            }</li>
                            <li>{language === 'ru' 
                              ? 'После активации используйте обычный пароль admin в соответствующем поле'
                              : 'After activation, use your admin password in the corresponding field'
                            }</li>
                          </ol>
                        </div>
                        <div className="border-t border-foreground/20 pt-2">
                          <p className="font-semibold mb-2">
                            {language === 'ru' ? '🔐 Application Password (более безопасно)' : '🔐 Application Password (more secure)'}
                          </p>
                          <p className="mb-2">
                            {language === 'ru' 
                              ? 'Генерируется в админ-панели. Требует WordPress 5.6+'
                              : 'Generated in admin panel. Requires WordPress 5.6+'
                            }
                          </p>
                          <ol className="list-decimal list-inside space-y-1">
                            <li>{language === 'ru' 
                              ? 'Перейдите в админ-панель WordPress'
                              : 'Go to WordPress admin panel'
                            }</li>
                            <li>{language === 'ru' 
                              ? 'Пользователи > Профиль вашего пользователя'
                              : 'Users > Your Profile'
                            }</li>
                            <li>{language === 'ru' 
                              ? 'Найдите "Application Passwords"'
                              : 'Find "Application Passwords"'
                            }</li>
                            <li>{language === 'ru' 
                              ? 'Введите название приложения (например "WP PolyLingo")'
                              : 'Enter app name (e.g., "WP PolyLingo")'
                            }</li>
                            <li>{language === 'ru' 
                              ? 'Нажмите "Generate Application Password"'
                              : 'Click "Generate Application Password"'
                            }</li>
                            <li>{language === 'ru' 
                              ? 'Скопируйте сгенерированный пароль и вставьте в соответствующее поле'
                              : 'Copy the generated password and paste in the corresponding field'
                            }</li>
                          </ol>
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <select
                  id="wpAuthMethod"
                  value={formData.wpAuthMethod}
                  onChange={(e) => handleChange('wpAuthMethod', e.target.value as 'basic_auth' | 'application_password')}
                  className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  data-testid="select-wp-auth-method"
                >
                  <option value="basic_auth">
                    {language === 'ru' ? '🔒 Обычный пароль администратора' : '🔒 Regular Admin Password'}
                  </option>
                  <option value="application_password">
                    {language === 'ru' ? '🔐 Application Password (если поддерживается)' : '🔐 Application Password (if supported)'}
                  </option>
                </select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="wpPassword">
                    {formData.wpAuthMethod === 'basic_auth' 
                      ? (language === 'ru' ? 'Пароль администратора' : 'Admin Password')
                      : (language === 'ru' ? 'Application Password' : 'Application Password')
                    }
                  </Label>
                  {formData.wpAuthMethod === 'application_password' && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-sm">
                        <div className="space-y-2">
                          <p className="font-semibold">
                            {language === 'ru' ? 'Как создать Application Password:' : 'How to create Application Password:'}
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
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
                <div className="relative">
                  <Input
                    id="wpPassword"
                    type={showPassword ? 'text' : 'password'}
                    placeholder={formData.wpAuthMethod === 'basic_auth' ? 'your-password' : 'xxxx xxxx xxxx xxxx'}
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
                {formData.wpAuthMethod === 'application_password' && (
                  <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded p-3 text-xs space-y-2 mt-2">
                    <p className="font-semibold text-blue-900 dark:text-blue-100">
                      {language === 'ru' ? '🔐 Как создать Application Password:' : '🔐 How to create Application Password:'}
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-blue-800 dark:text-blue-200">
                      <li>{language === 'ru' 
                        ? 'Перейдите в админ-панель WordPress'
                        : 'Go to WordPress admin panel'
                      }</li>
                      <li>{language === 'ru' 
                        ? 'Пользователи > Профиль вашего пользователя'
                        : 'Users > Your Profile'
                      }</li>
                      <li>{language === 'ru' 
                        ? 'Найдите "Application Passwords"'
                        : 'Find "Application Passwords"'
                      }</li>
                      <li>{language === 'ru' 
                        ? 'Введите название приложения (например "WP PolyLingo")'
                        : 'Enter app name (e.g., "WP PolyLingo")'
                      }</li>
                      <li>{language === 'ru' 
                        ? 'Нажмите "Generate Application Password"'
                        : 'Click "Generate Application Password"'
                      }</li>
                      <li>{language === 'ru' 
                        ? 'Скопируйте сгенерированный пароль и вставьте в соответствующее поле'
                        : 'Copy the generated password and paste in the corresponding field'
                      }</li>
                    </ol>
                  </div>
                )}
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
              <div className="mt-4 space-y-3">
                <div className="p-4 bg-secondary/50 rounded-lg space-y-3 text-sm">
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

                {/* Builder Requirements Info */}
                {diagnosticData.detectedBuilders.length > 0 && (
                  <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg space-y-2 text-sm">
                    <p className="font-semibold text-blue-900 dark:text-blue-100">
                      {language === 'ru' ? 'ℹ️ Требования к переводу:' : 'ℹ️ Translation Requirements:'}
                    </p>
                    <div className="space-y-2 text-blue-800 dark:text-blue-200 text-xs">
                      {diagnosticData.detectedBuilders.some((b: string) => b.includes('BeBuilder') || b.includes('Muffin')) && (
                        <div className="space-y-2">
                          <div>
                            <p className="font-semibold">BeBuilder (Muffin Builder):</p>
                            <p>{language === 'ru' 
                              ? 'PHP serialization в meta-полях автоматически кодируется/декодируется. Все текстовое содержимое из mfn-page-items будет извлечено и переведено. Структура builder сохраняется при восстановлении.\n\n⚠️ ВАЖНО: Необходимо вставить код в functions.php вашей темы (см. ниже). Без этого система обнаружит BeBuilder, но не сможет получить доступ к содержимому через REST API.'
                              : 'PHP serialization in meta fields is automatically encoded/decoded. All text content from mfn-page-items will be extracted and translated. Builder structure is preserved during restoration.\n\n⚠️ IMPORTANT: You must add the code to your theme\'s functions.php (see below). Without it, the system will detect BeBuilder but won\'t be able to access the content via REST API.'
                            }</p>
                          </div>
                          <Collapsible>
                            <CollapsibleTrigger className="flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100">
                              <ChevronDown className="w-3 h-3" />
                              {language === 'ru' ? 'Показать код для functions.php' : 'Show code for functions.php'}
                            </CollapsibleTrigger>
                            <CollapsibleContent className="mt-2">
                              <div className="bg-blue-900/30 dark:bg-blue-950/50 p-3 rounded text-xs font-mono space-y-2">
                                <div className="flex justify-between items-center mb-2">
                                  <span className="text-blue-700 dark:text-blue-300">
                                    {language === 'ru' ? 'Скопируйте в functions.php вашей темы' : 'Copy to your theme\'s functions.php'}
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6"
                                    onClick={() => {
                                      const code = `<?php
add_action('rest_api_init', function() {
    register_meta('post', 'mfn-page-items', array(
        'type' => 'string',
        'single' => true,
        'show_in_rest' => true,
        'auth_callback' => function() { return true; }
    ));
    register_meta('post', 'mfn-page-options', array(
        'type' => 'string',
        'single' => true,
        'show_in_rest' => true,
        'auth_callback' => function() { return true; }
    ));
    register_meta('page', 'mfn-page-items', array(
        'type' => 'string',
        'single' => true,
        'show_in_rest' => true,
        'auth_callback' => function() { return true; }
    ));
    register_meta('page', 'mfn-page-options', array(
        'type' => 'string',
        'single' => true,
        'show_in_rest' => true,
        'auth_callback' => function() { return true; }
    ));
});`;
                                      navigator.clipboard.writeText(code);
                                      toast({
                                        title: language === 'ru' ? 'Скопировано' : 'Copied',
                                        description: language === 'ru' ? 'Код скопирован в буфер обмена' : 'Code copied to clipboard',
                                      });
                                    }}
                                    data-testid="button-copy-bebuilder-code"
                                  >
                                    <Copy className="w-4 h-4" />
                                  </Button>
                                </div>
                                <pre className="whitespace-pre-wrap break-words text-blue-800 dark:text-blue-200 text-[10px]">{`<?php
add_action('rest_api_init', function() {
    register_meta('post', 'mfn-page-items', array(
        'type'         => 'string',
        'single'       => true,
        'show_in_rest' => true,
    ));
    register_meta('post', 'mfn-page-options', array(
        'type'         => 'string',
        'single'       => true,
        'show_in_rest' => true,
    ));
    register_meta('page', 'mfn-page-items', array(
        'type'         => 'string',
        'single'       => true,
        'show_in_rest' => true,
    ));
    register_meta('page', 'mfn-page-options', array(
        'type'         => 'string',
        'single'       => true,
        'show_in_rest' => true,
    ));
});`}</pre>
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        </div>
                      )}
                      {diagnosticData.detectedBuilders.some((b: string) => b.includes('Gutenberg') || b.includes('WordPress')) && (
                        <div>
                          <p className="font-semibold">Gutenberg (WordPress):</p>
                          <p>{language === 'ru' 
                            ? 'Блоки автоматически парсятся из <!-- wp:block --> комментариев. HTML структура и атрибуты сохраняются. Все текстовое содержимое переводится.'
                            : 'Blocks are automatically parsed from <!-- wp:block --> comments. HTML structure and attributes are preserved. All text content is translated.'
                          }</p>
                        </div>
                      )}
                      {diagnosticData.detectedBuilders.includes('Elementor') && (
                        <div>
                          <p className="font-semibold">Elementor:</p>
                          <p>{language === 'ru' 
                            ? 'JSON метаданные парсятся из _elementor_data. Все текстовые поля (text, title, description, button_text) переводятся автоматически. Дизайн элементов сохраняется.'
                            : 'JSON metadata is parsed from _elementor_data. All text fields (text, title, description, button_text) are translated automatically. Element design is preserved.'
                          }</p>
                        </div>
                      )}
                      {diagnosticData.detectedBuilders.includes('WP Bakery') && (
                        <div>
                          <p className="font-semibold">WP Bakery (Visual Composer):</p>
                          <p>{language === 'ru' 
                            ? 'Shortcodes [vc_*] парсятся автоматически. Атрибуты (title, heading, text) и содержимое извлекаются и переводятся. Структура shortcodes сохраняется.'
                            : 'Shortcodes [vc_*] are automatically parsed. Attributes (title, heading, text) and content are extracted and translated. Shortcode structure is preserved.'
                          }</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
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
              <div className="flex items-center justify-between">
                <Label>{t('target_languages')}</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => syncLanguagesMutation.mutate()}
                  disabled={syncLanguagesMutation.isPending || !formData.wpUrl}
                  data-testid="button-sync-languages"
                >
                  {syncLanguagesMutation.isPending ? (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  ) : null}
                  {language === 'ru' ? 'Получить из Polylang' : 'Get from Polylang'}
                </Button>
              </div>
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
