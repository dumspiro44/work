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
        content: 'Configure your WordPress connection, select posts, and monitor translation progress.',
      },
      {
        title: 'Gemini API',
        content: 'Set up your Google Gemini API key to enable AI-powered translations.',
      },
      {
        title: 'Languages',
        content: 'Select source and target languages for your translations.',
      },
      {
        title: 'Polylang Plugin',
        content: 'Install and enable Polylang on your WordPress site for translation management.',
      },
    ],
  } : {
    title: 'Справка и документация',
    description: 'Узнайте, как использовать WP PolyLingo Auto-Translator',
    sections: [
      {
        title: 'Начало работы',
        content: 'Настройте подключение WordPress, выберите посты и отслеживайте прогресс перевода.',
      },
      {
        title: 'Gemini API',
        content: 'Установите ключ API Google Gemini для включения переводов с помощью искусственного интеллекта.',
      },
      {
        title: 'Языки',
        content: 'Выберите исходный и целевые языки для ваших переводов.',
      },
      {
        title: 'Плагин Polylang',
        content: 'Установите и включите Polylang на вашем сайте WordPress для управления переводами.',
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
