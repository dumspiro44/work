export interface WordPressPost {
  id: number;
  title: {
    rendered: string;
  };
  content: {
    rendered: string;
  };
  status: string;
  type: 'post' | 'page';
  lang?: string;
  translations?: Record<string, number>;
}

export interface DashboardStats {
  totalPosts: number;
  totalPages?: number;
  translatedPosts: number;
  pendingJobs: number;
  tokensUsed: number;
  languageCoverage?: Record<string, { count: number; percentage: number }>;
}

export interface Language {
  code: string;
  name: string;
  flag: string;
}

export const AVAILABLE_LANGUAGES: Language[] = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'it', name: 'Italian', flag: '🇮🇹' },
  { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
  { code: 'ru', name: 'Russian', flag: '🇷🇺' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', flag: '🇰🇷' },
  { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
  { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
  { code: 'pl', name: 'Polish', flag: '🇵🇱' },
  { code: 'uk', name: 'Ukrainian', flag: '🇺🇦' },
  { code: 'tr', name: 'Turkish', flag: '🇹🇷' },
  { code: 'sk', name: 'Slovak', flag: '🇸🇰' },
  { code: 'kk', name: 'Kazakh', flag: '🇰🇿' },
  { code: 'cs', name: 'Czech', flag: '🇨🇿' },
  { code: 'mo', name: 'Moldovan', flag: '🇲🇩' },
];
