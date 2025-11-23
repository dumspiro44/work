# WP PolyLingo Auto-Translator

## Overview

WP PolyLingo Auto-Translator is an external microservice application that automates the translation of WordPress content using Google Gemini AI. The system operates independently from WordPress as a standalone service, providing an admin dashboard to manage translations, monitor jobs, and configure settings. It connects to WordPress sites via the REST API and handles translation workflows through an asynchronous queue system.

The application serves as a translation automation tool for multilingual WordPress sites using the Polylang plugin, enabling bulk translation operations while preserving HTML structure, WordPress shortcodes, and formatting.

## User Preferences

Preferred communication style: Simple, everyday language.
Localization: Full support for Russian and English interfaces.
Additional Languages: Slovak (sk), Kazakh (kk), Czech (cs), Moldovan (mo) added to translation targets.

## Recent Updates (Nov 23, 2025)

**Interface Translation v2 - Complete Redesign:**
1. **Batch Translation**: Implemented batch API calls (1 per language) instead of per-element calls - solves Google Gemini free tier quota (10 req/min)
2. **Compact Accordion UI**: All target languages displayed in collapsible accordion
   - Languages collapsed by default to keep page compact
   - Click language name to expand and see translations
   - Translation count displayed per language
3. **Enhanced Polylang Integration**:
   - Categories/Tags: Via `/wp-json/pll/v1/terms/{taxonomy}/{id}/translations`
   - Pages: Via `/wp-json/pll/v1/posts/{id}/translations`
   - Fallback to standard WordPress API if Polylang unavailable
   - Menu items: Marked as processed (may need manual sync)
   - Widgets: Stored for reference (manual WordPress translation needed)
4. **Real WordPress Data**: Fetches actual interface elements from your WordPress site
   - Menu items (top-level navigation)
   - Categories and tags
   - Page titles
   - Widget titles
5. **Inline Publishing**: "Publish" button in each language's header for quick publishing

**Key Features**:
- Efficient batch translation saves API quota and time
- Responsive UI prevents long page scrolling
- Auto-detection of WordPress source language
- Edit translations directly in accordion before publishing
- Proper Polylang REST API integration for WordPress compatibility

**Earlier Updates**:
- Removed duplicate "Publish to WordPress" button from Posts Management
- Fixed dashboard stats to count translated posts from database
- Enhanced Gemini translation service with markdown cleanup
- Polylang plugin status checker with auto-install instructions

## System Architecture

### Frontend Architecture

**Framework**: React 18 with TypeScript using Vite as the build tool

**UI Components**: Shadcn UI library (New York style) built on Radix UI primitives with Tailwind CSS for styling

**Routing**: Wouter for lightweight client-side routing

**State Management**: 
- TanStack Query (React Query) for server state and data fetching
- React Context API for authentication and theme management
- Local component state for UI interactions

**Design System**:
- Dark/light theme support with system preference detection
- Responsive design with mobile-first approach
- Sidebar navigation that collapses to hamburger menu on mobile
- Typography based on Inter and JetBrains Mono fonts
- Consistent spacing using Tailwind's spacing scale

**Key Pages**:
- **Login**: JWT-based authentication entry point
- **Dashboard**: Overview statistics (total posts, translated posts, pending jobs, token usage), localized in EN/RU
- **Posts Management**: 
  - Content filtering (Posts, Pages, All)
  - Import WordPress content with pagination (10 items per page)
  - Bulk translation with multi-select checkbox
  - Edit translation modal with HTML editor for manual corrections
  - Polylang status checker with auto-install instructions
  - Single "Publish to WordPress" button per post in actions column
  - Full localization support (EN/RU)
