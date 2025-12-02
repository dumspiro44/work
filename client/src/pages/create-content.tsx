import { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
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
import { Loader2, Plus, Image as ImageIcon, Bold, Italic, List, ListOrdered } from 'lucide-react';

export default function CreateContent() {
  const { toast } = useToast();
  const { language } = useLanguage();
  const [, setLocation] = useLocation();
  const editorRef = useRef<HTMLDivElement>(null);
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

  // Upload image to WordPress
  const uploadImageMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/upload-image', {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to upload image');
      }
      
      return response.json();
    },
    onSuccess: (data: any) => {
      if (editorRef.current) {
        const img = document.createElement('img');
        img.src = data.url;
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        img.style.marginBottom = '10px';
        editorRef.current.appendChild(img);
        editorRef.current.appendChild(document.createElement('br'));
        
        // Update content state
        if (editorRef.current) {
          setContent(editorRef.current.innerHTML);
        }
      }
      toast({
        title: language === 'ru' ? 'Загружено' : 'Uploaded',
        description: language === 'ru' ? 'Изображение добавлено' : 'Image added',
      });
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

  const handleImageClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadImageMutation.mutate(file);
    }
  };

  const applyFormat = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
  };

  const handleEditorChange = () => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      setContent(html);
    }
  };

  const handleEditorBlur = () => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      setContent(html);
    }
  };

  const handlePaste = () => {
    // Delay to ensure content is updated
    setTimeout(() => {
      if (editorRef.current) {
        setContent(editorRef.current.innerHTML);
      }
    }, 0);
  };

  const isFormValid = title.trim() && (content.trim() || (editorRef.current?.textContent?.trim())) && selectedLanguages.length > 0;

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

            {/* Content with Editor Toolbar */}
            <div className="flex-1 flex flex-col min-h-96">
              <Label className="text-sm font-medium mb-2 block">
                {language === 'ru' ? 'Содержание' : 'Content'}
              </Label>
              
              {/* Toolbar */}
              <div className="flex gap-2 p-3 border border-b border-input bg-muted rounded-t-md flex-wrap items-center">
                {/* Heading Selector */}
                <Select defaultValue="normal" onValueChange={(value) => {
                  if (value === 'normal') {
                    applyFormat('formatBlock', 'p');
                  } else {
                    applyFormat('formatBlock', value);
                  }
                }}>
                  <SelectTrigger className="w-32 h-8" data-testid="select-heading">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">{language === 'ru' ? 'Обычный' : 'Normal'}</SelectItem>
                    <SelectItem value="h1">H1 - {language === 'ru' ? 'Главное' : 'Main'}</SelectItem>
                    <SelectItem value="h2">H2 - {language === 'ru' ? 'Заголовок' : 'Heading'}</SelectItem>
                    <SelectItem value="h3">H3 - {language === 'ru' ? 'Подзаголовок' : 'Subheading'}</SelectItem>
                    <SelectItem value="h4">H4 - {language === 'ru' ? 'Мини-заголовок' : 'Minor'}</SelectItem>
                    <SelectItem value="h5">H5 - {language === 'ru' ? 'Очень мелкий' : 'Tiny'}</SelectItem>
                    <SelectItem value="h6">H6 - {language === 'ru' ? 'Самый мелкий' : 'Smallest'}</SelectItem>
                  </SelectContent>
                </Select>

                <div className="w-px bg-border" />
                
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => applyFormat('bold')}
                  title="Bold"
                  data-testid="button-bold"
                >
                  <Bold className="w-4 h-4" />
                </Button>
                
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => applyFormat('italic')}
                  title="Italic"
                  data-testid="button-italic"
                >
                  <Italic className="w-4 h-4" />
                </Button>
                
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => applyFormat('underline')}
                  title="Underline"
                  data-testid="button-underline"
                >
                  <u>U</u>
                </Button>
                
                <div className="w-px bg-border" />
                
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => applyFormat('insertUnorderedList')}
                  title="Bullet List"
                  data-testid="button-list"
                >
                  <List className="w-4 h-4" />
                </Button>
                
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => applyFormat('insertOrderedList')}
                  title="Numbered List"
                  data-testid="button-ordered-list"
                >
                  <ListOrdered className="w-4 h-4" />
                </Button>
                
                <div className="w-px bg-border" />
                
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => applyFormat('createLink', prompt('Enter URL:') || '')}
                  title="Link"
                  data-testid="button-link"
                >
                  🔗
                </Button>
                
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleImageClick}
                  disabled={uploadImageMutation.isPending}
                  title="Image"
                  data-testid="button-image"
                >
                  <ImageIcon className="w-4 h-4" />
                </Button>
                
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={handleFileSelect}
                  data-testid="input-image-file"
                />
              </div>
              
              {/* Editor */}
              <div
                id="editor-wrapper"
                ref={editorRef}
                contentEditable
                onInput={handleEditorChange}
                onBlur={handleEditorBlur}
                onPaste={handlePaste}
                suppressContentEditableWarning
                className="flex-1 border border-t-0 border-input rounded-b-md p-4 overflow-y-auto bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0"
                data-testid="editor-content"
                style={{
                  minHeight: '300px',
                  wordWrap: 'break-word',
                  whiteSpace: 'pre-wrap',
                }}
              />
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
