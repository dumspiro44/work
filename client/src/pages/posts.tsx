import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Edit2, Loader2 } from 'lucide-react';
import type { WordPressPost } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

export default function Posts() {
  const { toast } = useToast();
  const [selectedPosts, setSelectedPosts] = useState<number[]>([]);
  const [editingPost, setEditingPost] = useState<{ id: number; title: string; content: string } | null>(null);
  const [editedContent, setEditedContent] = useState('');

  const { data: posts, isLoading } = useQuery<WordPressPost[]>({
    queryKey: ['/api/posts'],
  });

  const translateMutation = useMutation({
    mutationFn: (postIds: number[]) => apiRequest('POST', '/api/translate', { postIds }),
    onSuccess: () => {
      toast({
        title: 'Translation started',
        description: `${selectedPosts.length} post(s) queued for translation.`,
      });
      setSelectedPosts([]);
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Translation failed',
        description: error.message,
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ postId, content }: { postId: number; content: string }) =>
      apiRequest('PATCH', `/api/posts/${postId}`, { content }),
    onSuccess: () => {
      toast({
        title: 'Post updated',
        description: 'Translation has been updated successfully.',
      });
      setEditingPost(null);
      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: error.message,
      });
    },
  });

  const togglePost = (postId: number) => {
    setSelectedPosts(prev =>
      prev.includes(postId)
        ? prev.filter(id => id !== postId)
        : [...prev, postId]
    );
  };

  const toggleAll = () => {
    if (selectedPosts.length === posts?.length) {
      setSelectedPosts([]);
    } else {
      setSelectedPosts(posts?.map(p => p.id) || []);
    }
  };

  const handleTranslate = () => {
    if (selectedPosts.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No posts selected',
        description: 'Please select at least one post to translate.',
      });
      return;
    }
    translateMutation.mutate(selectedPosts);
  };

  const openEditDialog = (post: WordPressPost) => {
    setEditingPost({
      id: post.id,
      title: post.title.rendered,
      content: post.content.rendered,
    });
    setEditedContent(post.content.rendered);
  };

  const handleSaveEdit = () => {
    if (editingPost) {
      updateMutation.mutate({ postId: editingPost.id, content: editedContent });
    }
  };

  const getTranslationStatus = (post: WordPressPost) => {
    if (post.lang && post.translations && Object.keys(post.translations).length > 0) {
      return <Badge variant="default" data-testid={`badge-status-${post.id}`}>Translated</Badge>;
    }
    if (post.lang) {
      return <Badge variant="secondary" data-testid={`badge-status-${post.id}`}>Source</Badge>;
    }
    return <Badge variant="outline" data-testid={`badge-status-${post.id}`}>Missing Lang</Badge>;
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
          <h1 className="text-2xl font-semibold">Posts Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Select posts to translate with AI
          </p>
        </div>
        <Button
          onClick={handleTranslate}
          disabled={selectedPosts.length === 0 || translateMutation.isPending}
          data-testid="button-translate-selected"
        >
          {translateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Translate Selected ({selectedPosts.length})
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b">
              <tr className="text-left">
                <th className="p-4 w-12">
                  <Checkbox
                    checked={selectedPosts.length === posts?.length && posts.length > 0}
                    onCheckedChange={toggleAll}
                    data-testid="checkbox-select-all"
                  />
                </th>
                <th className="p-4 text-xs font-semibold uppercase text-muted-foreground">ID</th>
                <th className="p-4 text-xs font-semibold uppercase text-muted-foreground">Title</th>
                <th className="p-4 text-xs font-semibold uppercase text-muted-foreground">Status</th>
                <th className="p-4 text-xs font-semibold uppercase text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {posts?.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    No posts found. Configure your WordPress connection in Settings.
                  </td>
                </tr>
              ) : (
                posts?.map((post) => (
                  <tr key={post.id} className="border-b hover-elevate" data-testid={`row-post-${post.id}`}>
                    <td className="p-4">
                      <Checkbox
                        checked={selectedPosts.includes(post.id)}
                        onCheckedChange={() => togglePost(post.id)}
                        data-testid={`checkbox-post-${post.id}`}
                      />
                    </td>
                    <td className="p-4 text-sm font-mono">{post.id}</td>
                    <td className="p-4 text-sm font-medium">{post.title.rendered}</td>
                    <td className="p-4">{getTranslationStatus(post)}</td>
                    <td className="p-4">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(post)}
                        data-testid={`button-edit-${post.id}`}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={editingPost !== null} onOpenChange={(open) => !open && setEditingPost(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Translation</DialogTitle>
            <DialogDescription>
              Make manual corrections to the translated content
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-sm font-medium">Post Title</Label>
              <p className="mt-1 text-sm text-muted-foreground">{editingPost?.title}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="content">Content</Label>
              <Textarea
                id="content"
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                rows={15}
                className="font-mono text-xs"
                data-testid="textarea-edit-content"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingPost(null)}
              data-testid="button-cancel-edit"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updateMutation.isPending}
              data-testid="button-save-edit"
            >
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
