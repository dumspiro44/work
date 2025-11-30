import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useLanguage } from '@/contexts/LanguageContext';
import { Loader2, ArrowLeft } from 'lucide-react';
import { CKEditor } from '@ckeditor/ckeditor5-react';
import ClassicEditor from '@ckeditor/ckeditor5-build-classic';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const decodeHtmlEntities = (html: string): string => {
  const element = document.createElement('div');
  element.innerHTML = html;
  const decoded = element.innerHTML;
  if (decoded.includes('&lt;') || decoded.includes('&gt;') || decoded.includes('&quot;')) {
    const element2 = document.createElement('div');
    element2.innerHTML = decoded;
    return element2.innerHTML;
  }
  return decoded;
};

const processVideoScripts = (html: string, showMessage: boolean = true): string => {
  let result = html;
  const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  const message = `<div style="background-color: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 4px; padding: 1rem; margin: 1rem 0; color: #374151; font-size: 0.875rem;">
    <strong>ℹ️ Видео требует ручной вставки в WordPress</strong>
    <p style="margin: 0.5rem 0 0 0;">При редактировании страницы в WordPress убедитесь, что видео правильно отображается на месте этого сообщения.</p>
  </div>`;
  
  if (showMessage) {
    const matches = Array.from(html.matchAll(scriptRegex));
    for (const match of matches) {
      const scriptContent = match[1];
      const iframeMatch = scriptContent.match(/document\.getElementById\("([^"]+)"\)\.innerHTML\s*=\s*['"](<iframe[^>]*>[\s\S]*?<\/iframe>)['"]/);
      if (iframeMatch) {
        const elementId = iframeMatch[1];
        const divRegex = new RegExp(`<div[^>]*id=["\']?${elementId}["\']?[^>]*>\\s*<\\/div>`, 'i');
        if (divRegex.test(result)) {
          result = result.replace(divRegex, `<div id="${elementId}" style="margin: 1rem 0;">${message}</div>`);
        } else {
          const headingRegex = /<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/i;
          const headingMatch = result.match(headingRegex);
          if (headingMatch) {
            const pos = result.indexOf(headingMatch[0]) + headingMatch[0].length;
            result = result.slice(0, pos) + message + result.slice(pos);
          }
        }
      }
    }
    result = result.replace(scriptRegex, '');
  } else {
    result = result.replace(scriptRegex, '');
  }
  return result;
};

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

