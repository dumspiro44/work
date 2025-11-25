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

## Recent Updates (Nov 25, 2025)

**✅ LATEST FIX (Nov 25, 2025 - 11:15 PM)**:
1. **Fixed and Enhanced Translation Progress for Interface Translation**
   - ✅ **Прогресс-окно ТЕПЕРЬ видно** при переводе интерфейса
   - ✅ **Синий Card** показывается когда мутация isPending ИЛИ isTranslating
   - ✅ **Процент прогресса** обновляется каждые 500мс
   - ✅ **Оценка времени** показывает примерно сколько осталось (~XXс)
   - ✅ **Зелёный Card** при завершении - "Переводы готовы к редактированию и публикации"
   - ✅ **Надежное отслеживание** - работает даже после завершения API запроса
   - ✅ Поддержка русского и английского языков
   - Файлы: `client/src/pages/interface-translation.tsx`

**✅ PREVIOUS FIX (Nov 25, 2025 - 11:10 PM)**:
1. **Added Translation Progress for Interface Translation**
   - ✅ Красивый Card с прогресс-баром при переводе интерфейса
   - ✅ **Лоадер + текст "Перевод в процессе..."** - явно видно, что происходит перевод
   - ✅ **Оценка времени** (~XXс) - пользователь видит сколько осталось ждать
   - ✅ **Синий Card с левой границей** - нестинг видно что идёт активный процесс
   - ✅ **Зелёный Card при завершении** - "Переводы готовы к редактированию и публикации"
   - ✅ Процент прогресса обновляется в реальном времени
   - ✅ Поддержка русского и английского языков
   - Файлы: `client/src/pages/interface-translation.tsx`

**✅ PREVIOUS FIX (Nov 25, 2025 - 11:00 PM - UPDATE)**:
1. **Fixed Language Filters in Published App & Gemini Quota Error Display**
   - ✅ **Языковые фильтры теперь работают в published app** - улучшена инициализация и fallback значение
   - ✅ **Сообщение о превышении квоты Gemini теперь показывается рядом с синим окном прогресса** (в posts.tsx)
   - ✅ Красивый баннер ⚠️ с левой красной линией и иконкой - точно как в jobs.tsx, но НА месте перевода
   - ✅ **Прямая ссылка "Открыть панель Gemini"** для быстрого доступа к API ключам
   - ✅ **Исправлена ссылка**: `https://aistudio.google.com/app/api-keys` (вместо ai.google.dev/dashboard)
   - ✅ Две версии языка: русский/английский
   - Файлы: `client/src/pages/posts.tsx`, `client/src/pages/jobs.tsx`

**✅ PREVIOUS FIX (Nov 25, 2025 - 10:45 PM)**:
1. **Enhanced Polylang Language Code Extraction**
   - ✅ Полный вывод ответа API в логи для диагностики
   - ✅ Попытка нескольких имён полей: `code`, `slug`, `locale`
   - ✅ Гибкий парсинг - работает с разными версиями Polylang API
   - ✅ Показывает структуру полей при ошибке (`Could not extract language codes. Language fields: ...`)
   - ✅ Первый объект языка выводится в console для анализа
   - Файлы: `server/services/wordpress.ts`

**✅ PREVIOUS FIX (Nov 25, 2025 - 10:30 PM)**:
1. **Improved Polylang Language Synchronization Error Handling**
   - ✅ Мощная диагностика ошибок в `getPolylangLanguages()` - возвращает объект с ошибками
   - ✅ Проверка HTTP статусов: 404 (Polylang не установлен), 401 (ошибка аутентификации), и т.д.
   - ✅ Проверка формата ответа API (array vs object)
   - ✅ Понятные сообщения об ошибках в `/api/sync-languages`:
     - Если Polylang не установлен → подробная инструкция
     - Если языки не добавлены → указание где их добавить
     - Если ошибка аутентификации → проверить учётные данные
   - ✅ Полное логирование для отладки в console
   - Файлы: `server/services/wordpress.ts`, `server/routes.ts`

**✅ PREVIOUS FIX (Nov 25, 2025 - 10:15 PM)**:
1. **Added Polylang Language Synchronization**
   - ✅ Новый метод `getPolylangLanguages()` в `WordPressService` - получает ВСЕ языки из Polylang
   - ✅ Новый маршрут `/api/sync-languages` - синхронизирует языки между Polylang и конфигуратором
   - ✅ Кнопка "Получить из Polylang" в разделе "Языки перевода"
   - ✅ Автоматически добавляет языки из Polylang в целевые языки (исключая исходный язык)
   - ✅ Объединяет новые языки Polylang с уже выбранными языками
   - ✅ Обновляет форму и показывает уведомление о синхронизации
   - ✅ Двуязычный интерфейс: русский/английский
   - Файлы: `server/services/wordpress.ts`, `server/routes.ts`, `client/src/pages/settings.tsx`

**✅ PREVIOUS FIX (Nov 25, 2025 - 9:45 PM)**:
1. **Added Language Filter in Content Management**
   - ✅ Новый фильтр "Язык" в разделе управления контентом
   - ✅ **Исходный язык первым** в списке с пометкой "(исходный)"
   - ✅ **Показывает только языки из конфигуратора** (targetLanguages)
   - ✅ Фильтруемое отображение: исходный язык показывает ВСЕ посты/страницы, целевые - только с готовыми переводами
   - ✅ Помогает управлять длинными списками контента
   - ✅ Автоинициализация к исходному языку при загрузке
   - Файлы: `client/src/pages/posts.tsx`

**✅ PREVIOUS FIX (Nov 25, 2025 - 9:30 PM)**:
1. **Added Prominent Error Display for API Quota Issues**
   - ✅ Ошибки квоты Gemini API теперь **ЯВНО видны** на странице "Работы"
   - ✅ Красивый баннер ⚠️ с левой красной линией и иконкой
   - ✅ Русский/английский текст: "Превышена квота Gemini API"
   - ✅ **Прямая ссылка** "Открыть панель Gemini" для быстрого доступа к dashboard
   - ✅ Понятное сообщение с указанием проверить план и биллинг

**✅ LATEST FIX (Nov 25, 2025 - 10:00 PM)**:
1. **Added Loading Message for Content Import**
   - ✅ Понятное сообщение вместо пустого окна при загрузке контента
   - ✅ Spinning иконка с текстом "Загружаем контент"
   - ✅ Описание: "Получаем посты и страницы с вашего WordPress сайта..."
   - ✅ Подсказка: "Это может занять несколько секунд"
   - ✅ Русский/английский языки
   - ✅ Видно, что происходит процесс загрузки
   - Файлы: `client/src/pages/posts.tsx`
