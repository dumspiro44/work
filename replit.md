# WP PolyLingo Auto-Translator

## Overview

WP PolyLingo Auto-Translator is an external microservice application that automates the translation of WordPress content using Google Gemini AI. The system operates independently from WordPress as a standalone service, providing an admin dashboard to manage translations, monitor jobs, and configure settings. It connects to WordPress sites via the REST API and handles translation workflows through an asynchronous queue system.

The application serves as a translation automation tool for multilingual WordPress sites using the Polylang plugin, enabling bulk translation operations while preserving HTML structure, WordPress shortcodes, and formatting.

## User Preferences

Preferred communication style: Simple, everyday language.
Localization: Full support for Russian and English interfaces.
Additional Languages: Slovak (sk), Kazakh (kk), Czech (cs), Moldovan (mo) added to translation targets.

## Recent Updates (Nov 23, 2025)

**Interface Translation Enhancement:**
1. Added support for interface element translation (menus, categories, tags, pages, widgets)
2. Implemented batch translation for interface elements - 1 API call per language instead of 1 per element (solves Google Gemini quota limits)
3. Proper Polylang API integration:
   - Categories/Tags: Use `/wp-json/pll/v1/terms/{taxonomy}/{id}/translations` with fallback to standard WP API
   - Pages: Use `/wp-json/pll/v1/posts/{id}/translations` with fallback
   - Menu items: Marked as processed (Polylang sync may need manual intervention)
   - Widgets: Stored but require manual WordPress widget translation
4. Interface elements fetched from WordPress (menus, categories, tags, pages from real WordPress site)
5. New Interface Translation page for bulk translation of UI elements

**Earlier Fixes:**
1. Removed duplicate "Publish to WordPress" button from Posts Management - now single button in actions column
2. Fixed dashboard stats to count translated posts from database (not just WordPress API)
3. Removed JSX backtick issues (template literals replaced with string concatenation for dynamic attributes)
4. Enhanced Gemini translation service with markdown cleanup and explanatory text removal
5. Cleaned up old translation jobs from database for fresh start

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
- Login: JWT-based authentication entry point
- Dashboard: Overview statistics (total posts, translated posts, pending jobs, token usage), localized in EN/RU
- Posts Management: 
  - Content filtering (Posts, Pages, All)
  - Import WordPress content with pagination (10 items per page)
  - Bulk translation with multi-select checkbox
  - Edit translation modal with HTML editor for manual corrections
  - Polylang status checker with auto-install instructions
  - Single "Publish to WordPress" button per post in actions column
  - Full localization support (EN/RU)
- Translation Jobs: Real-time job monitoring with progress indicators (publish removed from here)
- Configuration: Settings form for WordPress credentials, API keys, language selection

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
- GeminiTranslationService: Wraps Google Gemini API for content translation with markdown cleanup
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
  - `/wp-json/pll/v1/languages` - Polylang language list
  - `/wp-json/pll/v1/posts/{id}/translations` - Link translations
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
