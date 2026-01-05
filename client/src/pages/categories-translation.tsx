import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Loader2, Globe, CheckCircle, Pencil, Save, X } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

export default function CategoriesTranslation() {
  const { language, t } = useLanguage();
  const { toast } = useToast();
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [isTranslating, setIsTranslating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [descriptionOverrides, setDescriptionOverrides] = useState<Record<number, string>>({});
  const [tempDescription, setTempDescription] = useState('');

  // Load overrides from session storage on mount
  useEffect(() => {
    const saved = sessionStorage.getItem('wp_category_description_overrides');
    if (saved) {
      try {
        setDescriptionOverrides(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load category overrides', e);
      }
    }
  }, []);

  // Save overrides to session storage
  const saveOverrides = (overrides: Record<number, string>) => {
    setDescriptionOverrides(overrides);
    sessionStorage.setItem('wp_category_description_overrides', JSON.stringify(overrides));
  };

  const { data: categoriesData, isLoading } = useQuery<{ categories: any[], total: number }>({
    queryKey: ['/api/categories'],
  });

  const { data: settings } = useQuery<any>({
    queryKey: ['/api/settings'],
  });

  const translateMutation = useMutation({
    mutationFn: async ({ categoryId, description }: { categoryId: number, description?: string }) => {
      const res = await apiRequest('POST', '/api/categories/translate', {
        categoryId,
        descriptionOverride: description,
        targetLanguages: settings?.targetLanguages || []
      });
      return await res.json();
    }
  });

  const publishMutation = useMutation({
    mutationFn: async (data: { categoryId: number, translations: any[], sourceDescription?: string }) => {
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
        const transResult = await translateMutation.mutateAsync({
          categoryId: catId,
          description: descriptionOverrides[catId]
        });
        await publishMutation.mutateAsync({
          categoryId: catId,
          translations: transResult.translations,
          sourceDescription: descriptionOverrides[catId]
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
    if (!html) return "";
    const tmp = document.createElement("DIV");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
  };

  const startEditing = (cat: any) => {
    setEditingId(cat.id);
    setTempDescription(descriptionOverrides[cat.id] || stripHtml(typeof cat.description === 'object' ? cat.description.rendered : cat.description || ''));
  };

  const cancelEditing = () => {
    setEditingId(null);
    setTempDescription('');
  };

  const saveEdit = () => {
    if (editingId) {
      saveOverrides({ ...descriptionOverrides, [editingId]: tempDescription });
      setEditingId(null);
      setTempDescription('');
    }
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

    const hasAllTargets = targetLangs.every((lang: string) => !!translations[lang]);

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
                  <TableCell className="max-w-md">
                    {editingId === cat.id ? (
                      <div className="flex flex-col gap-2">
                        <Textarea 
                          value={tempDescription} 
                          onChange={(e) => setTempDescription(e.target.value)}
                          className="min-h-[100px]"
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={saveEdit}>
                            <Save className="h-4 w-4 mr-1" />
                            {language === 'ru' ? 'Сохранить' : 'Save'}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={cancelEditing}>
                            <X className="h-4 w-4 mr-1" />
                            {language === 'ru' ? 'Отмена' : 'Cancel'}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="group flex items-start gap-2">
                        <span className="truncate">
                          {descriptionOverrides[cat.id] 
                            ? descriptionOverrides[cat.id] 
                            : (cat.description ? stripHtml(typeof cat.description === 'object' ? cat.description.rendered : cat.description) : '-')}
                        </span>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => startEditing(cat)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
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
