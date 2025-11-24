# WP PolyLingo Auto-Translator

## Overview

WP PolyLingo Auto-Translator is an external microservice application that automates the translation of WordPress content using Google Gemini AI. The system operates independently from WordPress as a standalone service, supporting ALL popular page builders: BeBuilder, Gutenberg, Elementor, WP Bakery, and standard WordPress content. It provides an admin dashboard for managing translations, monitoring jobs, and configuring settings.

The application serves as a translation automation tool for multilingual WordPress sites using the Polylang plugin, enabling bulk translation operations while preserving HTML structure, WordPress shortcodes, and formatting across all content types.

## User Preferences

Preferred communication style: Simple, everyday language.
Localization: Full support for Russian and English interfaces.
Additional Languages: Slovak (sk), Kazakh (kk), Czech (cs), Moldovan (mo) added to translation targets.

## Recent Updates (Nov 24, 2025)

**Universal Page Builder Support - COMPLETE IMPLEMENTATION:**
1. **ContentExtractorService** - Universal content parser (NEW) supporting:
   - ✅ **BeBuilder (Muffin Builder)** - Extracts from wp_postmeta (mfn-page-items JSON)
   - ✅ **Gutenberg** - Extracts from block comments and attributes in post_content
   - ✅ **Elementor** - Extracts from wp_postmeta (_elementor_data JSON)
   - ✅ **WP Bakery** - Extracts from shortcodes and attributes
   - ✅ **Standard HTML** - Extracts plain content and text
2. **Backend Integration:**
   - Updated WordPressService to fetch meta fields and auto-detect content type
   - Updated queue worker to use ContentExtractor for ALL content types
   - Automatic content type detection logged during translation jobs
   - Supports mixed-format pages (e.g., BeBuilder + Standard content)
3. **How It Works:**
   - Recursively extracts from nested JSON structures (BeBuilder, Elementor)
   - Parses Gutenberg blocks and attributes
   - Parses WP Bakery shortcodes and attributes
   - Combines all extracted content for efficient batch translation
   - Shows detected content type in job logs

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
- **WordPressService**: REST API communication, meta field fetching, content type detection
- **ContentExtractorService** (NEW): Universal content parser for all page builders
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
- WordPress REST API (v2)
- Polylang plugin API
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

1. **Universal Content Parser**: Single ContentExtractorService handles all page builders, making the system flexible and maintainable

2. **Batch Processing**: All content blocks extracted and translated together, respecting API quotas

3. **Meta Field Support**: WordPress.ts automatically fetches `_fields` including meta, with fallback for servers without meta support

4. **Recursive Extraction**: JSON structures recursively traversed to find all text content in nested builders

5. **Content Type Auto-Detection**: System automatically detects builder type and logs it for transparency

## User Guide: Translating All Content Types

### Supported Content
The system automatically detects and translates content from:
- ✅ BeBuilder pages (from JSON metadata)
- ✅ Gutenberg blocks (from post content)
- ✅ Elementor pages (from metadata)
- ✅ WP Bakery shortcodes (from post content)
- ✅ Standard WordPress posts/pages (plain HTML)
- ✅ Mixed-format pages (combination of above)

### Translation Workflow
1. Click "Posts Management" in sidebar
2. Select posts/pages you want to translate
3. Click "Translate Selected" button
4. Monitor progress in "Translation Jobs" page
5. Edit translations if needed
6. Click "Publish" to save to WordPress

### What Gets Translated
- **All text content** from the page (regardless of builder)
- Post/page title
- All text blocks, headings, buttons, descriptions
- Widget text and settings
- Menu item titles and descriptions

### What Doesn't Get Translated
- HTML/CSS structure (preserved as-is)
- PHP shortcodes (preserved as-is)
- Image alt text (handled separately)
- Theme settings and options (requires manual update)

### Job Logs
Each translation job logs:
- Source content type detected (BeBuilder/Gutenberg/Elementor/etc)
- Number of content blocks extracted
- Tokens used for translation
- Any errors during processing

## Deployment

Environment variables required:
- `DATABASE_URL`: PostgreSQL connection
- `GEMINI_API_KEY`: Google Gemini API key
- `SESSION_SECRET`: Session encryption key

The application is deployment-ready and runs on any Node.js/PostgreSQL hosting.
