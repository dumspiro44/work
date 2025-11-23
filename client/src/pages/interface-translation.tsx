import React from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
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

  const { data: settings } = useQuery<Settings>({
    queryKey: ['/api/settings'],
  });

  const { data: strings, isLoading: stringsLoading } = useQuery<InterfaceString[]>({
    queryKey: ['/api/interface-strings'],
  });

  const { data: translations, isLoading: translationsLoading } = useQuery<InterfaceTranslation[]>({
    queryKey: ['/api/interface-translations'],
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

  const handleSaveTranslations = (updatedTranslations: InterfaceTranslation[]) => {
    saveMutation.mutate({ translations: updatedTranslations });
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

      {/* Translations Grid */}
      <div className="grid gap-6">
        {targetLanguages.map((targetLang) => {
          const langName = AVAILABLE_LANGUAGES.find((l) => l.code === targetLang)?.name || targetLang;

          return (
            <Card key={targetLang} className="border-border/50" data-testid={`card-interface-${targetLang}`}>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">{langName}</CardTitle>
                <CardDescription>
                  {language === 'ru' ? 'Переводы интерфейса на' : 'Interface translations for'} {langName}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <InterfaceStringsList
                  strings={strings}
                  targetLanguage={targetLang}
                  sourceLanguage={sourceLanguage}
                  translations={translations}
                  onSave={handleSaveTranslations}
                  isSaving={saveMutation.isPending}
                  language={language}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>
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
