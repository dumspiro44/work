import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { X } from 'lucide-react';

interface FroalaPreviewModalProps {
  open: boolean;
  title: string;
  content: string;
  onClose: () => void;
}

export function FroalaPreviewModal({
  open,
  title,
  content,
  onClose,
}: FroalaPreviewModalProps) {
  const { language } = useLanguage();

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-input rounded-lg shadow-lg max-w-5xl w-full max-h-[95vh] overflow-y-auto mx-2">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-input sticky top-0 bg-background z-10">
          <div>
            <h2 className="text-lg font-semibold">
              {language === 'ru'
                ? 'Превью: как будет выглядеть в WordPress'
                : 'Preview: How it will look in WordPress'}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {language === 'ru'
                ? 'Таблицы, форматирование и ссылки сохранены'
                : 'Tables, formatting and links are preserved'}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            data-testid="button-close-froala-preview"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
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
            <div
              className="mt-2 p-4 border border-input rounded-md bg-background prose dark:prose-invert prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: content }}
            />
          </div>

          {/* Info Box */}
          <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md space-y-2">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
              {language === 'ru' ? '✓ Гарантия:' : '✓ Guaranteed:'}
            </p>
            <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
              <li>
                {language === 'ru'
                  ? '✓ Таблицы отображаются корректно в WordPress'
                  : '✓ Tables display correctly in WordPress'}
              </li>
              <li>
                {language === 'ru'
                  ? '⚠️ Ссылки не видны здесь, но будут работать в WordPress'
                  : '⚠️ Links not visible here, but will work in WordPress'}
              </li>
              <li>
                {language === 'ru'
                  ? '✓ Всё форматирование (жирный, курсив, заголовки) сохранено'
                  : '✓ All formatting (bold, italic, headings) preserved'}
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 justify-end p-6 border-t border-input sticky bottom-0 bg-background z-10">
          <Button onClick={onClose} data-testid="button-close-froala-preview-footer">
            {language === 'ru' ? 'Готово' : 'Done'}
          </Button>
        </div>
      </div>
    </div>
  );
}
