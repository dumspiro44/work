import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { X } from 'lucide-react';
import FroalaEditor from 'react-froala-wysiwyg';
import 'froala-editor/css/froala_style.min.css';
import 'froala-editor/css/froala_editor.pkgd.min.css';

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
  const [editorContent, setEditorContent] = useState(content);

  if (!open) {
    return null;
  }

  const config = {
    key: 'FROALA_KEY',
    placeholderText: language === 'ru' ? 'Редактируйте контент' : 'Edit content',
    heightMin: 600,
    heightMax: 900,
    toolbarButtons: ['fullscreen', '|', 'html'],
  };

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
                ? 'Все таблицы, ссылки и форматирование сохранены'
                : 'All tables, links and formatting are preserved'}
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

          {/* Content Editor */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              {language === 'ru' ? 'Контент' : 'Content'}
            </label>
            <div className="mt-2 border border-input rounded-md bg-background">
              <FroalaEditor
                tag="textarea"
                config={config}
                model={editorContent}
                onModelChange={setEditorContent}
              />
            </div>
          </div>

          {/* Info Box */}
          <div className="p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md">
            <p className="text-sm text-green-900 dark:text-green-100">
              {language === 'ru'
                ? '✓ Таблицы, ссылки и всё форматирование будут опубликованы корректно в WordPress'
                : '✓ Tables, links and all formatting will be published correctly to WordPress'}
            </p>
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
