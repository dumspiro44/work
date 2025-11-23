import { createContext, useContext, useState, ReactNode, useEffect } from 'react';

type LanguageCode = 'en' | 'ru';

interface LanguageContextType {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  t: (key: string) => string;
}

const translations: Record<LanguageCode, Record<string, string>> = {
  en: {
    'dashboard': 'Dashboard',
    'posts_management': 'Posts Management',
    'translation_jobs': 'Translation Jobs',
    'configuration': 'Configuration',
    'logout': 'Logout',
    'light_mode': 'Light Mode',
    'dark_mode': 'Dark Mode',
    'loading': 'Loading...',
    'help': 'Help',
    'copyright': 'Copyright © 2024 CZ Holding. All rights reserved.',
    'logged_out': 'Logged out',
    'successfully_logged_out': 'You have been successfully logged out.',
    'welcome_back': 'Welcome back!',
    'successfully_logged_in': 'You have successfully logged in.',
    'admin_panel': 'Admin Panel',
    'enter_credentials': 'Enter your credentials to access the system',
    'username': 'Username',
    'password': 'Password',
    'login': 'Login',
    'logging_in': 'Logging in...',
    'login_failed': 'Login failed',
    'invalid_credentials': 'Invalid credentials',
    'overview': 'Overview of your WordPress translation automation',
    'getting_started': 'Getting Started',
    'configure_wp': '1. Configure WordPress Connection',
    'configure_wp_desc': 'Go to Configuration page and set up your WordPress URL, credentials, and target languages.',
    'select_posts': '2. Select Posts to Translate',
    'select_posts_desc': 'Navigate to Posts Management to view your WordPress posts and select which ones to translate.',
    'monitor_progress': '3. Monitor Translation Progress',
    'monitor_progress_desc': 'Track your translation jobs in real-time on the Translation Jobs page.',
  },
  ru: {
    'dashboard': 'Панель управления',
    'posts_management': 'Управление постами',
    'translation_jobs': 'Задания перевода',
    'configuration': 'Конфигурация',
    'logout': 'Выход',
    'light_mode': 'Светлая тема',
    'dark_mode': 'Темная тема',
    'loading': 'Загрузка...',
    'help': 'Справка',
    'copyright': 'Авторские права © 2024 CZ Holding. Все права защищены.',
    'logged_out': 'Вы вышли',
    'successfully_logged_out': 'Вы успешно вышли из системы.',
    'welcome_back': 'Добро пожаловать!',
    'successfully_logged_in': 'Вы успешно вошли в систему.',
    'admin_panel': 'Панель администратора',
    'enter_credentials': 'Введите ваши учетные данные для доступа к системе',
    'username': 'Имя пользователя',
    'password': 'Пароль',
    'login': 'Войти',
    'logging_in': 'Вход...',
    'login_failed': 'Ошибка входа',
    'invalid_credentials': 'Неверные учетные данные',
    'overview': 'Обзор автоматизации перевода контента WordPress',
    'getting_started': 'Начало работы',
    'configure_wp': '1. Настройте подключение WordPress',
    'configure_wp_desc': 'Перейдите на страницу конфигурации и установите URL WordPress, учетные данные и целевые языки.',
    'select_posts': '2. Выберите посты для перевода',
    'select_posts_desc': 'Перейдите в раздел управления постами, чтобы просмотреть ваши посты WordPress и выбрать те, которые нужно перевести.',
    'monitor_progress': '3. Отслеживайте прогресс перевода',
    'monitor_progress_desc': 'Отслеживайте задания перевода в реальном времени на странице заданий перевода.',
  },
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(() => {
    const stored = localStorage.getItem('wp-polylingo-language') as LanguageCode;
    return stored || 'en';
  });

  useEffect(() => {
    localStorage.setItem('wp-polylingo-language', language);
  }, [language]);

  const t = (key: string): string => {
    return translations[language][key as keyof typeof translations['en']] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage: setLanguageState, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}
