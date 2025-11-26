import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Loader2, Check, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiRequest } from '@/lib/queryClient';

interface TranslatedItem {
  ID: number;
  originalTitle: string;
  translatedTitle: string;
  url: string;
}

interface MenuTranslationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isTranslating: boolean;
  progress: number;
  items: TranslatedItem[];
  isPending: boolean;
  onPublish: () => void;
}

export function MenuTranslationModal({
  open,
  onOpenChange,
  isTranslating,
  progress,
  items,
  isPending,
  onPublish,
}: MenuTranslationModalProps) {
  const { language } = useLanguage();
  const { toast } = useToast();
  const [editedItems, setEditedItems] = useState<Map<number, string>>(new Map());

  useEffect(() => {
    if (items.length > 0) {
      const initial = new Map<number, string>();
      items.forEach((item) => {
        initial.set(item.ID, item.translatedTitle);
      });
      setEditedItems(initial);
    }
  }, [items]);

  const handleEdit = (itemId: number, newTitle: string) => {
    setEditedItems((prev) => new Map(prev).set(itemId, newTitle));
  };

  const getPublishData = () => {
    return items.map((item) => ({
      ...item,
      translatedTitle: editedItems.get(item.ID) || item.translatedTitle,
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {language === 'ru' ? 'Перевод меню' : 'Menu Translation'}
          </DialogTitle>
        </DialogHeader>

        {isTranslating ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {language === 'ru' ? 'Переводим пункты меню...' : 'Translating menu items...'}
            </p>
            <Progress value={progress} className="w-full" />
            <p className="text-center text-sm font-medium">
              {progress}% ({Math.floor((progress / 100) * items.length)} / {items.length})
            </p>
          </div>
        ) : items.length > 0 ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-600" />
              <p className="text-sm font-medium">
                {language === 'ru' ? 'Переводы готовы' : 'Translations ready'}
              </p>
            </div>

            <div className="space-y-2 max-h-[40vh] overflow-y-auto">
              {items.map((item) => (
                <Card key={item.ID} className="p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {language === 'ru' ? 'Оригинал' : 'Original'}
                  </p>
                  <p className="text-sm font-medium">{item.originalTitle}</p>

                  <p className="text-xs text-muted-foreground mt-3">
                    {language === 'ru' ? 'Перевод (можно редактировать)' : 'Translation (editable)'}
                  </p>
                  <Input
                    value={editedItems.get(item.ID) || item.translatedTitle}
                    onChange={(e) => handleEdit(item.ID, e.target.value)}
                    placeholder={language === 'ru' ? 'Введите перевод...' : 'Enter translation...'}
                    className="text-sm"
                    data-testid={`input-translation-${item.ID}`}
                  />
                </Card>
              ))}
            </div>

            <div className="flex gap-2 mt-4">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
                className="flex-1"
                data-testid="button-close-modal"
              >
                {language === 'ru' ? 'Закрыть' : 'Close'}
              </Button>
              <Button
                onClick={onPublish}
                disabled={isPending}
                className="flex-1"
                data-testid="button-publish-menu"
              >
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {language === 'ru' ? 'Опубликовать в WordPress' : 'Publish to WordPress'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertTriangle className="h-5 w-5" />
            <p className="text-sm">
              {language === 'ru' ? 'Нет результатов перевода' : 'No translation results'}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