export default function EditTranslationPage() {
  const { toast } = useToast();
  const { language } = useLanguage();
  const [, setLocation] = useLocation();
  const [editedTitle, setEditedTitle] = useState('');
  const [editedContent, setEditedContent] = useState('');
  const [editorKey, setEditorKey] = useState(0);
  const [siteCss, setSiteCss] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [showRepublishDialog, setShowRepublishDialog] = useState(false);

  // Extract jobId from URL
  const jobId = new URLSearchParams(window.location.search).get('id');
  const isVirtualId = jobId?.startsWith('published-');
  
  const parseVirtualId = (id: string) => {
    const match = id.match(/published-(\d+)-(.+)/);
    return match ? { postId: parseInt(match[1]), lang: match[2] } : null;
  };

  const { data: details, isLoading } = useQuery<JobDetails>({
    queryKey: ['/api/jobs', jobId],
    queryFn: async () => {
      if (!jobId) throw new Error('No job');
      if (isVirtualId) {
        const parsed = parseVirtualId(jobId);
        if (!parsed) throw new Error('Invalid virtual ID');
        const response = await apiRequest('GET', `/api/posts/${parsed.postId}/translations/${parsed.lang}`);
        return response;
      }
      return apiRequest('GET', `/api/jobs/${jobId}`);
    },
    enabled: !!jobId,
  });

  const { data: settings } = useQuery({
    queryKey: ['/api/settings'],
    queryFn: () => apiRequest('GET', '/api/settings'),
  });

  const ensureAbsoluteImageUrls = (html: string, baseUrl: string): string => {
    return html.replace(/<img([^>]*)\ssrc="([^"]*)"([^>]*)>/g, (match, before, src, after) => {
      if (src.startsWith('http://') || src.startsWith('https://')) return match;
      const base = baseUrl.replace(/\/$/, '');
      const absoluteUrl = src.startsWith('/') ? `${base}${src}` : `${base}/${src}`;
      return `<img${before} src="${absoluteUrl}"${after}>`;
    });
  };

  useEffect(() => {
    if (details && settings?.wpUrl && !siteCss) {
      const wpUrl = settings.wpUrl.replace(/\/$/, '');
      const pageUrl = `${wpUrl}/?p=${details.job.postId}`;
      fetch(pageUrl)
        .then(res => res.text())
        .then(html => {
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

  useEffect(() => {
    if (details && settings?.wpUrl) {
      setEditedTitle(details.job.translatedTitle || '');
      let content = details.job.translatedContent || '';
      content = decodeHtmlEntities(content);
      content = content.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '');
      content = ensureAbsoluteImageUrls(content, settings.wpUrl);
      setEditedContent(content);
      if (isVirtualId) {
        setIsPublished(true);
      } else {
        setIsPublished(false);
      }
    }
  }, [details, settings, isVirtualId]);

  const saveMutation = useMutation({
    mutationFn: () => {
      let cleanContent = editedContent.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '');
      if (isPublished) {
        setShowRepublishDialog(true);
        return Promise.reject(new Error('REPUBLISH_REQUIRED'));
      }
      return apiRequest('PATCH', `/api/jobs/${jobId}`, {
        translatedTitle: editedTitle,
        translatedContent: cleanContent,
      });
    },
    onSuccess: () => {
      toast({
        title: language === 'ru' ? 'Сохранено' : 'Saved',
        description: language === 'ru' ? 'Переводы сохранены' : 'Translations saved',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/jobs', jobId] });
    },
    onError: (error: Error) => {
      if (error.message === 'REPUBLISH_REQUIRED') return;
      toast({
        variant: 'destructive',
        title: language === 'ru' ? 'Ошибка сохранения' : 'Save failed',
        description: error.message,
      });
    },
  });

  const republishMutation = useMutation({
    mutationFn: () => {
      let cleanContent = editedContent.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '');
      return apiRequest('POST', `/api/jobs/${jobId}/publish`, {
        translatedTitle: editedTitle,
        translatedContent: cleanContent,
      });
    },
    onSuccess: async () => {
      toast({
        title: language === 'ru' ? 'Переопубликовано' : 'Republished',
        description: language === 'ru' ? 'Перевод переопубликован в WordPress' : 'Translation republished to WordPress',
      });
      setShowRepublishDialog(false);
      // Invalidate jobs cache - job stays visible with PUBLISHED status
      await queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      setLocation('/posts');
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: language === 'ru' ? 'Ошибка' : 'Error',
        description: error.message,
      });
    },
  });

  const publishMutation = useMutation({
    mutationFn: () => {
      let cleanContent = editedContent.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '');
      return apiRequest('POST', `/api/jobs/${jobId}/publish`, {
        translatedTitle: editedTitle,
        translatedContent: cleanContent,
      });
    },
    onSuccess: async () => {
      toast({
        title: language === 'ru' ? 'Успешно' : 'Success',
        description: language === 'ru' ? 'Перевод опубликован в WordPress' : 'Translation published to WordPress',
      });
      // Invalidate jobs cache - job now has PUBLISHED status and stays visible
      await queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      setLocation('/posts');
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: language === 'ru' ? 'Ошибка' : 'Error',
        description: error.message,
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!details) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="text-muted-foreground">
          {language === 'ru' ? 'Перевод не найден' : 'Translation not found'}
        </div>
        <Button variant="ghost" onClick={() => setLocation('/posts')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          {language === 'ru' ? 'Вернуться к постам' : 'Back to posts'}
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 overflow-y-auto">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => setLocation('/posts')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">
            {language === 'ru' ? 'Редактирование перевода' : 'Edit Translation'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {language === 'ru' 
              ? `Язык: ${details.job.targetLanguage.toUpperCase()} • Пост #${details.job.postId}` 
              : `Language: ${details.job.targetLanguage.toUpperCase()} • Post #${details.job.postId}`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Source Content */}
        <div>
          <h3 className="text-sm font-semibold mb-3">
            {language === 'ru' ? 'Исходный контент' : 'Source Content'}
          </h3>
          <div className="space-y-3">
            <div>
              <Label className="text-sm font-medium">{language === 'ru' ? 'Заголовок' : 'Title'}</Label>
              <div className="mt-2 p-3 border border-input rounded-md bg-muted text-sm">
                {details.sourcePost.title}
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium">{language === 'ru' ? 'Контент' : 'Content'}</Label>
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
    img { max-width: 100%; height: auto; }
  </style>
</head>
<body>
${processVideoScripts(details.sourcePost.content, true)}
</body>
</html>`}
                className="w-full border border-input rounded-md mt-2"
                style={{ height: '400px', minHeight: '400px' }}
                sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
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
              <div className="mt-2 border border-input rounded-md bg-background overflow-hidden">
                <CKEditor
                  key={editorKey}
                  editor={ClassicEditor}
                  data={editedContent}
                  onChange={(event, editor) => {
                    const data = editor.getData();
                    setEditedContent(data);
                  }}
                  config={{
                    toolbar: ['heading', '|', 'bold', 'italic', 'underline', 'strikethrough', '|', 'link', 'insertImage', 'insertTable', '|', 'bulletedList', 'numberedList', '|', 'blockQuote', '|', 'alignment', '|', 'undo', 'redo', '|', 'sourceEditing'],
                    image: { toolbar: ['imageTextAlternative', '|', 'imageStyle:full', 'imageStyle:side'] },
                    table: { contentToolbar: ['tableColumn', 'tableRow', 'mergeTableCells'] },
                  }}
                />
              </div>
              
              <div className="mt-3 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)}>
                  {language === 'ru' ? (showPreview ? 'Скрыть превью' : 'Превью') : (showPreview ? 'Hide preview' : 'Preview')}
                </Button>
              </div>

              {showPreview && (
                <div className="mt-4 space-y-2">
                  <iframe
                    srcDoc={`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    html, body { margin: 0; padding: 1rem; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #ffffff; color: #000000; }
    img { max-width: 100%; height: auto; }
  </style>
</head>
<body>
<h1>${editedTitle}</h1>
${processVideoScripts(editedContent, false)}
</body>
</html>`}
                    className="w-full border border-input rounded-md"
                    style={{ height: '400px', minHeight: '400px' }}
                    sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2 justify-end mt-6">
        <Button variant="ghost" onClick={() => setLocation('/posts')}>
          {language === 'ru' ? 'Отмена' : 'Cancel'}
        </Button>
        <Button
          variant="outline"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || republishMutation.isPending || !editedTitle || !editedContent}
        >
          {(saveMutation.isPending || republishMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isPublished
            ? (language === 'ru' ? 'Сохранить и переопубликовать' : 'Save and republish')
            : (language === 'ru' ? 'Сохранить' : 'Save')}
        </Button>
        <Button
          onClick={() => {
            if (isPublished) {
              saveMutation.mutate();
            } else {
              publishMutation.mutate();
            }
          }}
          disabled={publishMutation.isPending || republishMutation.isPending || !editedTitle || !editedContent}
        >
          {(publishMutation.isPending || republishMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isPublished
            ? (language === 'ru' ? 'Переопубликовать' : 'Republish')
            : (language === 'ru' ? 'Опубликовать в WordPress' : 'Publish to WordPress')}
        </Button>
      </div>

      <AlertDialog open={showRepublishDialog} onOpenChange={setShowRepublishDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {language === 'ru' ? 'Переопубликовать перевод?' : 'Republish translation?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'ru' ? 'Статья будет переопубликована в WordPress с внесёнными изменениями' : 'The article will be republished in WordPress with your changes'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-2 justify-end">
            <AlertDialogCancel>
              {language === 'ru' ? 'Отмена' : 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => republishMutation.mutate()} disabled={republishMutation.isPending}>
              {republishMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {language === 'ru' ? 'Да, переопубликовать' : 'Yes, republish'}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
