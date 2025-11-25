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

The backend is developed with Node.js, Express.js, and TypeScript, providing a RESTful API with JWT authentication. PostgreSQL serves as the database, accessed via Drizzle ORM. A custom in-memory queue system manages sequential job processing. The service layer includes dedicated services for WordPress API communication (`WordPressService`), universal content parsing (`ContentExtractorService`), Google Gemini AI integration (`GeminiTranslationService`), WordPress UI element translation (`WordPressInterfaceService`), and a Queue Worker for job execution.

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
-   **Database**: PostgreSQL, specifically Neon for serverless deployment.
-   **UI Libraries**: Radix UI, Lucide React, and Tailwind CSS.