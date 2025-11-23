# Design Guidelines: WP PolyLingo Auto-Translator Admin Dashboard

## Design Approach
**Reference-Based: Modern SaaS Admin Dashboards**
Draw inspiration from **Linear, Vercel Dashboard, and Railway** for their clean, functional aesthetics optimized for productivity tools. These represent the gold standard for developer/admin interfaces with excellent information density and usability.

**Core Principles:**
- Clarity over decoration - every element serves a purpose
- Consistent information hierarchy across all pages
- Efficient use of space without feeling cramped
- Professional, trustworthy appearance befitting a production tool

## Typography System

**Font Family:** 
- Primary: `Inter` (Google Fonts CDN) - exceptional readability for UI text and data tables
- Monospace: `JetBrains Mono` - for API keys, URLs, technical data

**Type Scale:**
- Page Titles: `text-2xl font-semibold` (Dashboard, Posts Management, etc.)
- Section Headers: `text-lg font-medium`
- Body Text: `text-sm` (forms, descriptions, table content)
- Labels: `text-xs font-medium uppercase tracking-wide` (form labels, badges)
- Stats/Numbers: `text-3xl font-bold` (dashboard metrics)
- Table Headers: `text-xs font-semibold uppercase`

## Layout System

**Spacing Primitives:** Use Tailwind units of `2, 4, 6, 8, 12, 16` consistently
- Component padding: `p-6` or `p-8`
- Section gaps: `gap-6` or `gap-8`
- Form field spacing: `space-y-4`
- Card margins: `mb-6` or `mb-8`
- Sidebar padding: `p-4`

**Grid System:**
- Dashboard stats: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6`
- Form layouts: `grid grid-cols-1 md:grid-cols-2 gap-6` (for settings page)
- Table: Full-width responsive with horizontal scroll on mobile

**Container Strategy:**
- Main content area: `max-w-7xl mx-auto px-6 py-8`
- Sidebar: Fixed width `w-64` on desktop, collapsible on mobile
- Modal containers: `max-w-2xl` for forms, `max-w-4xl` for edit translation

## Component Library

### Navigation
- **Sidebar:** Fixed left navigation with logo at top, menu items with Lucide icons (Home, FileText, Briefcase, Settings), logout button at bottom
- **Mobile:** Hamburger menu (Menu icon) triggers slide-in sidebar overlay
- **Active state:** Highlight active page with subtle background and accent border-left

### Dashboard Cards
- Stats cards: White/dark cards with icon (circle background), large number, label, and optional trend indicator
- Minimal shadows: `shadow-sm` only, avoid heavy depth effects

### Data Tables
- Clean borders: `border border-gray-200 dark:border-gray-700`
- Hover rows: Subtle background change for interactivity
- Checkbox column: First column for multi-select functionality
- Status badges: Rounded pills (`px-3 py-1 rounded-full text-xs font-medium`) with semantic colors (success=green, pending=yellow, error=red)
- Action buttons: Icon buttons (Edit, Delete) aligned right

### Forms
- Input fields: `border rounded-lg px-4 py-2.5` with focus ring
- Labels: Above inputs, `text-sm font-medium mb-1.5`
- Multi-language selector: Grid of flag icons (emoji or SVG) with checkboxes
- API key field: Monospace font with "Show/Hide" toggle
- Test Connection button: Secondary style, inline with URL input
- Save button: Primary, prominent, bottom-right of form

### Progress Indicators
- Job progress: Linear progress bars with percentage label
- Status indicators: Animated spinner for "Processing", checkmark for "Completed", X for "Failed"

### Modals
- Overlay: `bg-black/50 backdrop-blur-sm`
- Container: Centered, `rounded-xl shadow-2xl`
- Header: Title with close button (X icon)
- Body: Scrollable content area
- Footer: Action buttons aligned right (Cancel + Confirm)

### Buttons
- Primary: Solid background, medium weight text, `rounded-lg px-4 py-2.5`
- Secondary: Border style with transparent background
- Icon buttons: Square `w-9 h-9` with icon centered
- Loading state: Spinner icon replaces text/icon

## Theme Implementation

**Light Theme:**
- Background: `bg-gray-50` (page), `bg-white` (cards, sidebar)
- Text: `text-gray-900` (primary), `text-gray-600` (secondary)
- Borders: `border-gray-200`

**Dark Theme:**
- Background: `bg-gray-900` (page), `bg-gray-800` (cards, sidebar)
- Text: `text-gray-100` (primary), `text-gray-400` (secondary)
- Borders: `border-gray-700`

**Theme Toggle:** Icon button in sidebar header (Sun/Moon icons from Lucide)

## Iconography
**Library:** Lucide React (CDN or npm)
**Usage:**
- Navigation: Home, FileText, Briefcase, Settings, LogOut
- Actions: Edit2, Trash2, ChevronRight, Plus, Check, X
- Status: AlertCircle, CheckCircle, Clock, TrendingUp
- UI Controls: Menu (hamburger), Sun, Moon, Eye, EyeOff

**Size:** `size={20}` for navigation, `size={16}` for inline icons

## Animations
**Minimal & Purposeful:**
- Sidebar slide-in: `transition-transform duration-300 ease-in-out`
- Button hover: `transition-colors duration-150`
- Progress bars: Smooth width animation via CSS transition
- NO complex scroll animations or unnecessary motion

## Responsive Breakpoints
- Mobile: `< 768px` - Stacked layout, hamburger menu, hidden sidebar
- Tablet: `768px - 1024px` - Visible sidebar, 2-column stats grid
- Desktop: `> 1024px` - Full layout, 4-column stats grid

## Critical UX Patterns
- **Unsaved changes warning:** Browser `beforeunload` event for Configuration page
- **Real-time updates:** Poll translation jobs every 3-5 seconds, update progress bars
- **Error states:** Toast notifications (top-right) for API errors
- **Empty states:** Friendly messages with call-to-action when no data exists (e.g., "No translation jobs yet. Start by selecting posts to translate.")
- **Loading states:** Skeleton loaders for tables, spinner for buttons during async actions