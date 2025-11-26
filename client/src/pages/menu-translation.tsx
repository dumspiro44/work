import { useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useLanguage } from '@/contexts/LanguageContext';
import { Loader2, Menu, AlertTriangle, Copy, Check } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface WPMenu {
  term_id: number;
  name: string;
  slug: string;
  count: number;
}

interface WPMenuItem {
  ID: number;
  title: string;
  url: string;
  type_label: string;
  children?: WPMenuItem[];
}

export default function MenuTranslation() {
  const { toast } = useToast();
  const { language } = useLanguage();
  const [selectedMenuId, setSelectedMenuId] = useState<string>('');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('en');
  const [pluginOk, setPluginOk] = useState<boolean>(true);
  const [copied, setCopied] = useState(false);

  // Check plugin on mount
  useEffect(() => {
    apiRequest('GET', '/api/menus/check-plugin')
      .then((result) => {
        if (!result.active) {
          setPluginOk(false);
        }
      })
      .catch(() => setPluginOk(false));
  }, []);

  // Fetch menus
  const { data: menus, isLoading: menusLoading, error: menusError } = useQuery<WPMenu[]>({
    queryKey: ['/api/menus'],
    queryFn: () => apiRequest('GET', '/api/menus'),
    enabled: pluginOk,
  });

  // Fetch menu items
  const { data: menuItems, isLoading: itemsLoading } = useQuery<WPMenuItem[]>({
    queryKey: ['/api/menus', selectedMenuId, 'items'],
    queryFn: () => apiRequest('GET', `/api/menus/${selectedMenuId}/items`),
    enabled: !!selectedMenuId,
  });

  // Translate menu mutation
  const translateMutation = useMutation({
    mutationFn: () => {
      const isAllMenus = selectedMenuId === 'all';
      const isAllLanguages = selectedLanguage === 'all';
      return apiRequest('POST', '/api/menus/translate', {
        menuId: isAllMenus ? 'all' : parseInt(selectedMenuId),
        targetLanguage: isAllLanguages ? 'all' : selectedLanguage,
      });
    },
    onSuccess: (data) => {
      toast({
        title: language === 'ru' ? 'Успешно' : 'Success',
        description: language === 'ru' 
          ? `Переведено: ${data.itemsCount} пунктов` 
          : `Translated: ${data.itemsCount} items`,
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
    { value: 'all', label: language === 'ru' ? 'Все языки' : 'All Languages' },
    { value: 'en', label: 'English' },
    { value: 'cs', label: 'Čeština' },
    { value: 'kk', label: 'Қазақша' },
  ];

  const copyInstallCode = () => {
    const code = 'https://wordpress.org/plugins/wp-rest-menus/';
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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

      {!pluginOk && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-3">
              <p>
                {language === 'ru'
                  ? 'Для работы перевода меню требуется плагин "WP REST Menus" от skapator (Alessandro Tesoro).'
                  : 'The "WP REST Menus" plugin by skapator (Alessandro Tesoro) is required for menu translation.'}
              </p>
              <div className="bg-slate-900 p-3 rounded text-white text-sm space-y-2">
                <p className="font-mono">https://wordpress.org/plugins/wp-rest-menus/</p>
                <Button 
                  size="sm" 
                  variant="default"
                  onClick={copyInstallCode}
                  className="w-full"
                  data-testid="button-copy-plugin-url"
                >
                  {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                  {language === 'ru' ? (copied ? 'Скопировано' : 'Копировать ссылку') : (copied ? 'Copied' : 'Copy Link')}
                </Button>
              </div>
              <p className="text-sm font-medium">
                {language === 'ru' 
                  ? '1. Перейдите в Плагины > Добавить новый'
                  : '1. Go to Plugins > Add New'}
              </p>
              <p className="text-sm">
                {language === 'ru'
                  ? '2. Найдите "WP REST Menus" и установите его'
                  : '2. Find "WP REST Menus" and install it'}
              </p>
              <p className="text-sm">
                {language === 'ru'
                  ? '3. Активируйте плагин'
                  : '3. Activate the plugin'}
              </p>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Card className="p-6 space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Menu className="w-5 h-5" />
          {language === 'ru' ? 'Выберите меню' : 'Select Menu'}
        </h2>

        {menusLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
          </div>
        ) : menus && menus.length > 0 ? (
          <Select value={selectedMenuId} onValueChange={setSelectedMenuId}>
            <SelectTrigger>
              <SelectValue placeholder={language === 'ru' ? 'Выберите меню...' : 'Select a menu...'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {language === 'ru' ? 'Все меню' : 'All Menus'}
              </SelectItem>
              {menus.map((menu) => (
                <SelectItem key={menu.term_id} value={menu.term_id.toString()}>
                  {menu.name} ({menu.count} {language === 'ru' ? 'пункт.' : 'items'})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {language === 'ru'
                ? 'Меню не найдены. Убедитесь что плагин "WP REST API Menus" установлен и активирован.'
                : 'No menus found. Make sure "WP REST API Menus" plugin is installed and activated.'}
            </AlertDescription>
          </Alert>
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
                <div key={item.ID} className="flex items-center justify-between p-3 border rounded hover-elevate">
                  <div className="flex-1 ml-4">
                    <p className="font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.url}</p>
                    {item.children && item.children.length > 0 && (
                      <div className="mt-2 ml-4 space-y-1 border-l pl-3">
                        {item.children.map((child) => (
                          <div key={child.ID} className="text-sm text-muted-foreground">
                            <p className="font-medium">{child.title}</p>
                            <p className="text-xs truncate">{child.url}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <Badge variant="outline">
                    {item.type_label}
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
