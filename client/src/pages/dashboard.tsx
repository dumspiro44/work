import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, Languages, Clock, Zap } from 'lucide-react';
import type { DashboardStats } from '@/types';

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ['/api/stats'],
  });

  const statCards = [
    {
      title: 'Total Posts',
      value: stats?.totalPosts ?? 0,
      icon: FileText,
      description: 'WordPress posts',
    },
    {
      title: 'Translated',
      value: stats?.translatedPosts ?? 0,
      icon: Languages,
      description: 'Completed translations',
    },
    {
      title: 'Pending Jobs',
      value: stats?.pendingJobs ?? 0,
      icon: Clock,
      description: 'In queue',
    },
    {
      title: 'Tokens Used',
      value: stats?.tokensUsed ?? 0,
      icon: Zap,
      description: 'Gemini API tokens',
    },
  ];

  return (
    <div className="p-6 md:p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Overview of your WordPress translation automation
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat) => (
          <Card key={stat.title} data-testid={`card-stat-${stat.title.toLowerCase().replace(/\s+/g, '-')}`}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-10 w-24" />
              ) : (
                <>
                  <div className="text-3xl font-bold" data-testid={`text-${stat.title.toLowerCase().replace(/\s+/g, '-')}-value`}>
                    {stat.value.toLocaleString()}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {stat.description}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Getting Started</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-medium">1. Configure WordPress Connection</h3>
            <p className="text-sm text-muted-foreground">
              Go to Configuration page and set up your WordPress URL, credentials, and target languages.
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-medium">2. Select Posts to Translate</h3>
            <p className="text-sm text-muted-foreground">
              Navigate to Posts Management to view your WordPress posts and select which ones to translate.
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-medium">3. Monitor Translation Progress</h3>
            <p className="text-sm text-muted-foreground">
              Track your translation jobs in real-time on the Translation Jobs page.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
