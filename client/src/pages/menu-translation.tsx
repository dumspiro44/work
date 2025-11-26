import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useLanguage } from '@/contexts/LanguageContext';
import { Loader2, Menu, Copy } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface WordPressMenu {
  id: number;
  name: string;
  slug: string;
  count: number;
}

interface MenuItem {
  id: number;
  title: string;
  url: string;
  menu_order: number;
  parent: number;
}

export default function MenuTranslation() {
  const { toast } = useToast();
  const { language } = useLanguage();
  const [selectedMenuId, setSelectedMenuId] = useState<string>('');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('en');

  // Fetch menus
  const { data: menus, isLoading: menusLoading } = useQuery<WordPressMenu[]>({
    queryKey: ['/api/menus'],
    queryFn: () => apiRequest('GET', '/api/menus'),
  });

  // Fetch menu items
  const { data: menuItems, isLoading: itemsLoading } = useQuery<MenuItem[]>({
    queryKey: ['/api/menus', selectedMenuId, 'items'],
    queryFn: () => apiRequest('GET', `/api/menus/${selectedMenuId}/items`),
    enabled: !!selectedMenuId,
  });

  // Translate menu mutation
  const translateMutation = useMutation({
    mutationFn: () =>
      apiRequest('POST', '/api/menus/translate', {
        menuId: parseInt(selectedMenuId),
        targetLanguage: selectedLanguage,
      }),
    onSuccess: (data) => {
      toast({
        title: language === 'ru' ? 'Успешно' : 'Success',
        description: language === 'ru' 
          ? `Меню переведено: ${data.itemsCount} пунктов` 
          : `Menu translated: ${data.itemsCount} items`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/menus'] });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: language === 'ru' ? 'Ошибка' : 'Error',
        description: error.message,
      });
    },
  });

  const languageOptions = [
    { value: 'en', label: 'English' },
    { value: 'cs', label: 'Čeština' },
    { value: 'kk', label: 'Қазақша' },
  ];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">
          {language === 'ru' ? 'Перевод меню' : 'Menu Translation'}
        </h1>
        <p className="text-muted-foreground">
          {language === 'ru' 
            ? 'Автоматически переводите меню WordPress на разные языки и создавайте языковые версии' 
            : 'Automatically translate WordPress menus to different languages and create language versions'}
        </p>
      </div>

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Menu className="w-5 h-5" />
          {language === 'ru' ? 'Выберите меню' : 'Select Menu'}
        </h2>

        {menusLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <Select value={selectedMenuId} onValueChange={setSelectedMenuId}>
            <SelectTrigger>
              <SelectValue placeholder={language === 'ru' ? 'Выберите меню...' : 'Select a menu...'} />
            </SelectTrigger>
            <SelectContent>
              {menus?.map((menu) => (
                <SelectItem key={menu.id} value={menu.id.toString()}>
                  {menu.name} ({menu.count} {language === 'ru' ? 'пункт.' : 'items'})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {selectedMenuId && (
          <>
            <div>
              <Label className="text-sm font-medium">
                {language === 'ru' ? 'Целевой язык' : 'Target Language'}
              </Label>
              <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {languageOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={() => translateMutation.mutate()}
              disabled={translateMutation.isPending}
              className="w-full"
              data-testid="button-translate-menu"
            >
              {translateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {language === 'ru' ? 'Перевести меню' : 'Translate Menu'}
            </Button>
          </>
        )}
      </Card>

      {selectedMenuId && menuItems && (
        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-semibold">
            {language === 'ru' ? 'Пункты меню' : 'Menu Items'} ({menuItems.length})
          </h2>
          <div className="space-y-2">
            {itemsLoading ? (
              <>
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </>
            ) : (
              menuItems?.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-3 border rounded hover-elevate">
                  <div className="flex-1">
                    <p className="font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.url}</p>
                  </div>
                  <Badge variant="outline">
                    {language === 'ru' ? 'Позиция' : 'Order'}: {item.menu_order}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
