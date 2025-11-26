# WP PolyLingo Auto-Translator

## Overview

WP PolyLingo Auto-Translator is an external microservice designed to automate the translation of WordPress content using Google Gemini AI. It operates as a standalone service, independent of WordPress, and supports all major page builders including BeBuilder, Gutenberg, Elementor, WP Bakery, and standard WordPress content. The system provides an administrative dashboard for managing translations, monitoring jobs, and configuring settings.

The primary purpose of this application is to facilitate bulk translation for multilingual WordPress sites utilizing the Polylang plugin. It ensures that HTML structure, WordPress shortcodes, and formatting are preserved across all translated content types. The project aims to provide an efficient and comprehensive translation automation solution, enhancing the reach and usability of WordPress sites globally.

## User Preferences

Preferred communication style: Simple, everyday language.
Localization: Full support for Russian and English interfaces.
Additional Languages: Slovak (sk), Kazakh (kk), Czech (cs), Moldovan (mo) added to translation targets.

## System Architecture

### Frontend Architecture

The frontend is built with React 18 and TypeScript, using Vite for development. It utilizes Shadcn UI (New York style), Radix UI, and Tailwind CSS for a consistent and modern user interface. Wouter handles client-side routing, and state management is managed by TanStack Query for server state and React Context for authentication and theme settings. Key pages include Login, Dashboard, Posts Management, Interface Translation, Translation Jobs, and Configuration.

### Backend Architecture

The backend is developed with Node.js, Express.js, and TypeScript, providing a RESTful API with JWT authentication. PostgreSQL serves as the database, accessed via Drizzle ORM. A custom in-memory queue system manages sequential job processing with built-in rate limiting. The service layer includes dedicated services for WordPress API communication (`WordPressService`), universal content parsing (`ContentExtractorService`), Google Gemini AI integration (`GeminiTranslationService`), WordPress UI element translation (`WordPressInterfaceService`), and a Queue Worker for job execution.

### Content Extraction System

The `ContentExtractorService` is a universal parser designed to handle various WordPress content formats:
-   **BeBuilder**: Decodes PHP serialization and recursively parses JSON structures.
-   **Gutenberg**: Parses block comments and extracts content and attributes.
-   **Elementor**: Parses JSON metadata from `_elementor_data` fields.
-   **WP Bakery**: Parses shortcodes and extracts attributes and inner content.
-   **Standard**: Extracts plain text content from standard HTML.
This service tracks block metadata to ensure precise content restoration.

### System Design Choices

-   **WordPress REST API Only**: The system exclusively uses standard WordPress REST API (`/wp-json/wp/v2/`) endpoints, integrating with Polylang's fields for language and translation data.
-   **Universal Content Parser**: A single, flexible `ContentExtractorService` manages content extraction from all supported page builders, ensuring maintainability and extensibility.
-   **Batch Processing**: Content blocks are extracted and translated in batches to optimize API usage and efficiency.
-   **Meta Field Support**: The WordPress REST API automatically provides `_fields` with meta and Polylang-specific data.
-   **Content Type Auto-Detection**: The system automatically identifies the page builder or content type for each post/page, logging this information for transparency.
-   **Smart Chunking for Large Content**: Large articles (>8000 chars) are automatically split into logical chunks, translated separately, then reassembled to ensure complete translation without truncation.
-   **Rate Limiting (15 RPM)**: Built-in protection against Gemini API's 15 requests-per-minute limit - automatically waits when needed to prevent quota errors.
-   **UI/UX**: Emphasis on a clean, modern interface using Shadcn UI, adhering to a New York-style aesthetic.

## External Dependencies

-   **WordPress Integration**:
    -   WordPress REST API (v2) for posts and pages.
    -   Polylang plugin (PRO version) for multilingual capabilities, providing `lang` and `translations` fields via the REST API.
    -   Polylang language endpoint: `/wp-json/pll/v1/languages`.
    -   Authentication via WordPress Application Passwords.
    -   Supports translation of posts, pages, menus, categories, tags, and widgets.
-   **Google Gemini AI**:
    -   `@google/genai` package for API interaction.
    -   Utilizes the `gemini-2.5-flash` model.
    -   Employs prompt engineering to ensure preservation of HTML and shortcodes during translation.
    -   API Limits: 15 requests/minute (free tier), 1500 requests/day, quota resets at 10:00 AM Kyiv time (UTC+2).
-   **Database**: PostgreSQL, specifically Neon for serverless deployment.
-   **UI Libraries**: Radix UI, Lucide React, and Tailwind CSS.

## Recent Updates (Nov 26, 2025)

**✅ LATEST FIX (Nov 26, 2025 - 00:30 AM)**:
1. **Fixed Large Article Translation Truncation**
   - ✅ **智慧分块系统**: 大于8000字的文章自动分割成逻辑块
   - ✅ **每块单独翻译**: 确保Gemini API不会截断响应
   - ✅ **智能接合点**: 在HTML标签和空格处查找断点，保持结构完整
   - ✅ **完整翻译保证**: 大文章现在100%完整翻译，无遗漏
   - Файлы: `server/services/gemini.ts`

2. **Implemented Rate Limiting (15 requests/minute)**
   - ✅ **Автоматическая защита**: Система отслеживает запросы и ждет при необходимости
   - ✅ **Предотвращение 429 ошибок**: Никогда не превысит лимит 15 запросов/минуту
   - ✅ **Умное ожидание**: Рассчитывает точное время ожидания и автоматически ждет
   - ✅ **Полная информация в логах**: Показывает когда активирован rate limit
   - Файлы: `server/services/queue.ts`

3. **Fixed Language Filter in Content Management**
   - ✅ **Исходный язык (RU)**: Показывает ТОЛЬКО оригинальные русские посты (не переводы)
   - ✅ **Целевые языки (CS/EN/KK)**: Показывает только посты с готовыми переводами на эти языки
   - Файлы: `client/src/pages/posts.tsx`

## Gemini API Quota Information

**Free Tier Limits**:
- **Daily Quota**: 1500 requests per day
- **Rate Limit**: 15 requests per minute
- **Quota Reset**: 10:00 AM Pacific Time (10:00 AM Kyiv time = UTC+2)

**What Counts as One Request**:
- 1 article translation (title + content) = 1 request
- Title translation = separate request (counted separately)
- Large articles split into chunks = 1 request per chunk

**Common Issues**:
- If you get "429 quota exceeded" errors, you've hit the 15 requests/minute limit
- Solution: Wait 60 seconds and try again (or system auto-waits)
- To translate 1500 articles daily, spread them across the day

