import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useLanguage } from '@/contexts/LanguageContext';
import { Loader2 } from 'lucide-react';

// Helper function to decode HTML entities (convert &lt; to <, &gt; to >, etc)
const decodeHtmlEntities = (html: string): string => {
  // Use textarea to properly decode HTML entities
  const textarea = document.createElement('textarea');
  textarea.innerHTML = html;
  const decoded = textarea.value;
  
  // Double-decode in case of double-encoding
  if (decoded.includes('&lt;') || decoded.includes('&gt;')) {
    textarea.innerHTML = decoded;
    return textarea.value;
  }
  
  return decoded;
};
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface EditTranslationModalProps {
  open: boolean;
  jobId: string | null;
  onClose: () => void;
}

interface JobDetails {
  job: {
    id: string;
    postId: number;
    postTitle: string;
    targetLanguage: string;
    translatedTitle: string | null;
    translatedContent: string | null;
  };
  sourcePost: {
    title: string;
    content: string;
  };
}

export function EditTranslationModal({ open, jobId, onClose }: EditTranslationModalProps) {
  const { toast } = useToast();
  const { language } = useLanguage();
  const [editedTitle, setEditedTitle] = useState('');
  const [editedContent, setEditedContent] = useState('');

  // Fetch job details
  const { data: details, isLoading } = useQuery<JobDetails>({
    queryKey: ['/api/jobs', jobId],
    queryFn: () => jobId ? apiRequest('GET', `/api/jobs/${jobId}`) : Promise.reject('No job'),
    enabled: open && !!jobId,
  });

  // Fetch settings to get WordPress base URL
  const { data: settings } = useQuery({
    queryKey: ['/api/settings'],
    queryFn: () => apiRequest('GET', '/api/settings'),
    enabled: open,
  });

  // Helper function to ensure image URLs are absolute (for proper display in editor)
  const ensureAbsoluteImageUrls = (html: string, baseUrl: string): string => {
    return html.replace(/<img([^>]*)\ssrc="([^"]*)"([^>]*)>/g, (match, before, src, after) => {
      if (src.startsWith('http://') || src.startsWith('https://')) return match;
      const base = baseUrl.replace(/\/$/, '');
      const absoluteUrl = src.startsWith('/') ? `${base}${src}` : `${base}/${src}`;
      return `<img${before} src="${absoluteUrl}"${after}>`;
    });
  };

  // Update edited values when details load
  useEffect(() => {
    if (details && settings?.wpUrl) {
      setEditedTitle(details.job.translatedTitle || '');
      let content = details.job.translatedContent || '';
      
      // Decode HTML entities (WordPress returns &lt; &gt; instead of < >)
      content = decodeHtmlEntities(content);
      
      // Ensure all image URLs are absolute for proper display in editor
      content = ensureAbsoluteImageUrls(content, settings.wpUrl);
      
      setEditedContent(content);
    }
  }, [details, settings]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest('PATCH', `/api/jobs/${jobId}`, {
        translatedTitle: editedTitle,
        translatedContent: editedContent,
      }),
    onSuccess: () => {
      toast({
        title: language === 'ru' ? 'Сохранено' : 'Saved',
        description: language === 'ru' ? 'Переводы сохранены' : 'Translations saved',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/jobs', jobId] });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: language === 'ru' ? 'Ошибка сохранения' : 'Save failed',
        description: error.message,
      });
    },
  });

  const publishMutation = useMutation({
    mutationFn: () =>
      apiRequest('POST', `/api/jobs/${jobId}/publish`, {
        translatedTitle: editedTitle,
        translatedContent: editedContent,
      }),
    onSuccess: () => {
      toast({
        title: language === 'ru' ? 'Успешно' : 'Success',
        description: language === 'ru' ? 'Перевод опубликован в WordPress' : 'Translation published to WordPress',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      onClose();
      setEditedTitle('');
      setEditedContent('');
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: language === 'ru' ? 'Ошибка' : 'Error',
        description: error.message,
      });
    },
  });

  const handleClose = () => {
    onClose();
    setEditedTitle('');
    setEditedContent('');
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {language === 'ru' ? 'Редактирование перевода' : 'Edit Translation'}
          </DialogTitle>
          <DialogDescription>
            {language === 'ru' 
              ? `Язык: ${details?.job.targetLanguage.toUpperCase() || ''} • Пост #${details?.job.postId || ''}` 
              : `Language: ${details?.job.targetLanguage.toUpperCase() || ''} • Post #${details?.job.postId || ''}`}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : details ? (
          <div className="space-y-6 py-4">
            {/* Source Post */}
            <div>
              <h3 className="text-sm font-semibold mb-3">
                {language === 'ru' ? 'Исходный текст' : 'Source Text'}
              </h3>
              <div className="space-y-3 p-4 bg-muted rounded-md">
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">{language === 'ru' ? 'Заголовок' : 'Title'}</Label>
                  <p className="text-sm mt-1">{details.sourcePost.title}</p>
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">{language === 'ru' ? 'Контент' : 'Content'}</Label>
                  <div 
                    className="text-sm mt-1 p-3 bg-background border border-input rounded-md" 
                    dangerouslySetInnerHTML={{ __html: details.sourcePost.content }}
                  />
                </div>
              </div>
            </div>

            {/* Translated Content */}
            <div>
              <h3 className="text-sm font-semibold mb-3">
                {language === 'ru' ? 'Перевод' : 'Translation'}
              </h3>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="translated-title" className="text-sm font-medium">
                    {language === 'ru' ? 'Заголовок перевода' : 'Translated Title'}
                  </Label>
                  <input
                    id="translated-title"
                    type="text"
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    className="w-full mt-2 px-3 py-2 border border-input rounded-md bg-background text-sm"
                    data-testid="input-translated-title"
                  />
                </div>

                <div>
                  <Label htmlFor="translated-content" className="text-sm font-medium">
                    {language === 'ru' ? 'Контент перевода (HTML редактор)' : 'Translated Content (HTML Editor)'}
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1 mb-2">
                    {language === 'ru' ? 'Слева редактируйте HTML, справа видите превью с таблицами' : 'Edit HTML on the left, see preview with tables on the right'}
                  </p>
                  <div className="flex gap-2 h-96 mt-2" data-testid="div-html-editor">
                    {/* Left: HTML Editor */}
                    <div className="flex-1 flex flex-col border border-input rounded-md overflow-hidden">
                      <textarea
                        value={editedContent}
                        onChange={(e) => setEditedContent(e.target.value)}
                        className="flex-1 p-3 bg-background text-sm font-mono resize-none focus:outline-none border-none"
                        placeholder={language === 'ru' ? 'Вставьте или отредактируйте HTML здесь...' : 'Paste or edit HTML here...'}
                        spellCheck="false"
                        data-testid="textarea-html-content"
                      />
                    </div>
                    
                    {/* Right: Preview */}
                    <div className="flex-1 border border-input rounded-md overflow-auto bg-white p-3" data-testid="div-html-preview-container">
                      <style>{`
                        .preview-content table { border-collapse: collapse; width: 100%; margin: 10px 0; }
                        .preview-content table, .preview-content th, .preview-content td { border: 1px solid #ccc; }
                        .preview-content th { background-color: #f5f5f5; padding: 8px; text-align: left; font-weight: bold; }
                        .preview-content td { padding: 8px; }
                        .preview-content img { max-width: 100%; height: auto; }
                      `}</style>
                      <div 
                        className="text-sm preview-content"
                        dangerouslySetInnerHTML={{ __html: editedContent }}
                        data-testid="div-html-preview"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <DialogFooter className="flex gap-2 justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              console.log('[HTML CONTENT]', editedContent);
              console.log('[IMG TAGS]', editedContent.match(/<img[^>]*>/g));
              toast({
                title: language === 'ru' ? 'HTML выведен в консоль' : 'HTML exported to console',
                description: language === 'ru' ? 'Откройте F12 чтобы увидеть' : 'Open F12 to view',
              });
            }}
            data-testid="button-view-html"
          >
            {language === 'ru' ? 'HTML' : 'HTML'}
          </Button>
          <Button
            variant="outline"
            onClick={handleClose}
            data-testid="button-cancel-translation"
          >
            {language === 'ru' ? 'Отмена' : 'Cancel'}
          </Button>
          <Button
            variant="outline"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !editedTitle || !editedContent}
            data-testid="button-save-translation"
          >
            {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {language === 'ru' ? 'Сохранить' : 'Save'}
          </Button>
          <Button
            onClick={() => publishMutation.mutate()}
            disabled={publishMutation.isPending || !editedTitle || !editedContent}
            data-testid="button-publish-translation"
          >
            {publishMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {language === 'ru' ? 'Опубликовать в WordPress' : 'Publish to WordPress'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
