# WP PolyLingo Auto-Translator

## Overview

WP PolyLingo Auto-Translator is an external microservice application that automates the translation of WordPress content using Google Gemini AI. The system operates independently from WordPress as a standalone service, supporting ALL popular page builders: BeBuilder, Gutenberg, Elementor, WP Bakery, and standard WordPress content. It provides an admin dashboard for managing translations, monitoring jobs, and configuring settings.

The application serves as a translation automation tool for multilingual WordPress sites using the Polylang plugin, enabling bulk translation operations while preserving HTML structure, WordPress shortcodes, and formatting across all content types.

## User Preferences

Preferred communication style: Simple, everyday language.
Localization: Full support for Russian and English interfaces.
Additional Languages: Slovak (sk), Kazakh (kk), Czech (cs), Moldovan (mo) added to translation targets.

## Recent Updates (Nov 25, 2025 - CRITICAL FIX: HTML ENCODING ISSUE)

**🔧 CRITICAL BUG FIX (Nov 25, 2025 - 8:21 PM)**:
1. **Fixed HTML Entity Encoding** - WordPress rejection of translations with "Все изображения должны иметь заполненное поле 'alt'" error
   - **Root Cause**: Gemini API returns HTML with encoded entities (`&lt;`, `&gt;`, `&amp;`) instead of literal characters
   - **Solution**: Added `decode()` function from `html-entities` package before sending to WordPress
   - **Result**: alt-attributes and all HTML tags now preserved correctly during publication
   - **Locations Fixed**: Both single publish and "Publish All (N)" endpoints now decode HTML entities

**✅ PREVIOUS FIXES (Nov 25, 2025)**:
1. **Multi-Language Publishing** - NEW button "Publish All (N)" publishes ALL completed translations at once instead of one by one
   - System detects number of completed translations
   - Shows "Publish" for 1 translation, "Publish All (2+)" for multiple
   - All translations published simultaneously to WordPress via Polylang
2. **Correct Statistics Calculation** - Fixed dashboard stats showing wrong numbers
   - Now uses WordPress REST API `X-WP-Total` header for accurate counts
   - Previously showed only first 100 posts (now correctly shows all 2715+ posts)
   - Added separate counting for pages (now shows 15 pages correctly)
   - Added `getPostsCount()` and `getPagesCount()` methods to WordPress service
3. **Dashboard Improvements**:
   - "ВСЕГО КОНТЕНТА" now shows total posts + pages (previously showed only first page)
   - Accurate stats without loading all content into memory

### Polylang PRO REST API Architecture (Nov 25, 2025):
**IMPORTANT**: Polylang PRO does NOT provide custom REST endpoints for translations.
- ❌ Do NOT use: `/wp-json/pll/v1/posts/`, `/wp-json/pll/v1/pages/`, `/polylang/v1/post-translations/`
- ✅ Use ONLY: `/wp-json/wp/v2/posts/` and `/wp-json/wp/v2/pages/` (standard WordPress REST API)
- ✅ Use ONLY: `/pll/v1/languages` (the ONLY official Polylang endpoint)
- ✅ Polylang automatically adds `lang` and `translations` fields to each post/page via WordPress REST API
- ✅ All translation operations use standard WordPress REST API with Polylang field integration

### How to Publish Translations (Correct Architecture):
1. Get source post: `GET /wp-json/wp/v2/posts/{id}` - returns fields with `lang` and `translations`
2. Check if translation exists: Look in `translations[target_lang]` field
3. If translation exists: `POST /wp-json/wp/v2/posts/{existing_id}` with new title/content
4. If translation doesn't exist: `POST /wp-json/wp/v2/posts/` with:
   - `title`, `content`, `status: 'publish'`, `lang: 'target_lang'`
   - `translations: { source_lang: source_id }`
5. **NEW**: Use `/api/posts/{postId}/publish-all` endpoint to publish ALL completed translations for a post simultaneously

