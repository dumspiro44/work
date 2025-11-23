import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useLanguage } from '@/contexts/LanguageContext';
import { Loader2 } from 'lucide-react';
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

  // Update edited values when details load
  useEffect(() => {
    if (details) {
      setEditedTitle(details.job.translatedTitle || '');
      setEditedContent(details.job.translatedContent || '');
    }
  }, [details]);

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
                  <p className="text-sm mt-1 whitespace-pre-wrap">{details.sourcePost.content}</p>
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
                  <Textarea
                    id="translated-content"
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    rows={15}
                    className="font-mono text-xs mt-2"
                    data-testid="textarea-translated-content"
                  />
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <DialogFooter className="flex gap-2 justify-end">
          <Button
            variant="outline"
            onClick={handleClose}
            data-testid="button-cancel-translation"
          >
            {language === 'ru' ? 'Отмена' : 'Cancel'}
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
