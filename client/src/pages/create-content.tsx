import { useState, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useLanguage } from '@/contexts/LanguageContext';
import type { Settings } from '@shared/schema';
import { Loader2, Plus } from 'lucide-react';

export default function CreateContent() {
  const { toast } = useToast();
  const { language } = useLanguage();
  const [, setLocation] = useLocation();
  const quillRef = useRef<any>(null);
  
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [postType, setPostType] = useState<'post' | 'page' | 'cat_news'>('post');
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);

  // Fetch settings to get target languages
  const { data: settings } = useQuery<Settings>({
    queryKey: ['/api/settings'],
  });

  // Upload image to WordPress
  const uploadImageMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiRequest('POST', '/api/upload-image', formData);
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: language === 'ru' ? 'Ошибка загрузки' : 'Upload error',
        description: error.message,
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/create-content', {
      title,
      content,
      postType,
      sourceLanguage: settings?.sourceLanguage,
      targetLanguages: selectedLanguages,
    }),
    onSuccess: (data: any) => {
      toast({
        title: language === 'ru' ? '✅ Успешно!' : '✅ Success!',
        description: language === 'ru' 
          ? `Контент создан с ID ${data.postId}. ${data.jobsCreated} задание(й) в очереди перевода.`
          : `Content created with ID ${data.postId}. ${data.jobsCreated} translation job(s) queued.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/posts/all'] });
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      setTitle('');
      setContent('');
      setSelectedLanguages([]);
      setTimeout(() => setLocation('/posts'), 1000);
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: language === 'ru' ? 'Ошибка' : 'Error',
        description: error.message,
      });
    },
  });

  const toggleLanguage = (lang: string) => {
    setSelectedLanguages(prev =>
      prev.includes(lang)
        ? prev.filter(l => l !== lang)
        : [...prev, lang]
    );
  };

  const isFormValid = title.trim() && content.trim();

  const modules = {
    toolbar: {
      container: [
        [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        ['blockquote', 'code-block'],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        [{ 'script': 'sub'}, { 'script': 'super' }],
        [{ 'indent': '-1'}, { 'indent': '+1' }],
        [{ 'size': ['small', false, 'large', 'huge'] }],
        [{ 'color': [] }, { 'background': [] }],
        [{ 'font': [] }],
        [{ 'align': [] }],
        ['link', 'image', 'video'],
        ['clean']
      ],
      handlers: {
        image: () => {
          const input = document.createElement('input');
          input.setAttribute('type', 'file');
          input.setAttribute('accept', 'image/*');
          input.click();
          
          input.onchange = async () => {
            const file = input.files?.[0];
            if (file) {
              try {
                const result = await uploadImageMutation.mutateAsync(file);
                const range = quillRef.current?.getEditor().getSelection();
                if (range) {
                  quillRef.current.getEditor().insertEmbed(range.index, 'image', result.url);
                }
              } catch (e) {
                console.error('Image upload failed:', e);
              }
            }
          };
        }
      }
    }
  };

  const formats = [
    'header',
    'bold', 'italic', 'underline', 'strike',
    'blockquote', 'code-block',
    'list', 'bullet', 'indent',
    'script',
    'size', 'color', 'background',
    'font',
    'align',
    'link', 'image', 'video'
  ];

  return (
    <div className="h-full flex flex-col p-6 gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Plus className="w-6 h-6" />
        <h1 className="text-2xl font-bold">
          {language === 'ru' ? 'Создать контент' : 'Create Content'}
        </h1>
      </div>

      {/* Main Form Card */}
      <Card className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 flex flex-col overflow-y-auto p-6 gap-6">
          {/* Title */}
          <div>
            <Label className="text-sm font-medium mb-2 block">
              {language === 'ru' ? 'Заголовок' : 'Title'}
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={language === 'ru' ? 'Введите заголовок...' : 'Enter title...'}
              className="text-base"
              data-testid="input-title"
            />
          </div>

          {/* Content with WYSIWYG Editor */}
          <div className="flex-1 flex flex-col min-h-96">
            <Label className="text-sm font-medium mb-2 block">
              {language === 'ru' ? 'Содержание' : 'Content'}
            </Label>
            <div className="flex-1 border border-input rounded-md overflow-hidden bg-background">
              <ReactQuill
                ref={quillRef}
                theme="snow"
                value={content}
                onChange={setContent}
                modules={modules}
                formats={formats}
                placeholder={language === 'ru' ? 'Напишите контент здесь...' : 'Write content here...'}
                className="h-full flex flex-col bg-background text-foreground"
                style={{ height: '100%' }}
              />
            </div>
          </div>

          {/* Post Type */}
          <div>
            <Label className="text-sm font-medium mb-2 block">
              {language === 'ru' ? 'Тип контента' : 'Content Type'}
            </Label>
            <Select value={postType} onValueChange={(value: any) => setPostType(value)}>
              <SelectTrigger data-testid="select-post-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="post">{language === 'ru' ? 'Статья' : 'Post'}</SelectItem>
                <SelectItem value="page">{language === 'ru' ? 'Страница' : 'Page'}</SelectItem>
                <SelectItem value="cat_news">{language === 'ru' ? 'Новость' : 'News'}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Target Languages */}
          <div>
            <Label className="text-sm font-medium mb-3 block">
              {language === 'ru' ? 'Языки для перевода' : 'Translate to languages'}
            </Label>
            <div className="space-y-2">
              {settings?.targetLanguages?.map((lang) => (
                <div key={lang} className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedLanguages.includes(lang)}
                    onCheckedChange={() => toggleLanguage(lang)}
                    data-testid={`checkbox-lang-${lang}`}
                  />
                  <span className="text-sm">{lang.toUpperCase()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer with Actions */}
        <div className="border-t p-4 flex gap-3 justify-end bg-muted/50">
          <Button
            variant="outline"
            onClick={() => setLocation('/posts')}
            data-testid="button-cancel"
          >
            {language === 'ru' ? 'Отмена' : 'Cancel'}
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!isFormValid || createMutation.isPending}
            data-testid="button-create"
          >
            {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {language === 'ru' ? 'Создать и перевести' : 'Create & Translate'}
          </Button>
        </div>
      </Card>

      {/* Custom Quill Styles */}
      <style>{`
        .ql-toolbar {
          background: var(--background);
          border: none !important;
          border-bottom: 1px solid var(--input) !important;
          padding: 8px;
        }
        .ql-container {
          border: none !important;
          font-size: 16px;
        }
        .ql-editor {
          min-height: 300px;
          padding: 12px;
          background: var(--background);
          color: var(--foreground);
        }
        .ql-toolbar.ql-snow .ql-fill,
        .ql-toolbar.ql-snow .ql-stroke {
          fill: currentColor;
          stroke: currentColor;
        }
        .ql-toolbar.ql-snow button:hover,
        .ql-toolbar.ql-snow button:focus,
        .ql-toolbar.ql-snow button.ql-active {
          color: var(--primary);
        }
        .dark .ql-editor {
          background: var(--background);
          color: var(--foreground);
        }
      `}</style>
    </div>
  );
}
