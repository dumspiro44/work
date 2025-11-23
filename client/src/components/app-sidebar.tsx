import { Home, FileText, Briefcase, Settings, LogOut, Sun, Moon } from 'lucide-react';
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
import { useToast } from '@/hooks/use-toast';
import logoLight from '@assets/Logog_1763889964887.png';
import logoDark from '@assets/2f933c51-4358-4b84-9cda-319кукееуе2e63dcb12_1763890424947.png';

const menuItems = [
  { title: 'Dashboard', url: '/dashboard', icon: Home },
  { title: 'Posts Management', url: '/posts', icon: FileText },
  { title: 'Translation Jobs', url: '/jobs', icon: Briefcase },
  { title: 'Configuration', url: '/settings', icon: Settings },
];

export function AppSidebar() {
  const [location, setLocation] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { logout } = useAuth();
  const { toast } = useToast();
  
  const logo = theme === 'dark' ? logoDark : logoLight;

  const handleLogout = async () => {
    await logout();
    setLocation('/login');
    toast({
      title: 'Logged out',
      description: 'You have been successfully logged out.',
    });
  };

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <div className="flex justify-center px-4 py-6">
            <img src={logo} alt="Logo" className="h-12 object-contain" />
          </div>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
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
            {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            className="w-full justify-start"
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