- **Interface Translation**: Translate WordPress UI elements (menus, categories, tags, pages) with batch optimization
  - **Workflow**:
    1. Click "Translate Interface to All Languages" button
    2. System fetches all interface elements from WordPress (menus, categories, tags, pages, widgets)
    3. System translates all elements in batches (1 API call per language, not per element) using Google Gemini
    4. Click on language name in accordion to expand and view/edit translations for that language
    5. Manually edit any translations if needed (e.g., fix terminology, context-specific words)
    6. Click "Publish" button next to language name to push translations to WordPress via Polylang REST API
  - **Features**:
    - Compact accordion UI - all languages collapsed by default, click to expand
    - Shows translation count per language
    - Batch translation solves Google Gemini API quota (10 req/min free tier)
    - Proper Polylang integration for categories, tags, pages
    - Fallback to standard WordPress API if Polylang API unavailable
    - Menu items and widgets marked as processed (may need manual WordPress sync)
  - **Interface Elements Translated**:
    - Menu items (top-level navigation items)
    - Categories and tags (post taxonomies)
    - Pages (static page titles)
    - Widgets (widget titles)
  - **Supported Languages**: Configured in Settings (Arabic, Russian, French, Turkish, etc.)
- **Translation Jobs**: Real-time job monitoring with progress indicators for post/page translations
- **Configuration**: Settings form for WordPress credentials, API keys, language selection

### Backend Architecture

**Runtime**: Node.js with Express.js framework

**Language**: TypeScript for type safety

**API Design**: RESTful API endpoints with JWT-based authentication middleware

**Authentication**: 
- JWT tokens for session management (7-day expiration)
- Bcrypt for password hashing
- Bearer token authorization headers
- Default admin account created on initialization

**Database ORM**: Drizzle ORM with PostgreSQL dialect

**Queue System**: 
- Custom in-memory queue implementation for translation jobs
- Processes jobs sequentially to manage API rate limits
- Real-time job status updates (PENDING, PROCESSING, COMPLETED, FAILED)

**Service Layer**:
- WordPressService: Handles WordPress REST API communication using Basic Authentication
  - getPosts(): Fetch all WordPress posts with type field
  - getPages(): Fetch all WordPress pages with type field
  - checkPolylangPlugin(): Verify Polylang plugin installation
  - createTranslation(): Create and link translations via Polylang API
  - updatePost(): Update post content
  - detectWordPressLanguage(): Auto-detect source language from Polylang or WordPress settings
- WordPressInterfaceService: Manages WordPress interface element translation
  - fetchInterfaceElements(): Retrieve menus, categories, tags, pages, widgets from WordPress
  - fetchMenus(): Get top-level menu items
  - fetchCategories(): Get all post categories
  - fetchTags(): Get all post tags
  - fetchPages(): Get page titles
  - fetchWidgets(): Get widget titles
  - publishTranslationToWordPress(): Publish translations to WordPress via Polylang API with fallback
- GeminiTranslationService: Wraps Google Gemini API for content and interface translation
  - translateContent(): Translate text with markdown cleanup and prompt engineering to preserve HTML/shortcodes
  - Batch translation support for interface elements (multiple items in single API call)
- Queue processing worker for background job execution

**Database Schema**:
- `admins`: User authentication credentials
- `settings`: Singleton configuration table for WordPress connection and API keys
- `translation_jobs`: Job tracking with status, progress, and token usage
- `logs`: Detailed execution logs linked to jobs

### External Dependencies

**WordPress Integration**:
- WordPress REST API (v2) for content management
- Application Passwords for authentication
- Polylang plugin API for translation linking and language management
- Endpoints used: 
  - `/wp-json/wp/v2/posts` - Posts management (per_page=100)
  - `/wp-json/wp/v2/pages` - Pages management (per_page=100)
  - `/wp-json/wp/v2/menu-items` - Menu items retrieval (per_page=100)
  - `/wp-json/wp/v2/categories` - Categories retrieval (per_page=100)
  - `/wp-json/wp/v2/tags` - Tags retrieval (per_page=100)
  - `/wp-json/wp/v2/widgets` - Widgets retrieval (per_page=100)
  - `/wp-json/pll/v1/languages` - Polylang language list
  - `/wp-json/pll/v1/posts/{id}/translations` - Link post/page translations
  - `/wp-json/pll/v1/terms/{taxonomy}/{id}/translations` - Link category/tag translations
  - `/wp-json/wp/v2/users/me` - Authentication check

