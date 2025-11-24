# WP PolyLingo Auto-Translator

## Overview

WP PolyLingo Auto-Translator is an external microservice application designed to automate the translation of WordPress content using Google Gemini AI. It functions as a standalone service with an admin dashboard for managing translations, monitoring jobs, and configuring settings. The system connects to WordPress sites via the REST API and utilizes an asynchronous queue for translation workflows. Its primary purpose is to enable bulk translation operations for multilingual WordPress sites leveraging the Polylang plugin, while preserving critical elements like HTML structure, WordPress shortcodes, and formatting. The application also provides comprehensive Interface Translation support for menus, categories, tags, pages, and widgets, optimized for efficient API usage.

## User Preferences

Preferred communication style: Simple, everyday language.
Localization: Full support for Russian and English interfaces.
Additional Languages: Slovak (sk), Kazakh (kk), Czech (cs), Moldovan (mo) added to translation targets.

## System Architecture

### Frontend Architecture

The frontend is built with React 18 and TypeScript, using Vite for development and bundling. It employs Shadcn UI (New York style) based on Radix UI and Tailwind CSS for a responsive, dark/light theme supporting interface. Wouter handles client-side routing, while TanStack Query manages server state and data fetching. Key pages include Login (JWT-based authentication), Dashboard (overview statistics), Posts Management (content filtering, bulk translation, editing, publishing), Interface Translation (batch-optimized UI element translation), Translation Jobs (real-time monitoring), and Configuration (WordPress and API settings).

### Backend Architecture

The backend runs on Node.js with Express.js, written in TypeScript. It provides a RESTful API with JWT-based authentication for session management and utilizes Bcrypt for password hashing. Drizzle ORM is used with PostgreSQL for database interactions. A custom in-memory queue system manages translation jobs sequentially to respect API rate limits and provide real-time status updates. Service layers include `WordPressService` for REST API communication, `WordPressInterfaceService` for managing interface elements, and `GeminiTranslationService` for Google Gemini AI integration, featuring content and batch interface translation with prompt engineering to preserve content structure.

### BeBuilder / Muffin Builder Content Storage

The system accounts for BeBuilder content stored across multiple WordPress database locations:
1.  **Main BeBuilder Page Content**: In `wp_postmeta` (`mfn-page-items` key) as a JSON string.
2.  **Standard Post/Page Content**: In `wp_posts` (`post_content`).
3.  **Global Templates**: In `wp_posts` (`post_type = 'template'`) and `wp_postmeta` (`mfn-page-items`).
4.  **BeBuilder Elements**: Within the `mfn-page-items` JSON structure in `wp_postmeta`.
5.  **Theme Options / Settings**: In `wp_options` (`mfn-options`) as a serialized PHP array.

## External Dependencies

*   **WordPress Integration**: WordPress REST API (v2) for content management and Application Passwords for authentication. Utilizes Polylang plugin API for translation linking and language management. Endpoints used cover posts, pages, menu items, categories, tags, widgets, Polylang language lists, and translation linking for posts, terms.
*   **Google Gemini AI**: `@google/genai` package, using `gemini-2.5-flash` model for content and title translation. Employs prompt engineering to preserve HTML tags, classes, IDs, and WordPress shortcodes, with markdown cleanup and batch support for interface elements.
*   **Database**: PostgreSQL via Neon serverless driver (`@neondatabase/serverless`) with Drizzle ORM for schema management.
*   **UI Component Libraries**: Radix UI primitives, Lucide React for icons, Tailwind CSS for styling, and Class Variance Authority (CVA).
*   **Build & Development**: Vite, TypeScript compiler, ESBuild, and Hot Module Replacement.