### Previous Fixes (Nov 24, 2025):
1. **Image URL Preservation** - Fixed URL regex to exclude quotes (", '), preserving underscores in filenames like `Screenshot_1-5.png`
2. **Fresh Data Loading** - Added cache busting (staleTime: 0, gcTime: 0) for settings queries - prevents old cached data from showing
3. **Auto-Diagnostics** - Page builders detection now runs automatically on settings page load - always shows current status
4. **Title Translation Fix** - Simplified title translation logic to accept all non-empty translations from Gemini (removed overly strict filters that blocked valid translations)
5. **Production Ready** - All features tested and working correctly across all page builders and languages
6. **Translation Preview Modal** - "Preview for publishing" button in translation editor showing exactly how content will look in WordPress
7. **Translation Editor** - CKEditor 5 (Open-source)

### Phase 1: Content Extraction (COMPLETED)
1. **ContentExtractorService** - Universal content parser supporting:
   - ✅ **BeBuilder (Muffin Builder)** - Decodes PHP serialization, extracts text only
   - ✅ **Gutenberg** - Parses block comments and attributes
   - ✅ **Elementor** - Parses JSON metadata
   - ✅ **WP Bakery** - Parses shortcodes and attributes
   - ✅ **Standard HTML** - Extracts clean text content
   - ✅ **Block Metadata Tracking** - Stores location info for each extracted block

### Phase 2: Content Restoration (COMPLETED)
2. **ContentRestorerService** - Reconstructs translated content back to original structures:
   - ✅ **BeBuilder Restoration** - Re-encodes translated text back into PHP serialization
   - ✅ **Gutenberg Restoration** - Reconstructs block comments with translated content
   - ✅ **Elementor Restoration** - Restores JSON metadata with translations
   - ✅ **WP Bakery Restoration** - Reconstructs shortcodes with translated content
   - ✅ **Standard Restoration** - Uses translated content directly
   - ✅ **Metadata-Driven Restoration** - Uses blockMetadata for precise placement

3. **Smart Content Filtering** - Removes UI elements:
   - ✅ Filters structural elements: Section, Wrap, Column, Placeholder, Image, Row, Grid, Divider, Spacer
   - ✅ Removes shortcodes: `[divider height="..."]`
   - ✅ Removes UI labels: "Button", "Les mer", "Читать далее", "Learn more", etc.
   - ✅ Preserves actual content: titles, descriptions, paragraphs
   - ✅ Applies to ALL page builders uniformly

4. **BeBuilder Implementation Details:**
   - Data format: base64-encoded PHP serialization
   - Decoding: `Buffer.from(base64, 'base64').toString('utf-8')` → `unserialize(decoded)`
   - Extraction: Recursive traversal of nested JSON structure
   - Language: Extracts original language content directly from page builder data
   - Verified working: Norwegian pages translate correctly to Russian/other languages

5. **End-to-End Workflow:**
   ```
   WordPress Page (BeBuilder/Gutenberg/etc)
        ↓
   ContentExtractor decodes & parses metadata + tracks blocks
        ↓
   Smart filter removes UI elements & structural markup
        ↓
   Clean text sent to Gemini AI
        ↓
   Translation stored in database with blockMetadata
        ↓
   User reviews translations
        ↓
   ContentRestorer reconstructs original structures
        ↓
   Polylang translation post created with restored content (via WordPress REST API)
   ```

6. **Queue System:**
   - Sequential job processing
   - Automatic content type detection
   - Job status tracking in database
   - Detailed logging of translations processed

## System Architecture

### Frontend Architecture

**Framework**: React 18 with TypeScript using Vite

**UI Components**: Shadcn UI (New York style) with Radix UI and Tailwind CSS

**Routing**: Wouter for lightweight client-side routing

**State Management**: TanStack Query for server state, React Context for auth/theme

**Key Pages**:
- **Login**: JWT-based authentication
- **Dashboard**: Overview statistics (posts, translations, jobs, tokens)
- **Posts Management**: Import, filter, bulk translate, edit, publish content
- **Interface Translation**: Translate UI elements (menus, categories, tags, pages)
- **Translation Jobs**: Real-time job monitoring with progress
- **Configuration**: WordPress credentials, API keys, language selection

### Backend Architecture

**Runtime**: Node.js with Express.js and TypeScript

**API Design**: RESTful with JWT authentication

**Database**: PostgreSQL via Drizzle ORM

**Queue System**: Custom in-memory queue for sequential job processing

**Service Layer**:
- **WordPressService**: REST API communication using ONLY `/wp-json/wp/v2/` endpoints
- **ContentExtractorService**: Universal content parser for all page builders
- **GeminiTranslationService**: Google Gemini AI integration
- **WordPressInterfaceService**: UI element translation
- **Queue Worker**: Processes jobs sequentially with ContentExtractor

### Content Extraction System

**ContentExtractorService** supports multiple extraction methods:

1. **BeBuilder** - Recursive JSON parsing of `mfn-page-items`
   - Extracts: text, title, label, content, description fields
   - Handles nested structures and arrays
   
2. **Gutenberg** - Block comment parsing
   - Regex: `<!-- wp:blocktype {...} -->...<!-- /wp:blocktype -->`
   - Extracts block content and attributes
   
3. **Elementor** - JSON parsing from `_elementor_data` meta
   - Extracts: text, title, description, placeholder, button_text
   - Handles settings objects and nested elements
   
4. **WP Bakery** - Shortcode parsing
   - Regex: `[vc_blocktype ... ]...[ /vc_blocktype ]`
   - Extracts attributes and inner content
   
5. **Standard** - Plain HTML/text extraction
   - Removes tags, shortcodes, and block comments
   - Extracts readable text content

## Database Schema

- `admins`: User authentication
- `settings`: Configuration (WordPress URL, API keys, languages)
- `translation_jobs`: Job tracking with status and progress
- `logs`: Detailed job execution logs

## External Dependencies

**WordPress Integration**:
- WordPress REST API (v2) `/wp-json/wp/v2/posts/`, `/wp-json/wp/v2/pages/`
- Polylang plugin (PRO) - provides `lang` and `translations` fields via REST API
- Polylang language endpoint: `/wp-json/pll/v1/languages`
- Application Passwords for auth
- Supports posts, pages, menus, categories, tags, widgets

**Google Gemini AI**:
- `@google/genai` package
- Model: gemini-2.5-flash
- Prompt engineering to preserve HTML/shortcodes
- Batch translation for efficiency

**Database**: PostgreSQL via Neon (serverless)

**UI**: Radix UI, Lucide React, Tailwind CSS

## Key Technical Decisions

1. **WordPress REST API Only**: Uses standard `/wp-json/wp/v2/` endpoints exclusively with Polylang field integration

2. **Universal Content Parser**: Single ContentExtractorService handles all page builders, making the system flexible and maintainable

3. **Batch Processing**: All content blocks extracted and translated together, respecting API quotas

4. **Meta Field Support**: WordPress REST API automatically includes `_fields` with meta and Polylang fields

5. **Content Type Auto-Detection**: System automatically detects builder type and logs it for transparency

## Deployment

Environment variables required:
- `DATABASE_URL`: PostgreSQL connection
- `GEMINI_API_KEY`: Google Gemini API key
- `SESSION_SECRET`: Session encryption key

The application is deployment-ready and runs on any Node.js/PostgreSQL hosting.
