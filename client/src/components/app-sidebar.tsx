import { Home, FileText, Briefcase, Settings, LogOut, Sun, Moon, Globe, Palette, Search, AlertCircle, Plus, Wrench, Archive } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import type { Settings as SettingsType } from '@shared/schema';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import logoLight from '@assets/Logog_1763889964887.png';
import logoDark from '@assets/2f933c51-4358-4b84-9cda-319кукееуе2e63dcb12_1763890424947.png';

const menuItemsEn = [
  { title: 'Configuration', url: '/configuration', icon: Settings },
  { title: 'Dashboard', url: '/dashboard', icon: Home },
  { title: 'Content Management', url: '/posts', icon: FileText },
  { title: 'Create Content', url: '/create', icon: Plus },
  { title: 'Translation Jobs', url: '/jobs', icon: Briefcase },
  { title: 'Menu Translation', url: '/menus', icon: FileText },
  { title: 'Interface Translation', url: '/interface', icon: Palette },
  { title: 'SEO Optimization', url: '/seo', icon: Search },
  { title: 'Content Correction', url: '/content-correction', icon: Wrench },
  { title: 'Content Archive', url: '/archive', icon: Archive },
];

const menuItemsRu = [
  { title: 'Конфигурация', url: '/configuration', icon: Settings },
  { title: 'Панель управления', url: '/dashboard', icon: Home },
  { title: 'Управление контентом', url: '/posts', icon: FileText },
  { title: 'Создать контент', url: '/create', icon: Plus },
  { title: 'Задания перевода', url: '/jobs', icon: Briefcase },
  { title: 'Перевод меню', url: '/menus', icon: FileText },
  { title: 'Перевод интерфейса', url: '/interface', icon: Palette },
  { title: 'SEO Оптимизация', url: '/seo', icon: Search },
  { title: 'Коррекция контента', url: '/content-correction', icon: Wrench },
  { title: 'Архивирование контента', url: '/archive', icon: Archive },
];

export function AppSidebar() {
  const [location, setLocation] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { logout } = useAuth();
  const { language, setLanguage } = useLanguage();
  const { toast } = useToast();
  
  const { data: settings } = useQuery<SettingsType>({
    queryKey: ['/api/settings'],
    staleTime: 1000,
    refetchInterval: 3000,
  });

  // Check real WordPress connection status (not just if URL exists)
  const { data: wpCheckData } = useQuery<{ connected: boolean }>({
    queryKey: ['/api/wordpress-check'],
    staleTime: 500,
    refetchInterval: 5000, // Check every 5 seconds
  });

  const hasWordPressConnection = wpCheckData?.connected ?? false;
  
  const logo = theme === 'dark' ? logoDark : logoLight;
  const menuItems = language === 'ru' ? menuItemsRu : menuItemsEn;
  
  // Filter menu items - disable all except Configuration if no WordPress connection
  const filteredMenuItems = menuItems.map(item => {
    const isConfigurationItem = (language === 'ru' ? item.title === 'Конфигурация' : item.title === 'Configuration');
    const isDisabled = !hasWordPressConnection && !isConfigurationItem;
    return { ...item, disabled: isDisabled };
  });

  const handleLogout = async () => {
    await logout();
    setLocation('/login');
    toast({
      title: language === 'ru' ? 'Вы вышли' : 'Logged out',
      description: language === 'ru' ? 'Вы успешно вышли из системы.' : 'You have been successfully logged out.',
    });
  };

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          {!hasWordPressConnection && (
            <Alert variant="destructive" className="mx-2 mb-4" data-testid="alert-no-connection">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {language === 'ru' 
                  ? 'Зайдите в конфигурацию и настройте подключение к сайту WordPress и к агенту перевода'
                  : 'Go to configuration and set up the connection to the WordPress site and translation agent'}
              </AlertDescription>
            </Alert>
          )}
          <div className="flex justify-center px-4 py-6">
            <a href="https://czholding.com.ua/" target="_blank" rel="noopener noreferrer" data-testid="link-cz-holding-logo">
              <img src={logo} alt="CZ Holding Logo" className="h-24 object-contain hover-elevate" />
            </a>
          </div>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild 
                    isActive={location === item.url} 
                    data-testid={`link-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                    disabled={item.disabled}
                    className={item.disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
                  >
                    <Link href={item.disabled ? '#' : item.url}>
                      <item.icon className="w-5 h-5" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="p-4 space-y-2">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleTheme}
            className="w-full justify-start"
            data-testid="button-theme-toggle"
          >
            {theme === 'light' ? <Moon className="w-4 h-4 mr-2" /> : <Sun className="w-4 h-4 mr-2" />}
            {theme === 'light' ? (language === 'ru' ? 'Темная тема' : 'Dark Mode') : (language === 'ru' ? 'Светлая тема' : 'Light Mode')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLanguage(language === 'en' ? 'ru' : 'en')}
            className="w-full justify-start"
            data-testid="button-language-toggle"
          >
            <Globe className="w-4 h-4 mr-2" />
            {language === 'en' ? 'Русский' : 'English'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            className="w-full justify-start"
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4 mr-2" />
            {language === 'ru' ? 'Выход' : 'Logout'}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
