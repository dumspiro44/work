import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Loader2, AlertCircle } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { AVAILABLE_LANGUAGES } from '@/types';
import type { Settings } from '@shared/schema';

interface InterfaceString {
  id: string;
  key: string;
  value: string;
  context: string;
}

interface InterfaceTranslation {
  stringId: string;
  language: string;
  translation: string;
}

export default function InterfaceTranslation() {
  const { language, t } = useLanguage();
  const { toast } = useToast();
  const [translationProgress, setTranslationProgress] = useState<number>(0);
  const [translationStartTime, setTranslationStartTime] = useState<number>(0);
  const [remainingTime, setRemainingTime] = useState<string | null>(null);

  const { data: settings } = useQuery<Settings>({
    queryKey: ['/api/settings'],
  });

  const { data: strings, isLoading: stringsLoading } = useQuery<InterfaceString[]>({
    queryKey: ['/api/interface-strings'],
  });

  const { data: translations, isLoading: translationsLoading } = useQuery<InterfaceTranslation[]>({
    queryKey: ['/api/interface-translations'],
    refetchInterval: 1000, // Auto-refresh every 1 second during translation
  });

  const targetLanguages: string[] = (settings?.targetLanguages as string[]) || [];
  const sourceLanguage = (settings?.sourceLanguage as string) || 'en';

  const saveMutation = useMutation({
    mutationFn: (data: { translations: InterfaceTranslation[] }) =>
      apiRequest('POST', '/api/interface-translations', data),
    onSuccess: () => {
      toast({
        title: language === 'ru' ? 'Переводы сохранены' : 'Translations Saved',
        description:
          language === 'ru'
            ? 'Переводы интерфейса успешно сохранены'
            : 'Interface translations have been saved successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/interface-translations'] });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: language === 'ru' ? 'Ошибка' : 'Error',
        description: error.message,
      });
    },
  });

  const translateMutation = useMutation({
    mutationFn: (targetLangs: string[]) =>
      apiRequest('POST', '/api/translate-interface', { targetLanguages: targetLangs }),
    onSuccess: () => {
      setTranslationStartTime(Date.now());
      setTranslationProgress(0);
      toast({
        title: language === 'ru' ? 'Перевод запущен' : 'Translation Started',
        description:
          language === 'ru'
            ? 'Интерфейсные строки переводятся...'
            : 'Interface strings are being translated...',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/interface-translations'] });
    },
    onError: (error: Error) => {
      setTranslationProgress(0);
      setTranslationStartTime(0);
      toast({
        variant: 'destructive',
        title: language === 'ru' ? 'Ошибка перевода' : 'Translation Error',
        description: error.message,
      });
    },
  });

  // Track translation progress
  useEffect(() => {
    if (translationStartTime === 0) {
      setTranslationProgress(0);
      setRemainingTime(null);
      return;
    }

    if (!strings || strings.length === 0) return;

    const interval = setInterval(() => {
      // Calculate progress based on how many strings are translated
      const totalStrings = strings.length * targetLanguages.length;
      const translatedCount = (translations || []).filter(
        t => targetLanguages.includes(t.language)
      ).length;
      
      const progress = totalStrings > 0 ? Math.min((translatedCount / totalStrings) * 100, 100) : 0;
      setTranslationProgress(progress);

      // Estimate remaining time
      if (progress > 0 && progress < 100) {
        const elapsedMs = Date.now() - translationStartTime;
        const estimatedTotalMs = (elapsedMs / progress) * 100;
        const remainingMs = estimatedTotalMs - elapsedMs;
        const seconds = Math.ceil(remainingMs / 1000);
        
        if (seconds > 0) {
          if (language === 'ru') {
            setRemainingTime(`~${seconds}с`);
          } else {
            setRemainingTime(`~${seconds}s`);
          }
        }
      }

      // Clear when done
      if (progress === 100) {
        setTimeout(() => {
          setTranslationProgress(0);
          setTranslationStartTime(0);
          setRemainingTime(null);
        }, 2000);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [translationStartTime, strings, targetLanguages, translations, language]);

  const publishMutation = useMutation({
    mutationFn: (targetLang: string) =>
      apiRequest('POST', '/api/publish-interface', { targetLanguage: targetLang }),
    onSuccess: () => {
      toast({
        title: language === 'ru' ? 'Опубликовано' : 'Published',
        description:
          language === 'ru'
            ? 'Переводы успешно добавлены в Polylang'
            : 'Translations have been successfully added to Polylang',
      });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: language === 'ru' ? 'Ошибка публикации' : 'Publish Error',
        description: error.message,
      });
    },
  });

  const handleSaveTranslations = (updatedTranslations: InterfaceTranslation[]) => {
    saveMutation.mutate({ translations: updatedTranslations });
  };

  const handleTranslateAll = () => {
    if (targetLanguages.length === 0) {
      toast({
        variant: 'destructive',
        title: language === 'ru' ? 'Ошибка' : 'Error',
        description:
          language === 'ru'
            ? 'Выберите целевые языки в конфигурации'
            : 'Please select target languages in configuration',
      });
      return;
    }
    translateMutation.mutate(targetLanguages);
  };

  if (!strings || !translations) {
    return (
      <div className="p-6 md:p-8 space-y-6">
        <h1 className="text-3xl font-bold">{language === 'ru' ? 'Перевод интерфейса' : 'Interface Translation'}</h1>
        <Card>
          <CardContent className="pt-6">
            <Skeleton className="h-96 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold">
            {language === 'ru' ? 'Перевод интерфейса' : 'Interface Translation'}
          </h1>
          <p className="text-muted-foreground mt-2">
            {language === 'ru'
              ? 'Переводите элементы интерфейса WordPress (меню, виджеты, фильтры) на разные языки'
              : 'Translate WordPress interface elements (menus, widgets, filters) into different languages'}
          </p>
        </div>
      </div>

      {/* Info Alert */}
      {targetLanguages.length === 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {language === 'ru'
              ? 'Пожалуйста, выберите целевые языки в конфигурации'
              : 'Please select target languages in configuration'}
          </AlertDescription>
        </Alert>
      )}

      {/* Translate Button */}
      <Button
        onClick={handleTranslateAll}
        disabled={targetLanguages.length === 0 || translateMutation.isPending}
        className="w-full"
        data-testid="button-translate-all-interface"
      >
        {translateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {language === 'ru'
          ? `Перевести интерфейс на все языки (${targetLanguages.length})`
          : `Translate Interface to All Languages (${targetLanguages.length})`}
      </Button>

      {/* Translation Progress */}
      {translationProgress > 0 && translationProgress < 100 && (
        <Card className="border-2 border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-950">
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
                  <p className="font-medium text-blue-900 dark:text-blue-100">
                    {language === 'ru' ? 'Перевод в процессе...' : 'Translation in progress...'}
                  </p>
                </div>
                {remainingTime && (
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    {remainingTime}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Progress value={translationProgress} className="h-2" data-testid="progress-interface-translation" />
                <p className="text-xs text-blue-700 dark:text-blue-300 text-center">
                  {Math.round(translationProgress)}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Translation Complete */}
      {translationProgress === 100 && (
        <Card className="border-2 border-green-300 dark:border-green-600 bg-green-50 dark:bg-green-950">
          <CardContent className="pt-6">
            <p className="text-green-900 dark:text-green-100 font-medium">
              {language === 'ru' ? '✓ Переводы готовы к редактированию и публикации' : '✓ Translations ready for editing and publishing'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Translations Accordion */}
      <Card data-testid="card-interface-accordion">
        <CardHeader>
          <CardTitle>{language === 'ru' ? 'Переводы' : 'Translations'}</CardTitle>
          <CardDescription>
            {language === 'ru'
              ? 'Кликните на язык чтобы редактировать и опубликовать переводы'
              : 'Click on a language to edit and publish translations'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {targetLanguages.map((targetLang) => {
              const langName = AVAILABLE_LANGUAGES.find((l) => l.code === targetLang)?.name || targetLang;
              const langTranslations = translations.filter((t) => t.language === targetLang);
              const translationCount = langTranslations.length;

              return (
                <AccordionItem
                  key={targetLang}
                  value={targetLang}
                  data-testid={`accordion-interface-${targetLang}`}
                >
                  <div className="flex items-center justify-between pr-4">
                    <AccordionTrigger className="flex-1 hover:no-underline">
                      <div className="flex items-center gap-3 text-left">
                        <div>
                          <p className="font-medium">{langName}</p>
                          <p className="text-xs text-muted-foreground">
                            {translationCount > 0
                              ? language === 'ru'
                                ? `${translationCount} переводов`
                                : `${translationCount} translations`
                              : language === 'ru'
                                ? 'Нет переводов'
                                : 'No translations'}
                          </p>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        publishMutation.mutate(targetLang);
                      }}
                      disabled={publishMutation.isPending || translationCount === 0}
                      data-testid={`button-publish-interface-${targetLang}`}
                    >
                      {publishMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {language === 'ru' ? 'Опубликовать' : 'Publish'}
                    </Button>
                  </div>
                  <AccordionContent className="pt-4">
                    <InterfaceStringsList
                      strings={strings}
                      targetLanguage={targetLang}
                      sourceLanguage={sourceLanguage}
                      translations={translations}
                      onSave={handleSaveTranslations}
                      isSaving={saveMutation.isPending}
                      language={language}
                    />
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}

function InterfaceStringsList({
  strings,
  targetLanguage,
  sourceLanguage,
  translations,
  onSave,
  isSaving,
  language,
}: {
  strings: InterfaceString[];
  targetLanguage: string;
  sourceLanguage: string;
  translations: InterfaceTranslation[];
  onSave: (translations: InterfaceTranslation[]) => void;
  isSaving: boolean;
  language: 'en' | 'ru';
}) {
  const [editedTranslations, setEditedTranslations] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    // Initialize with existing translations
    const initialTranslations: Record<string, string> = {};
    translations.forEach((t) => {
      if (t.language === targetLanguage) {
        initialTranslations[t.stringId] = t.translation;
      }
    });
    setEditedTranslations(initialTranslations);
  }, [targetLanguage, translations]);

  const handleTranslationChange = (stringId: string, value: string): void => {
    setEditedTranslations((prev) => ({
      ...prev,
      [stringId]: value,
    }));
  };

  const handleSave = (): void => {
    const translationsToSave: InterfaceTranslation[] = strings.map((str) => ({
      stringId: str.id,
      language: targetLanguage,
      translation: editedTranslations[str.id] || '',
    }));
    onSave(translationsToSave);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {strings.map((str) => (
          <div key={str.id} className="grid gap-2 p-3 border rounded-md" data-testid={`interface-string-${str.id}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <Label className="text-sm font-medium">{str.key}</Label>
                <p className="text-xs text-muted-foreground mt-1">{str.context}</p>
                <p className="text-sm text-foreground mt-2 p-2 bg-secondary rounded">{str.value}</p>
              </div>
            </div>
            <Input
              placeholder={language === 'ru' ? 'Введите перевод...' : 'Enter translation...'}
              value={editedTranslations[str.id] || ''}
              onChange={(e) => handleTranslationChange(str.id, e.target.value)}
              className="text-sm"
              data-testid={`input-translation-${targetLanguage}-${str.id}`}
            />
          </div>
        ))}
      </div>

      <Button
        onClick={handleSave}
        disabled={isSaving || strings.length === 0}
        className="w-full"
        data-testid={`button-save-translations-${targetLanguage}`}
      >
        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {language === 'ru' ? 'Сохранить переводы' : 'Save Translations'}
      </Button>
    </div>
  );
}
