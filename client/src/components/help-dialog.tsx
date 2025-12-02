import { HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useLanguage } from '@/contexts/LanguageContext';

export function HelpDialog() {
  const { language } = useLanguage();

  const content = language === 'en' ? {
    title: 'Help & Documentation',
    description: 'Learn how to use WP PolyLingo Auto-Translator',
    sections: [
      {
        title: 'Getting Started',
        content: 'Configure your WordPress connection in Settings, then use Content Management to browse, filter, and translate your posts and pages.',
      },
      {
        title: 'Content Management',
        content: 'Click "Get Content" button to preload all content (~1.5 minutes). After loading, pagination works instantly without delays. You can filter by language, search by title, and view translation status.',
      },
      {
        title: 'Create & Edit Content',
        content: 'Use the WYSIWYG editor to create new content or edit existing translations. Insert images directly - they\'ll be automatically uploaded to WordPress media library. All content translates to all target languages simultaneously.',
      },
      {
        title: 'Synchronous Translation',
        content: 'When you translate content, all target languages are translated at once and published together. Images and formatting are preserved across all language versions.',
      },
      {
        title: 'Gemini API',
        content: 'Set up your Google Gemini API key in Settings to enable AI-powered translations. The system automatically handles rate limiting (15 requests/minute) and quota management.',
      },
      {
        title: 'Languages & Polylang',
        content: 'Install Polylang plugin on WordPress. The system will auto-detect your source and target languages. Configure them in Settings.',
      },
      {
        title: 'SEO Optimization',
        content: 'Set focus keywords for all your content with one click. The system uses post titles and fills them automatically in SEO plugins (Yoast, Rank Math, The SEO Framework).',
      },
      {
        title: 'Translation Jobs',
        content: 'View all translation jobs, monitor progress, and check translation status. Publish completed translations to WordPress directly from this page.',
      },
    ],
  } : {
    title: 'Справка и документация',
    description: 'Узнайте, как использовать WP PolyLingo Auto-Translator',
    sections: [
      {
        title: 'Начало работы',
        content: 'Настройте подключение WordPress в Конфигурации, затем используйте Управление контентом для просмотра, фильтрации и перевода ваших постов и страниц.',
      },
      {
        title: 'Управление контентом',
        content: 'Нажмите кнопку "Получить контент" для предварительной загрузки всего контента (~1.5 минуты). После загрузки пагинация работает мгновенно без задержек. Вы можете фильтровать по языку, искать по названию и просматривать статус перевода.',
      },
      {
        title: 'Создание и редактирование контента',
        content: 'Используйте редактор WYSIWYG для создания нового контента или редактирования существующих переводов. Вставляйте изображения напрямую - они автоматически загрузятся в медиатеку WordPress. Весь контент переводится на все целевые языки одновременно.',
      },
      {
        title: 'Синхронный перевод',
        content: 'Когда вы переводите контент, все целевые языки переводятся одновременно и публикуются вместе. Изображения и форматирование сохраняются во всех языковых версиях.',
      },
      {
        title: 'Gemini API',
        content: 'Установите ключ API Google Gemini в Конфигурации для включения переводов с помощью искусственного интеллекта. Система автоматически управляет ограничением скорости (15 запросов/минуту) и квотой.',
      },
      {
        title: 'Языки и Polylang',
        content: 'Установите плагин Polylang на WordPress. Система автоматически определит ваш исходный и целевые языки. Настройте их в Конфигурации.',
      },
      {
        title: 'SEO Оптимизация',
        content: 'Установите фокусные ключевые слова для всего контента одним кликом. Система использует названия постов и автоматически заполняет их в SEO плагинах (Yoast, Rank Math, The SEO Framework).',
      },
      {
        title: 'Задачи перевода',
        content: 'Просматривайте все задачи перевода, отслеживайте прогресс и проверяйте статус перевода. Публикуйте готовые переводы в WordPress прямо с этой страницы.',
      },
    ],
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          data-testid="button-help"
          title={content.title}
        >
          <HelpCircle className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-96 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{content.title}</DialogTitle>
          <DialogDescription>{content.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {content.sections.map((section) => (
            <div key={section.title}>
              <h3 className="font-semibold text-sm">{section.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{section.content}</p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
