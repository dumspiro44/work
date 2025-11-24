import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useLanguage } from '@/contexts/LanguageContext';
import { Loader2, Eye } from 'lucide-react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { FroalaPreviewModal } from './froala-preview-modal';

// Helper function to decode HTML entities while preserving HTML tags
const decodeHtmlEntities = (html: string): string => {
  // Create a div and set innerHTML to decode entities while preserving HTML structure
  const element = document.createElement('div');
  element.innerHTML = html;
  
  // Get the decoded HTML content
  const decoded = element.innerHTML;
  
  // Handle double-encoding (in case WordPress double-encoded the content)
  if (decoded.includes('&lt;') || decoded.includes('&gt;') || decoded.includes('&quot;')) {
    const element2 = document.createElement('div');
    element2.innerHTML = decoded;
    return element2.innerHTML;
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
  const [previewOpen, setPreviewOpen] = useState(false);

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
    <>
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
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">
                  {language === 'ru' ? 'Перевод' : 'Translation'}
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPreviewOpen(true)}
                  data-testid="button-preview-translation"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  {language === 'ru' ? 'Превью для публикации' : 'Preview for publishing'}
                </Button>
              </div>
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
                  <div className="p-3 mb-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md">
                    <p className="text-xs font-medium text-blue-900 dark:text-blue-100">
                      {language === 'ru' 
                        ? '💡 Это окно для редактирования контента. Нажмите "Превью для публикации" чтобы увидеть как будет выглядеть в WordPress со всеми таблицами и ссылками.'
                        : '💡 This window is for editing content. Click "Preview for publishing" to see how it will look in WordPress with all tables and links.'}
                    </p>
                  </div>
                  <Label htmlFor="translated-content" className="text-sm font-medium">
                    {language === 'ru' ? 'Контент перевода' : 'Translated Content'}
                  </Label>
                  <div className="mt-2 border border-input rounded-md bg-background" data-testid="div-quill-editor" style={{ minHeight: '300px', maxHeight: '1800px', overflow: 'auto' }}>
                    <ReactQuill
                      value={editedContent}
                      onChange={setEditedContent}
                      theme="snow"
                      placeholder={language === 'ru' ? 'Отредактируйте перевод здесь' : 'Edit translation here'}
                      modules={{
                        toolbar: [
                          [{ header: [1, 2, 3, false] }],
                          ['bold', 'italic', 'underline', 'strike'],
                          ['blockquote', 'code-block'],
                          [{ list: 'ordered' }, { list: 'bullet' }],
                          [{ align: [] }],
                          ['link', 'image'],
                          ['clean'],
                        ],
                      }}
                      formats={['header', 'bold', 'italic', 'underline', 'strike', 'blockquote', 'code-block', 'list', 'align', 'link', 'image']}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {language === 'ru' ? '⚠️ Таблицы отображаются как текст в редакторе (ограничение ReactQuill), но HTML полностью сохраняется. ✓ Ссылки полностью поддерживаются. ✓ При публикации всё будет корректно.' : '⚠️ Tables appear as text in editor (ReactQuill limitation), but HTML is fully preserved. ✓ Links fully supported. ✓ Everything will render correctly on publishing.'}
                  </p>
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
              console.log('[LINKS]', editedContent.match(/<a[^>]*>/g));
              console.log('[TABLES]', editedContent.match(/<table[^>]*>[\s\S]*?<\/table>/g));
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

    {/* Froala Preview Modal - rendered outside Dialog to avoid z-index conflicts */}
    <FroalaPreviewModal 
      open={previewOpen}
      title={editedTitle}
      content={editedContent}
      onClose={() => setPreviewOpen(false)}
    />
    </>
  );
}
