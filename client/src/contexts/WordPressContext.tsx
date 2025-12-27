import { createContext, useContext, ReactNode, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import type { TranslationJob, Settings } from '@shared/schema';
import type { WordPressPost, DashboardStats } from '@/types';

interface WordPressContextType {
  // Posts
  posts: WordPressPost[];
  postsLoading: boolean;
  
  // Jobs
  jobs: TranslationJob[];
  jobsLoading: boolean;
  
  // Settings
  settings: Settings | undefined;
  settingsLoading: boolean;
  
  // Archive content
  archiveContent: any[];
  archiveContentLoading: boolean;
  
  // Interface data
  interfaceStrings: any[];
  interfaceTranslations: any[];
  interfaceDataLoading: boolean;
  
  // Correction stats
  correctionStats: any;
  correctionStatsLoading: boolean;
  
  // SEO posts
  seoPosts: WordPressPost[];
  seoPostsLoading: boolean;
  
  // Dashboard stats
  stats: DashboardStats | undefined;
  statsLoading: boolean;
  
  // Global loading state
  isInitializing: boolean;
}

const WordPressContext = createContext<WordPressContextType | undefined>(undefined);

export function WordPressProvider({ children }: { children: ReactNode }) {
  const [isInitializing, setIsInitializing] = useState(true);

  // Load all data in parallel
  const { data: posts = [], isLoading: postsLoading } = useQuery<WordPressPost[]>({
    queryKey: ['/api/posts'],
  });

  const { data: jobs = [], isLoading: jobsLoading } = useQuery<TranslationJob[]>({
    queryKey: ['/api/jobs'],
  });

  const { data: settings, isLoading: settingsLoading } = useQuery<Settings>({
    queryKey: ['/api/settings'],
  });

  const { data: archiveData, isLoading: archiveContentLoading } = useQuery({
    queryKey: ['/api/archive/all-content'],
    queryFn: async () => {
      try {
        const res = await apiRequest('GET', '/api/archive/all-content');
        return res.content || [];
      } catch {
        return [];
      }
    },
  });

  const { data: interfaceStrings = [], isLoading: interfaceStringsLoading } = useQuery({
    queryKey: ['/api/interface-strings'],
  });

  const { data: interfaceTranslations = [], isLoading: interfaceTranslationsLoading } = useQuery({
    queryKey: ['/api/interface-translations'],
  });

  const { data: correctionStats, isLoading: correctionStatsLoading } = useQuery({
    queryKey: ['/api/content-correction/stats'],
  });

  const { data: seoPosts = [], isLoading: seoPostsLoading } = useQuery<WordPressPost[]>({
    queryKey: ['/api/seo-posts'],
  });

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ['/api/stats'],
  });

  // Set isInitializing to false once all data is loaded
  useEffect(() => {
    const allLoaded = !postsLoading && !jobsLoading && !settingsLoading && !archiveContentLoading && !interfaceStringsLoading && !interfaceTranslationsLoading && !correctionStatsLoading && !seoPostsLoading && !statsLoading;
    if (allLoaded) {
      setIsInitializing(false);
    }
  }, [postsLoading, jobsLoading, settingsLoading, archiveContentLoading, interfaceStringsLoading, interfaceTranslationsLoading, correctionStatsLoading, seoPostsLoading, statsLoading]);

  const value: WordPressContextType = {
    posts,
    postsLoading,
    jobs,
    jobsLoading,
    settings,
    settingsLoading,
    archiveContent: archiveData || [],
    archiveContentLoading,
    interfaceStrings,
    interfaceTranslations,
    interfaceDataLoading: interfaceStringsLoading || interfaceTranslationsLoading,
    correctionStats,
    correctionStatsLoading,
    seoPosts,
    seoPostsLoading,
    stats,
    statsLoading,
    isInitializing,
  };

  return (
    <WordPressContext.Provider value={value}>
      {children}
    </WordPressContext.Provider>
  );
}

export function useWordPress() {
  const context = useContext(WordPressContext);
  if (!context) {
    throw new Error('useWordPress must be used within WordPressProvider');
  }
  return context;
}
