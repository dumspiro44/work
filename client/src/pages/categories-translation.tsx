import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Loader2, Globe, CheckCircle } from 'lucide-react';

export default function CategoriesTranslation() {
  const { language, t } = useLanguage();
  const { toast } = useToast();
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [isTranslating, setIsTranslating] = useState(false);

  const { data: categoriesData, isLoading } = useQuery<{ categories: any[], total: number }>({
    queryKey: ['/api/categories'],
  });

  const { data: settings } = useQuery<any>({
    queryKey: ['/api/settings'],
  });

  const translateMutation = useMutation({
    mutationFn: async (categoryId: number) => {
      const res = await apiRequest('POST', '/api/categories/translate', {
        categoryId,
        targetLanguages: settings?.targetLanguages || []
      });
      return await res.json();
    }
  });

  const publishMutation = useMutation({
    mutationFn: async (data: { categoryId: number, translations: any[] }) => {
      const res = await apiRequest('POST', '/api/categories/publish', data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/categories'] });
      toast({ title: language === 'ru' ? 'Успех' : 'Success', description: language === 'ru' ? 'Категории опубликованы' : 'Categories published' });
    }
  });

  const handleTranslateAll = async () => {
    if (selectedCategories.length === 0) return;
    setIsTranslating(true);
    try {
      for (const catId of selectedCategories) {
        const transResult = await translateMutation.mutateAsync(catId);
        await publishMutation.mutateAsync({
          categoryId: catId,
          translations: transResult.translations
        });
      }
      setSelectedCategories([]);
    } catch (error) {
      console.error(error);
    } finally {
      setIsTranslating(false);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedCategories(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  const stripHtml = (html: string) => {
    const tmp = document.createElement("DIV");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
  };

  const getTranslationStatus = (cat: any) => {
    const targetLangs = settings?.targetLanguages || [];
    const translations = cat.translations || {};
    const translatedLangs = Object.keys(translations).filter((lang: string) => lang !== (cat.lang || settings?.sourceLanguage));
    
    if (translatedLangs.length === 0) {
      return (
        <span className="text-muted-foreground">
          {language === 'ru' ? 'Только оригинал' : 'Original only'}
        </span>
      );
    }

    const hasAllTargets = targetLangs.every(lang => !!translations[lang]);

    if (hasAllTargets && targetLangs.length > 0) {
      return (
        <span className="flex items-center text-green-600">
          <CheckCircle className="mr-1 h-4 w-4" />
          {language === 'ru' ? 'Переведено' : 'Translated'}
        </span>
      );
    }

    return (
      <span className="flex items-center text-amber-600">
        <Globe className="mr-1 h-4 w-4" />
        {language === 'ru' 
          ? `Частично (${translatedLangs.join(', ')})` 
          : `Partial (${translatedLangs.join(', ')})`}
      </span>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">
          {language === 'ru' ? 'Перевод рубрик' : 'Category Translation'}
        </h1>
        <Button 
          onClick={handleTranslateAll} 
          disabled={selectedCategories.length === 0 || isTranslating}
        >
          {isTranslating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Globe className="mr-2 h-4 w-4" />}
          {language === 'ru' ? 'Перевести выбранные' : 'Translate Selected'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{language === 'ru' ? 'Список рубрик' : 'Category List'}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox 
                    checked={selectedCategories.length === (categoriesData?.categories.length || 0)}
                    onCheckedChange={(checked) => {
                      if (checked) setSelectedCategories(categoriesData?.categories.map(c => c.id) || []);
                      else setSelectedCategories([]);
                    }}
                  />
                </TableHead>
                <TableHead>{language === 'ru' ? 'Название' : 'Name'}</TableHead>
                <TableHead>{language === 'ru' ? 'Описание' : 'Description'}</TableHead>
                <TableHead>{language === 'ru' ? 'Статус Polylang' : 'Polylang Status'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categoriesData?.categories.map((cat) => (
                <TableRow key={cat.id}>
                  <TableCell>
                    <Checkbox 
                      checked={selectedCategories.includes(cat.id)}
                      onCheckedChange={() => toggleSelect(cat.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{cat.name}</TableCell>
                  <TableCell className="max-w-md truncate">
                    {cat.description ? stripHtml(typeof cat.description === 'object' ? cat.description.rendered : cat.description) : '-'}
                  </TableCell>
                  <TableCell>
                    {getTranslationStatus(cat)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
