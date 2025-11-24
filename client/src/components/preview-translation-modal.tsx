import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { X } from 'lucide-react';

interface PreviewTranslationModalProps {
  open: boolean;
  title: string;
  content: string;
  onClose: () => void;
}

export function PreviewTranslationModal({
  open,
  title,
  content,
  onClose,
}: PreviewTranslationModalProps) {
  const { language } = useLanguage();
  const [showRaw, setShowRaw] = useState(false);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-input rounded-lg shadow-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-input sticky top-0 bg-background z-10">
          <h2 className="text-lg font-semibold">
            {language === 'ru'
              ? 'Превью: как будет выглядеть в WordPress'
              : 'Preview: How it will look in WordPress'}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            data-testid="button-close-preview"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Info Box */}
          <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md">
            <p className="text-sm text-blue-900 dark:text-blue-100">
              {language === 'ru'
                ? '✓ Все таблицы, ссылки и форматирование сохранены и будут корректно отображены в WordPress'
                : '✓ All tables, links and formatting are preserved and will display correctly in WordPress'}
            </p>
          </div>

          {/* Title */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              {language === 'ru' ? 'Заголовок' : 'Title'}
            </label>
            <h1 className="text-2xl font-bold mt-2">{title}</h1>
          </div>

          {/* Content Preview */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              {language === 'ru' ? 'Контент' : 'Content'}
            </label>
            {showRaw ? (
              <pre className="mt-2 p-4 bg-muted rounded-md overflow-x-auto text-xs">
                <code>{content}</code>
              </pre>
            ) : (
              <div
                className="mt-2 p-4 border border-input rounded-md prose dark:prose-invert prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: content }}
              />
            )}
          </div>

          {/* Notes */}
          <div className="p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md space-y-2">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
              {language === 'ru' ? 'ℹ️ Примечания:' : 'ℹ️ Notes:'}
            </p>
            <ul className="text-sm text-amber-800 dark:text-amber-200 space-y-1 list-disc list-inside">
              <li>
                {language === 'ru'
                  ? 'Таблицы отображаются как HTML'
                  : 'Tables are rendered as HTML'}
              </li>
              <li>
                {language === 'ru'
                  ? 'Все ссылки сохранены и функциональны'
                  : 'All links are preserved and functional'}
              </li>
              <li>
                {language === 'ru'
                  ? 'Форматирование (жирный, курсив, заголовки) работает'
                  : 'Formatting (bold, italic, headings) works'}
              </li>
              <li>
                {language === 'ru'
                  ? 'Изображения отображаются в оригинальном размере'
                  : 'Images are displayed at original size'}
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 justify-end p-6 border-t border-input sticky bottom-0 bg-background z-10">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowRaw(!showRaw)}
            data-testid="button-toggle-raw-html"
          >
            {showRaw
              ? language === 'ru'
                ? 'Просмотр'
                : 'Preview'
              : language === 'ru'
                ? 'HTML'
                : 'HTML'}
          </Button>
          <Button onClick={onClose} data-testid="button-close-preview-footer">
            {language === 'ru' ? 'Готово' : 'Done'}
          </Button>
        </div>
      </div>
    </div>
  );
}
