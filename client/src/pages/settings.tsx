import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Loader2, Eye, EyeOff, CheckCircle } from 'lucide-react';
import type { Settings } from '@shared/schema';
import { AVAILABLE_LANGUAGES, type Language } from '@/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function SettingsPage() {
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    wpUrl: '',
    wpUsername: '',
    wpPassword: '',
    sourceLanguage: 'en',
    targetLanguages: [] as string[],
    geminiApiKey: '',
    systemInstruction: '',
  });

  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ['/api/settings'],
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        wpUrl: settings.wpUrl || '',
        wpUsername: settings.wpUsername || '',
        wpPassword: settings.wpPassword || '',
        sourceLanguage: settings.sourceLanguage || 'en',
        targetLanguages: settings.targetLanguages || [],
        geminiApiKey: settings.geminiApiKey || '',
        systemInstruction: settings.systemInstruction || '',
      });
    }
  }, [settings]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const saveMutation = useMutation({
    mutationFn: (data: typeof formData) => apiRequest('POST', '/api/settings', data),
    onSuccess: () => {
      toast({
        title: 'Settings saved',
        description: 'Your configuration has been updated successfully.',
      });
      setHasUnsavedChanges(false);
      queryClient.invalidateQueries({ queryKey: ['/api/settings'] });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: error.message,
      });
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/test-connection', {}),
    onSuccess: (data: { success: boolean; message: string }) => {
      toast({
        title: data.success ? 'Connection successful' : 'Connection failed',
        description: data.message,
        variant: data.success ? 'default' : 'destructive',
      });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Test failed',
        description: error.message,
      });
    },
  });

  const installPolylangMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/install-polylang', {}),
    onSuccess: (data: { success: boolean; message: string }) => {
      toast({
        title: data.success ? 'Polylang ready' : 'Check failed',
        description: data.message,
        variant: data.success ? 'default' : 'destructive',
      });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Operation failed',
        description: error.message,
      });
    },
  });

  const handleChange = (field: string, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasUnsavedChanges(true);
  };

  const toggleLanguage = (langCode: string) => {
    const newLanguages = formData.targetLanguages.includes(langCode)
      ? formData.targetLanguages.filter(l => l !== langCode)
      : [...formData.targetLanguages, langCode];
    handleChange('targetLanguages', newLanguages);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  if (isLoading) {
    return (
      <div className="p-6 md:p-8 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Configuration</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure WordPress connection and translation settings
          </p>
        </div>
        {hasUnsavedChanges && (
          <Badge variant="secondary">Unsaved changes</Badge>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>WordPress Connection</CardTitle>
            <CardDescription>
              Configure your WordPress site URL and Application Password credentials
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="wpUrl">WordPress URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="wpUrl"
                    type="url"
                    placeholder="https://your-site.com"
                    value={formData.wpUrl}
                    onChange={(e) => handleChange('wpUrl', e.target.value)}
                    className="font-mono"
                    data-testid="input-wp-url"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => testConnectionMutation.mutate()}
                    disabled={testConnectionMutation.isPending || !formData.wpUrl}
                    data-testid="button-test-connection"
                  >
                    {testConnectionMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'Test'
                    )}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="wpUsername">Admin Username</Label>
                <Input
                  id="wpUsername"
                  type="text"
                  placeholder="admin"
                  value={formData.wpUsername}
                  onChange={(e) => handleChange('wpUsername', e.target.value)}
                  data-testid="input-wp-username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wpPassword">Application Password</Label>
                <div className="relative">
                  <Input
                    id="wpPassword"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="xxxx xxxx xxxx xxxx"
                    value={formData.wpPassword}
                    onChange={(e) => handleChange('wpPassword', e.target.value)}
                    className="font-mono pr-10"
                    data-testid="input-wp-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full"
                    onClick={() => setShowPassword(!showPassword)}
                    data-testid="button-toggle-password"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => installPolylangMutation.mutate()}
              disabled={installPolylangMutation.isPending}
              data-testid="button-install-polylang"
            >
              {installPolylangMutation.isPending ? (
                <Loader2 className="mr-2 w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle className="mr-2 w-4 h-4" />
              )}
              Check Polylang Plugin
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Translation Languages</CardTitle>
            <CardDescription>
              Select source language and target languages for translation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sourceLanguage">Source Language</Label>
              <select
                id="sourceLanguage"
                value={formData.sourceLanguage}
                onChange={(e) => handleChange('sourceLanguage', e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                data-testid="select-source-language"
              >
                {AVAILABLE_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.flag} {lang.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Target Languages</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {AVAILABLE_LANGUAGES.filter(l => l.code !== formData.sourceLanguage).map((lang) => (
                  <Button
                    key={lang.code}
                    type="button"
                    variant={formData.targetLanguages.includes(lang.code) ? 'default' : 'outline'}
                    onClick={() => toggleLanguage(lang.code)}
                    className="justify-start"
                    data-testid={`button-language-${lang.code}`}
                  >
                    <span className="mr-2">{lang.flag}</span>
                    {lang.name}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Gemini API Configuration</CardTitle>
            <CardDescription>
              Configure Google Gemini API for AI-powered translation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="geminiApiKey">Gemini API Key</Label>
              <div className="relative">
                <Input
                  id="geminiApiKey"
                  type={showApiKey ? 'text' : 'password'}
                  placeholder="AIza..."
                  value={formData.geminiApiKey}
                  onChange={(e) => handleChange('geminiApiKey', e.target.value)}
                  className="font-mono pr-10"
                  data-testid="input-gemini-api-key"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowApiKey(!showApiKey)}
                  data-testid="button-toggle-api-key"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="systemInstruction">System Instruction</Label>
              <Textarea
                id="systemInstruction"
                placeholder="You are a professional translator..."
                value={formData.systemInstruction}
                onChange={(e) => handleChange('systemInstruction', e.target.value)}
                rows={4}
                data-testid="textarea-system-instruction"
              />
              <p className="text-xs text-muted-foreground">
                Instructions for the AI translator to preserve HTML structure and shortcodes
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={saveMutation.isPending || !hasUnsavedChanges}
            data-testid="button-save-settings"
          >
            {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Configuration
          </Button>
        </div>
      </form>

      <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to leave this page?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay on page</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              setHasUnsavedChanges(false);
              if (pendingNavigation) {
                window.location.href = pendingNavigation;
              }
            }}>
              Leave without saving
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
