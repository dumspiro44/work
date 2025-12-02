import { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useLanguage } from '@/contexts/LanguageContext';
import { api } from '@/lib/api';
import type { Settings } from '@shared/schema';
import { Loader2, Plus, Image as ImageIcon } from 'lucide-react';

export default function CreateContent() {
  const { toast } = useToast();
  const { language } = useLanguage();
  const [, setLocation] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [postType, setPostType] = useState<'post' | 'page' | 'cat_news'>('post');
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);

  // Fetch settings to get target languages
  const { data: settings } = useQuery<Settings>({
    queryKey: ['/api/settings'],
  });

  // Set all languages as selected by default when settings load
  useEffect(() => {
    if (settings?.targetLanguages && selectedLanguages.length === 0) {
      setSelectedLanguages(settings.targetLanguages);
    }
  }, [settings?.targetLanguages]);

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
      
      // Reset form but DO NOT redirect
      setTitle('');
      setContent('');
      setSelectedLanguages(settings?.targetLanguages || []);
    },
    onError: (error: Error) => {
      let errorMsg = error.message;
      // Parse error messages from API
      if (errorMsg.includes('select at least one target language')) {
        errorMsg = language === 'ru' ? 'Выберите хотя бы один язык для перевода' : 'Please select at least one target language';
      }
      if (errorMsg.includes('WordPress and Gemini not configured')) {
        errorMsg = language === 'ru' ? 'Настройте WordPress и Gemini в конфигурации' : 'Configure WordPress and Gemini in settings';
      }
      
      toast({
        variant: 'destructive',
        title: language === 'ru' ? 'Ошибка' : 'Error',
        description: errorMsg,
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

  // Image upload mutation
  const uploadImageMutation = useMutation({
    mutationFn: async (file: File) => {
      const token = api.getToken() || '';
      const arrayBuffer = await file.arrayBuffer();
      
      const response = await fetch(`/api/upload-image?token=${encodeURIComponent(token)}&filename=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        body: new Uint8Array(arrayBuffer),
        headers: {
          'Content-Type': file.type || 'image/jpeg',
        },
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to upload image');
      }
      
      return response.json();
    },
    onSuccess: (data: any) => {
      const html = content + `<img src="${data.url}" style="max-width: 100%; height: auto; margin: 10px 0;" />`;
      setContent(html);
      
      toast({
        title: language === 'ru' ? '✅ Загружено' : '✅ Uploaded',
        description: language === 'ru' ? 'Изображение добавлено' : 'Image added',
      });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: language === 'ru' ? '❌ Ошибка' : '❌ Error',
        description: error.message,
      });
    },
  });

  const handleImageClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadImageMutation.mutate(file);
    }
  };

  const isFormValid = title.trim() && content.trim() && selectedLanguages.length > 0;

  // Quill toolbar configuration with alignment, tables, and HTML mode
  const modules = {
    toolbar: [
      [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'align': [] }],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      ['link', 'image'],
      ['table'],
      ['code-block'],
      ['clean']
    ]
  };

  const formats = [
    'header',
    'bold', 'italic', 'underline', 'strike',
    'align',
    'list', 'bullet',
    'link', 'image', 'table',
    'code-block'
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
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="overflow-y-auto p-6 flex flex-col gap-6">
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

            {/* Target Languages - Horizontal */}
            <div>
              <Label className="text-sm font-medium mb-2 block">
                {language === 'ru' ? 'Языки для перевода' : 'Translate to languages'}
              </Label>
              <div className="flex gap-2 flex-wrap">
                {settings?.targetLanguages?.map((lang) => (
                  <Button
                    key={lang}
                    variant={selectedLanguages.includes(lang) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => toggleLanguage(lang)}
                    data-testid={`button-lang-${lang}`}
                  >
                    {lang.toUpperCase()}
                  </Button>
                ))}
              </div>
            </div>

            {/* Content with React Quill */}
            <div className="flex-1 flex flex-col min-h-96">
              <Label className="text-sm font-medium mb-2 block">
                {language === 'ru' ? 'Содержание' : 'Content'}
              </Label>
              
              <div className="flex-1 border border-input rounded-md overflow-hidden bg-white dark:bg-slate-900 flex flex-col">
                <ReactQuill
                  theme="snow"
                  value={content}
                  onChange={setContent}
                  modules={modules}
                  formats={formats}
                  className="flex-1 flex flex-col"
                  data-testid="editor-content"
                />
              </div>
            </div>
            
            {/* Hidden image upload for manual insert if needed */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={handleFileSelect}
              data-testid="input-image-file"
            />
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
            onClick={() => {
              if (selectedLanguages.length === 0) {
                toast({
                  variant: 'destructive',
                  title: language === 'ru' ? 'Ошибка' : 'Error',
                  description: language === 'ru' ? 'Выберите хотя бы один язык для перевода' : 'Please select at least one target language',
                });
                return;
              }
              createMutation.mutate();
            }}
            disabled={!isFormValid || createMutation.isPending}
            data-testid="button-create"
          >
            {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {language === 'ru' ? 'Создать и перевести' : 'Create & Translate'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
