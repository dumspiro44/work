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
-   **Menu Accessibility Control**: When WordPress is not connected, all menu items except Configuration are disabled with visual indication and a user-friendly alert message.
-   **Custom Post Types Support**: Dynamic post type loading from WordPress endpoint `/wp-json/wp/v2/types` + manual custom types entry in Settings.

## External Dependencies

-   **WordPress Integration**:
    -   WordPress REST API (v2) for posts and pages.
    -   Polylang plugin (PRO version) for multilingual capabilities, providing `lang` and `translations` fields via the REST API.
    -   Polylang language endpoint: `/wp-json/pll/v1/languages`.
    -   Authentication via WordPress Application Passwords.
    -   Supports translation of posts, pages, custom post types, menus, categories, tags, and widgets.
-   **Google Gemini AI**:
    -   `@google/genai` package for API interaction.
    -   Utilizes the `gemini-2.5-flash` model.
    -   Employs prompt engineering to ensure preservation of HTML and shortcodes during translation.
    -   API Limits: 15 requests/minute (free tier), 1500 requests/day, quota resets at 10:00 AM Kyiv time (UTC+2).
-   **Database**: PostgreSQL, specifically Neon for serverless deployment.
-   **UI Libraries**: Radix UI, Lucide React, and Tailwind CSS.

## External Integrations

**WP REST Menus Plugin (Required for Menu Translation):**
- Plugin: "WP REST Menus" by skapator (Alessandro Tesoro)
- API endpoints:
  - List all menus: `/wp-json/menus/v1/menus`
  - Get specific menu: `/wp-json/menus/v1/menus/{menu-slug}`
- Features: Returns menu items with tree structure (child_items field)
- For Polylang sites: Menus are created per language (main-menu-ru, main-menu-en, etc.)
- To find menu slug: Go to Appearance → Menus in WordPress admin, menu slug is visible in URL parameters

## Notes & Limitations

**Menu Translation Feature:**
- Requires "WP REST Menus" plugin by skapator to be installed and activated
- Polylang creates separate menus for each language (e.g., Main Menu RU, Main Menu EN)
- You need to know the correct menu slug for your language versions
- Alternative: Use WordPress admin panel to create language-specific menus manually in Polylang settings

**Menu Accessibility (Nov 28, 2025)**
- When WordPress connection is not configured, all menu items except "Configuration" are disabled
- Visual feedback: Disabled items appear grayed out with opacity-50
- Alert message in Russian: "Зайдите в конфигурацию и настройте подключение к сайту WordPress и к агенту перевода"
- Alert message in English: "Go to configuration and set up the connection to the WordPress site and translation agent"
- Dashboard shows 0 content until WordPress is connected
- Implementation: `client/src/components/app-sidebar.tsx` checks Settings via API with token auth

## Recent Updates (Dec 01, 2025) - FINAL

**✅ Custom Post Types Support with Manual Entry (Dec 01, 2025)**:
1. **Dynamic Post Type Loading**
   - ✅ Backend endpoint `/api/post-types` fetches types from WordPress `/wp-json/wp/v2/types`
   - ✅ Filters out non-viewable types (attachment, etc.)
   - ✅ Returns defaults `['post', 'page']` if WordPress not connected or fetch fails
   - Файлы: `server/routes.ts` (lines 819-861)

2. **Manual Custom Post Types Entry**
   - ✅ New field `customPostTypes` in Settings database schema
   - ✅ Users can add custom types manually in Configuration page (e.g., "cat_news")
   - ✅ Frontend merges API types + manual custom types from Settings
   - ✅ All custom types automatically appear in "Тип контента" filter with full functionality
   - Файлы: `shared/schema.ts`, `client/src/pages/posts.tsx`, `client/src/pages/settings.tsx`

3. **Backend Functionality**
   - ✅ Automatic custom type detection in `WordPressService.createTranslation`
   - ✅ Automatic taxonomy copying for each post type using `get_object_taxonomies`
   - ✅ Polylang compatibility check via `/wp-json/pll/v1/post_types/{type}`
   - ✅ Internal link replacement for all post types
   - Файлы: `server/services/wordpress.ts`, `server/services/content-extractor.ts`

## Fixed Issues (Dec 01, 2025)

**Fixed Authorization in POST-TYPES Endpoint**:
- ✅ Removed broken `wpService['getAuthHeader']?.()` call
- ✅ Now uses proper Basic Auth header directly
- ✅ Added detailed logging for debugging

## How to Use Custom Post Types

1. Go to Configuration/Settings page
2. Find "Custom Post Types" field
3. Enter custom post type slug (e.g., "cat_news")
4. Save settings
5. Custom post types will automatically appear in the "Тип контента" (Content Type) filter
6. All functionality (translation, internal link replacement, taxonomy copying) works automatically for custom types
7. Custom types must be marked as translatable in Polylang settings for optimal results

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
