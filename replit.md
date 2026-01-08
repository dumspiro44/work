# WP PolyLingo Auto-Translator

## Overview

WP PolyLingo Auto-Translator is an external microservice designed to automate the translation of WordPress content using Google Gemini AI. It operates as a standalone service, independent of WordPress, and supports all major page builders including BeBuilder, Gutenberg, Elementor, WP Bakery, and standard WordPress content. The system provides an administrative dashboard for managing translations, monitoring jobs, and configuring settings.

The primary purpose of this application is to facilitate bulk translation for multilingual WordPress sites utilizing the Polylang plugin. It ensures that HTML structure, WordPress shortcodes, and formatting are preserved across all translated content types. The project aims to provide an efficient and comprehensive translation automation solution, enhancing the reach and usability of WordPress sites globally.

## User Preferences

Preferred communication style: Simple, everyday language.
Localization: Full support for Russian and English interfaces.
Communication Language: Always use Russian for all interactions, including technical explanations and service information.
Additional Languages: Slovak (sk), Kazakh (kk), Czech (cs), Moldovan (mo) added to translation targets.

## System Architecture

### Frontend Architecture

The frontend is built with React 18 and TypeScript, using Vite. It utilizes Shadcn UI (New York style), Radix UI, and Tailwind CSS for a consistent and modern user interface. Wouter handles client-side routing, and state management is managed by TanStack Query for server state and React Context for authentication and theme settings. Key pages include Login, Dashboard, Posts Management, Create Content, Content Correction, Translation Jobs, Menu Translation, Interface Translation, SEO Optimization, and Configuration. Menu items are dynamically enabled/disabled based on WordPress connection status.

### Backend Architecture

The backend is developed with Node.js, Express.js, and TypeScript, providing a RESTful API with JWT authentication. PostgreSQL serves as the database, accessed via Drizzle ORM. A custom in-memory queue system manages sequential job processing with built-in rate limiting. The service layer includes dedicated services for WordPress API communication (`WordPressService`), universal content parsing (`ContentExtractorService`), Gemini AI integration (`GeminiTranslationService`), WordPress UI element translation (`WordPressInterfaceService`), and a Queue Worker for job execution.

### Content Extraction System

The `ContentExtractorService` is a universal parser designed to handle various WordPress content formats:
-   **BeBuilder**: Decodes PHP serialization and recursively parses JSON structures.
-   **Gutenberg**: Parses block comments and extracts content and attributes.
-   **Elementor**: Parses JSON metadata from `_elementor_data` fields.
-   **WP Bakery**: Parses shortcodes and extracts attributes and inner content.
-   **Standard**: Extracts plain text content from standard HTML.
This service tracks block metadata to ensure precise content restoration.

### System Design Choices

-   **WordPress REST API Only**: The system exclusively uses standard WordPress REST API endpoints, integrating with Polylang's fields for language and translation data.
-   **Universal Content Parser**: A single, flexible `ContentExtractorService` manages content extraction from all supported page builders.
-   **Batch Processing**: Content blocks are extracted and translated in batches to optimize API usage and efficiency.
-   **Meta Field Support**: The WordPress REST API automatically provides `_fields` with meta and Polylang-specific data.
-   **Content Type Auto-Detection**: The system automatically identifies the page builder or content type for each post/page.
-   **Smart Chunking for Large Content**: Large articles (>8000 chars) are automatically split into logical chunks, translated separately, then reassembled. Optimized for Gemini API reliability.
-   **Retry Mechanism**: Built-in retry logic (3 attempts with exponential backoff) for Gemini API resilience against quota limits.
-   **UI/UX**: Emphasis on a clean, modern interface using Shadcn UI, adhering to a New York-style aesthetic.
-   **Content Archiving**: Implements an archive request system with an approval workflow, allowing content to be moved to "draft" status rather than deleted. It includes dynamic date-based content discovery and statistics.
-   **Content Correction**: Features analysis of WordPress category descriptions to detect and reorganize broken HTML catalogs into new WordPress posts, updating category descriptions with clean text.
-   **Image Upload**: Supports direct image uploads to the WordPress media library, with images inserted into content and preserved during translation and publishing.
-   **Synchronous Content Translation**: Content is translated to all target languages simultaneously before publishing, preserving HTML and formatting.

## External Dependencies

-   **WordPress Integration**:
    -   WordPress REST API (v2) for posts and pages.
    -   Polylang plugin (PRO version) for multilingual capabilities.
    -   Polylang language endpoint: `/wp-json/pll/v1/languages`.
    -   Authentication via WordPress Application Passwords.
    -   Supports translation of posts, pages, menus, categories, tags, and widgets.
    -   Requires "WP REST Menus" plugin by skapator for menu translation, using API endpoints like `/wp-json/menus/v1/menus`.
-   **Google Gemini API** (premium paid service for better translation quality):
    -   Requires API key configured in Settings page (user provides their own key).
    -   Superior translation quality compared to free alternatives.
    -   Supports all WordPress content types and page builders.
    -   Configurable system instructions for custom translation rules.
    -   **Automatic retries** with exponential backoff (3 attempts) for quota resilience.
    -   Content chunked at 8000 chars per request for optimal performance.
    -   **Auto-Publishing**: Translations automatically publish to WordPress + Polylang immediately upon completion. No manual action needed.
-   **Database**: PostgreSQL, specifically Neon for serverless deployment.
-   **UI Libraries**: Radix UI, Lucide React, and Tailwind CSS.