**Google Gemini AI**:
- Package: `@google/genai`
- Model: gemini-2.5-flash
- Purpose: Content and title translation with markdown cleanup
- Prompt engineering to preserve HTML tags, classes, IDs, and WordPress shortcodes
- Response processing removes **markdown** formatting and explanatory text

**Database**:
- PostgreSQL via Neon serverless driver (`@neondatabase/serverless`)
- WebSocket connection support for serverless environments
- Connection pooling for performance
- Drizzle ORM for schema management and migrations

**UI Component Libraries**:
- Radix UI primitives for accessible components
- Lucide React for icons
- Tailwind CSS for utility-first styling
- Class Variance Authority (CVA) for component variants

**Build & Development**:
- Vite for fast development server and optimized production builds
- TypeScript compiler for type checking
- ESBuild for server-side bundling
- Hot module replacement in development

**Deployment Dependencies**:
- Environment variables for configuration (DATABASE_URL, GEMINI_API_KEY, SESSION_SECRET)
- Static file serving in production mode
- Health checks for database connectivity
- CORS and security middleware

**Key Technical Decisions**:

1. **Monorepo Structure**: Client and server code in same repository with shared schema types for type safety across the stack

2. **Queue Over External Service**: Custom in-memory queue chosen over Redis/BullMQ for simplicity, suitable for single-instance deployments

3. **JWT Over Sessions**: Stateless authentication enables easier horizontal scaling and mobile/API client support

4. **Drizzle Over Prisma**: Lighter weight ORM with better TypeScript integration and SQL-like syntax

5. **REST Over GraphQL**: Simpler implementation for straightforward CRUD operations and WordPress API compatibility

6. **Single-page Application**: React SPA with client-side routing for smooth user experience, Nginx fallback for proper routing

7. **Database Stats Calculation**: Translatedposts count prioritizes database records (completed jobs) over WordPress API to ensure accurate stats regardless of connection status

8. **Batch Translation for Interface Elements**: All interface elements for a single language are translated in one API call instead of individual requests, respecting Google Gemini API quota (10 req/min free tier)

## User Instructions: Interface Translation

### How to Translate WordPress Interface Elements

#### Step 1: Navigate to Interface Translation
- Click on "Interface Translation" in the sidebar menu
- You'll see all your target languages listed in an accordion interface

#### Step 2: Translate Interface Elements
1. Click "Translate Interface to All Languages" button
2. System will:
   - Fetch all interface elements from your WordPress site (menus, categories, tags, pages, widgets)
   - Translate them to all target languages using Google Gemini AI
   - Process all translations for each language in one batch (1 API call per language)
3. Wait for the translation to complete (you'll see a success notification)

#### Step 3: Review and Edit Translations
1. Click on any language name in the accordion to expand it
2. You'll see:
   - Number of translations ready for that language
   - List of all translated strings with original and translated versions
3. Edit any translations if needed:
   - Fix terminology that needs context-specific adjustments
   - Correct any AI translation issues
4. Click "Save Translations" to save your edits

#### Step 4: Publish to WordPress
1. Click the "Publish" button next to the language name
2. System will push translations to WordPress via Polylang REST API:
   - **Categories/Tags**: Published via Polylang terms API (with fallback to standard WP API)
   - **Pages**: Published via Polylang posts API (with fallback to standard WP API)
   - **Menu Items**: Marked as processed (Polylang sync may need manual verification)
   - **Widgets**: Stored for reference (requires manual WordPress widget translation)
3. You'll see a notification when publishing is complete

#### Step 5: Verify in WordPress
1. Go to your WordPress site
2. Switch to a different language using Polylang language switcher
3. Check that:
   - Category and tag names are translated
   - Page titles are translated
   - Menu items display in the target language
   - Widgets show original titles (manual update needed)

### Important Notes
- **Batch Translation**: Translating all elements for one language takes only 1 API call, making it efficient and avoiding Gemini API quotas
- **Auto-Detection**: System automatically detects your WordPress source language from Polylang settings
- **Manual Edits**: Always review translations before publishing - edit in the accordion to fix any AI translation issues
- **Polylang Integration**: Works seamlessly with Polylang plugin for proper translation linking
- **Manual Steps**: Menu items and widgets may need manual verification in WordPress after publishing
