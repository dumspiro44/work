import { Home, FileText, Briefcase, Settings, LogOut, Sun, Moon, Globe } from 'lucide-react';
import { Link, useLocation } from 'wouter';
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
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import logoLight from '@assets/Logog_1763889964887.png';
import logoDark from '@assets/2f933c51-4358-4b84-9cda-319кукееуе2e63dcb12_1763890424947.png';

const menuItemsEn = [
  { title: 'Dashboard', url: '/dashboard', icon: Home },
  { title: 'Posts Management', url: '/posts', icon: FileText },
  { title: 'Translation Jobs', url: '/jobs', icon: Briefcase },
  { title: 'Configuration', url: '/configuration', icon: Settings },
];

const menuItemsRu = [
  { title: 'Панель управления', url: '/dashboard', icon: Home },
  { title: 'Управление постами', url: '/posts', icon: FileText },
  { title: 'Задания перевода', url: '/jobs', icon: Briefcase },
  { title: 'Конфигурация', url: '/configuration', icon: Settings },
];

export function AppSidebar() {
  const [location, setLocation] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { logout } = useAuth();
  const { language, setLanguage } = useLanguage();
  const { toast } = useToast();
  
  const logo = theme === 'dark' ? logoDark : logoLight;
  const menuItems = language === 'ru' ? menuItemsRu : menuItemsEn;

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
          <div className="flex justify-center px-4 py-6">
            <a href="https://czholding.com.ua/" target="_blank" rel="noopener noreferrer" data-testid="link-cz-holding-logo">
              <img src={logo} alt="CZ Holding Logo" className="h-24 object-contain hover-elevate" />
            </a>
          </div>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url} data-testid={`link-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                    <Link href={item.url}>
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
