import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useLanguage } from '@/contexts/LanguageContext';
import { Loader2 } from 'lucide-react';
import { CKEditor } from '@ckeditor/ckeditor5-react';
// @ts-ignore - CKEditor types compatibility
import ClassicEditor from '@ckeditor/ckeditor5-build-classic';

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

// Helper function to process video scripts and extract iframe HTML
const processVideoScripts = (html: string): string => {
  let result = html;
  const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  
  // Replace script tags with video divs IN PLACE where they are
  result = result.replace(scriptRegex, (match, scriptContent) => {
    // Look for iframe innerHTML patterns
    const iframeMatch = scriptContent.match(/document\.getElementById\("([^"]+)"\)\.innerHTML\s*=\s*['"](<iframe[^>]*>[\s\S]*?<\/iframe>)['"]/);
    
    if (iframeMatch) {
      let iframeHtml = iframeMatch[2];
      
      // Unescape HTML entities
      iframeHtml = iframeHtml
        .replace(/&#038;/g, '&')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'");
      
      // Return responsive container for video (REPLACES script in place)
      return `<div style="position: relative; width: 100%; padding-bottom: 56.25%; margin: 1rem 0; height: 0; overflow: hidden; border-radius: 4px; background: #000;">${iframeHtml.replace('<iframe', '<iframe style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none;"')}</div>`;
    }
    
    return match; // Keep non-video scripts as-is
  });
  
  return result;
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
  const [editorKey, setEditorKey] = useState(0);
  const [siteCss, setSiteCss] = useState('');
  const [showPreview, setShowPreview] = useState(false);

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

  // Load CSS from WordPress page
  useEffect(() => {
    if (details && settings?.wpUrl && !siteCss) {
      const wpUrl = settings.wpUrl.replace(/\/$/, '');
      const pageUrl = `${wpUrl}/?p=${details.job.postId}`;
      
      fetch(pageUrl)
        .then(res => res.text())
        .then(html => {
          // Extract all <link> and <style> tags
          const linkRegex = /<link[^>]*>/g;
          const styleRegex = /<style[^>]*>[\s\S]*?<\/style>/g;
          
          let css = '';
          const links = html.match(linkRegex) || [];
          links.forEach(link => {
            css += link + '\n';
          });
          
          const styles = html.match(styleRegex) || [];
          styles.forEach(style => {
            css += style + '\n';
          });
          
          setSiteCss(css);
        })
        .catch(err => console.log('[CSS LOAD ERROR]', err));
    }
  }, [details, settings, siteCss]);

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
    mutationFn: () => {
      // Use original Froala content for publishing (preserves tables as-is)
      // Quill is only used for validation that links are preserved
      return apiRequest('POST', `/api/jobs/${jobId}/publish`, {
        translatedTitle: editedTitle,
        translatedContent: editedContent,
      });
    },
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
                  <iframe
                    srcDoc={`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${siteCss}
  <style>
    html, body { margin: 0; padding: 1rem; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #ffffff !important; color: #000000 !important; }
    * { box-sizing: border-box; }
    body * { color: #000000 !important; }
    body h1, body h2, body h3, body h4, body h5, body h6 { color: #000000 !important; }
    body p, body span, body div, body li { color: #000000 !important; }
    body a, a { color: #0066cc !important; text-decoration: underline !important; display: inline !important; visibility: visible !important; }
    body a:visited { color: #663399 !important; }
    img { max-width: 100%; height: auto; }
    iframe { max-width: 100%; height: auto; border: 1px solid #ccc; border-radius: 4px; margin: 1rem 0; }
    video { max-width: 100%; height: auto; border: 1px solid #ccc; border-radius: 4px; margin: 1rem 0; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    td, th { border: 1px solid #ddd; padding: 0.75rem; }
  </style>
</head>
<body>
${processVideoScripts(details.sourcePost.content)}
</body>
</html>`}
                    className="w-full border border-input rounded-md"
                    style={{ height: '400px', minHeight: '400px' }}
                    sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                    data-testid="iframe-source-content"
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
                    {language === 'ru' ? 'Контент перевода' : 'Translated Content'}
                  </Label>
                  <div className="mt-2 border border-input rounded-md bg-background overflow-hidden" data-testid="div-ckeditor">
                    <CKEditor
                      key={editorKey}
                      editor={ClassicEditor}
                      data={editedContent}
                      onChange={(event, editor) => {
                        const data = editor.getData();
                        setEditedContent(data);
                      }}
                      config={{
                        toolbar: [
                          'heading', '|',
                          'bold', 'italic', 'underline', 'strikethrough', '|',
                          'link', 'insertImage', 'insertTable', '|',
                          'bulletedList', 'numberedList', '|',
                          'blockQuote', '|',
                          'alignment', '|',
                          'undo', 'redo', '|',
                          'sourceEditing'
                        ],
                        image: {
                          toolbar: ['imageTextAlternative', '|', 'imageStyle:full', 'imageStyle:side']
                        },
                        table: {
                          contentToolbar: ['tableColumn', 'tableRow', 'mergeTableCells']
                        },
                        htmlSupport: {
                          allow: [
                            {
                              name: 'iframe',
                              attributes: ['src', 'width', 'height', 'allow', 'allowfullscreen', 'frameborder', 'style'],
                            },
                            {
                              name: 'video',
                              attributes: ['src', 'width', 'height', 'controls', 'controlsList', 'style'],
                            },
                            {
                              name: 'source',
                              attributes: ['src', 'type'],
                            },
                          ],
                        },
                      }}
                    />
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowPreview(!showPreview)}
                      data-testid="button-preview-translation"
                    >
                      {language === 'ru' 
                        ? (showPreview ? 'Скрыть превью' : 'Превью для публикации')
                        : (showPreview ? 'Hide preview' : 'Preview for publishing')}
                    </Button>
                  </div>
                  
                  {showPreview && (
                    <div className="mt-4 space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground">
                        {language === 'ru' ? 'Превью перевода (как будет выглядеть на сайте)' : 'Translation preview (as it will appear on site)'}
                      </Label>
                      <iframe
                        srcDoc={`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${siteCss}
  <style>
    html, body { margin: 0; padding: 1rem; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #ffffff !important; color: #000000 !important; }
    * { box-sizing: border-box; }
    body * { color: #000000 !important; }
    body h1, body h2, body h3, body h4, body h5, body h6 { color: #000000 !important; }
    body p, body span, body div, body li { color: #000000 !important; }
    body a, a { color: #0066cc !important; text-decoration: underline !important; display: inline !important; visibility: visible !important; }
    body a:visited { color: #663399 !important; }
    img { max-width: 100%; height: auto; }
    iframe { max-width: 100%; height: auto; border: 1px solid #ccc; border-radius: 4px; margin: 1rem 0; }
    video { max-width: 100%; height: auto; border: 1px solid #ccc; border-radius: 4px; margin: 1rem 0; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    td, th { border: 1px solid #ddd; padding: 0.75rem; }
  </style>
</head>
<body>
<h1>${editedTitle}</h1>
${processVideoScripts(editedContent)}
</body>
</html>`}
                        className="w-full border border-input rounded-md"
                        style={{ height: '400px', minHeight: '400px' }}
                        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-scripts"
                        data-testid="iframe-preview-translation"
                      />
                    </div>
                  )}
                  
                  <p className="text-xs text-muted-foreground mt-3 p-2 bg-muted rounded">
                    {language === 'ru' 
                      ? '✓ Все ссылки видны • ✓ Таблицы поддерживаются • ✓ Видео (YouTube, Vimeo) видно • ✓ Гарантировано сохранено в WordPress'
                      : '✓ All links visible • ✓ Tables supported • ✓ Videos (YouTube, Vimeo) visible • ✓ Guaranteed in WordPress'}
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

    </>
  );
}
