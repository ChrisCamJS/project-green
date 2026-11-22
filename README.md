# 🥦 The Veggie Vault

**The Veggie Vault** is a full-featured, Whole-Food, Plant-Based (WFPB) & 100% oil-free culinary platform powered by **The Chris & Emma Show** ([chrisandemmashow.com](https://chrisandemmashow.com/)). It pairs community recipe sharing, remixable recipe variants, community cooking stories, and mathematically verified macro/micronutrient breakdowns with **Emma**, an AI culinary & nutrition assistant available across text chat, voice dictation, and real-time live audio.

---

## 🛠️ Tech Stack

- **Frontend:** React 19 + Vite 7, React Router v7, Vanilla CSS (modular & component-scoped stylesheets), PWA install support, responsive 3-zone desktop header with account dropdown & mobile drawer (`<= 960px`).
- **AI, Voice & Nutrition:** Google Gemini API proxied securely through the backend (`pantry-rebuild-api`), ephemeral Live Audio tokens, structured JSON variant diffing & photography, female British Web Speech TTS & voice-to-text dictation, and deterministic USDA FoodData Central calculations with local MySQL caching.
- **Backend API & SEO Pre-Rendering:** PHP 8+ REST API (`pantry-rebuild-api`) with PDO/MySQL, HTTPS cross-origin session authentication, email verification, `dsojevic/profanity-list` text moderation, Gemini Vision image safety scanning, GD EXIF stripping & WebP re-encoding, `DOMDocument` HTML allowlist XSS sanitization, Stripe Checkout token purchases, and server-side Open Graph / Schema.org pre-rendering (`bot-handler.php`, `story-meta.php`, `sitemap.php`).

---

## ✨ Key Features

### 🔍 Recipe Discovery, Navigation & Viewing
- **3-Zone Desktop Navigation & Account Menu:** Single-row desktop header (`Header.jsx`) organized into Brand (left), active-route pill links (**Home**, **Flavor Forge**, **Meal Plan**, **Wellness**, **My Vault**) in the center, and Token Balance pill, Notification Bell, and **Account Dropdown** (**My Profile**, **My Vault**, **Buy Tokens** with crisp inline SVG token icon, **Admin Vault**, **Install App**, and **Logout**) on the right, switching seamlessly to a grouped mobile drawer at `<= 960px`.
- **Chronological Home Timeline:** Displays all published recipes chronologically by default, with a **Following Only** filter option for chefs you follow.
- **Smart Search & Filters Dropdown:** Filter by dietary tags (`Gluten-Free`, `Oil-Free`, `Refined Sugar-Free`), free-text keywords/ingredients, and **minimum star rating** (`1+` to `4+` stars) from a compact `Filters` dropdown on Home, **My Vault**, and **Chef Profiles**.
- **Clean Cards & Flexible Pagination:** Recipe cards feature distraction-free text badges (`Following`, `Draft`, `Variant`/`Masterpiece Variant`, `Oil-Free`, `Gluten-Free`, `Refined Sugar-Free`) and switch seamlessly between **6**, **10**, or **15** recipes per page, or **Endless Scroll** (on both Home and Admin inventory tabs).

### 🔀 Recipe Variants ("Forking" Recipes)
- **Emma's Variant Studio (`CreateVariantModal`):** Logged-in chefs can click **Create Variant** on any public recipe to fork and remix ingredients, dietary profiles, cooking methods, or spice levels while preserving the core dish structure.
- **Transparent Decimal Token Tiers (`0.5` vs `1.0` Tokens):**
  - **Base Variant (`0.5` Tokens):** Modifies the recipe text via Gemini Structured JSON Output, recalculates USDA FoodData Central macros/micros, and attaches a user-uploaded photo (scanned via `ImageModerationService`).
  - **AI Visual Variant (`1.0` Token):** Generates the modified recipe and nutrition *plus* a custom AI dish photograph tailored to the variant (`RecipeVariantService::generateVariantAiImage`).
  - **Masterpiece Variant Toggle:** Optional toggle to compute the full 10+ micronutrient breakdown and Emma's Deep Dive, awarding the gold **Masterpiece Variant** badge (`is_masterpiece = 1`).
- **Anti-Clout-Stealing & Atomic Transactions:** Dual-layer guardrails (PHP pre-flight `validateMeaningfulRequestText()` + Gemini `is_meaningful_change` structured check + PHP diff verification) reject trivial/title-only copies. User balances (`DECIMAL(10,2)`) are locked via `SELECT ... FOR UPDATE` inside a MySQL transaction so failed API calls never deduct tokens.
- **Lineage, Interactive Popover Badge & Attribution:** Variants live in the main `recipes` table (`parent_recipe_id`, `root_recipe_id`, `variant_summary`, `is_masterpiece`), render dual attribution (**Created by [Variant Author]** + **Inspired by [Original Author]**), feature an interactive desktop-hover + mobile-tap `<VariantBadge />` linking directly to the original recipe, populate a **Community Variants** strip on parent recipes, and send a `recipe_variant` notification to the parent creator (suppressed on self-variants).

### 📖 Recipe Stories (Community Blog Posts & Social Sharing)
- **Rich-Text Editorial Studio (`StoryEditorModal`):** Logged-in users can click **Write a Story** or **Share Your Story** on any recipe to author rich-text blog posts (`H2`, `H3`, Bold, Italic, Underline, Blockquotes, Bulleted & Numbered Lists, and Links) linked to any original recipe or variant.
- **Cover Photos, Inline Images & YouTube Embeds:** Upload a hero cover image (`cover_image`, falling back to the linked recipe photo) and unlimited inline story photos (`POST /stories/upload-image`)—all validated for MIME type, scanned by Gemini Vision (`'story'` context), stripped of EXIF/GPS metadata, and re-encoded via GD into `/images/stories/`. Authors can also paste any YouTube URL (`watch`, `youtu.be`, `shorts`, `live`, `embed`, or `<iframe>` snippet) to insert a responsive 16:9 `youtube-nocookie.com` player.
- **Word Count, Excerpt & Security:** Automatically calculates `read_time_minutes` (~200 wpm), auto-generates 320-char excerpts, generates unique SEO slugs (`sunday-family-dinner-...-a8f2`), enforces profanity checks across title/excerpt/body, and runs server-side `DOMDocument` allowlist XSS sanitization (`StoryService::sanitizeContentHtml`).
- **Recipe Page Stories, Reader & Creator Notifications:** Each recipe displays paginated **Community Stories** (`6` per page via `GET /stories?recipe_id=...&page=1`). Clicking a story opens `/stories/:slug` (`StoryReader.jsx`) with hero cover, author byline, likes toggle, author Edit/Delete controls, a pinned **Embedded Recipe Reference Card** (thumbnail, title, times, macros, variant badge, and **Cook This Recipe** button), one-click **Copy Link** toast, and direct share buttons (X, Facebook, Pinterest, Reddit). Published stories appear on the author's **Chef Profile** (`My Stories` tab) and notify the recipe creator (`recipe_story` linking straight to `/stories/:slug`).
- **Crawler Open Graph & `BlogPosting` Pre-Rendering:** Apache `.htaccess` routes social crawlers (`facebookexternalhit`, `Twitterbot`, `Discordbot`, `WhatsApp`, `Slackbot`, `LinkedInBot`, `Pinterest`, etc.) visiting `/stories/:slug` to `story-meta.php`, serving dynamic `og:type="article"`, `og:title`, `og:description`, `og:image`, `article:published_time`, `article:author`, `twitter:card="summary_large_image"`, and Schema.org `BlogPosting` JSON-LD (while `sitemap.php` indexes all published stories).

### 🤖 Emma's Flavor Forge & Site-Wide Floating Helper
- **Unified Chat & Live Audio:** Text chat and **Live Audio** operate as one continuous conversation across Chat, Recipe Draft, and Masterpiece modes—spoken turns are transcribed in real time and saved directly into chat history and 30-day Recent Chats.
- **One-Click Recipe Idea Launching:** Whenever Emma suggests new recipe ideas in any text chat (Floating Emma, Flavor Forge Chat, Recipe Details Chat, or Meal Planner), each suggestion renders **📝 Create Recipe** and **📸 Create Masterpiece** buttons that open Flavor Forge in the selected mode with the idea prompt pre-filled and ready to send.
- **Floating Emma Helper & Audio Playback:** Page-aware site assistant available across the app (Home, Recipe Details, Meal Planner, Wellness, Profile) with compact/expanded/minimized/hidden states, speaker playback on every reply using the consistent female British voice, and smart auto-scroll to the top of long responses.
- **Masterpiece & Recipe Creation:** Generate **Quick Recipe Drafts** (free) or **Full Masterpieces** (1 token, with AI food photography, customizable kitchen/photo styling, bracket-free clean titles, and a save-to-vault reminder modal), then iterate freely in the same conversation.
- **Auto-Expanding Inputs & Reference Attachments:** All chat, reference, kitchen styling, and comment inputs auto-expand as you type or dictate, with client-side compression for large reference images (`.txt`, `.md`, `.docx`, `.pdf`, `.csv`, `.json`, or photos).
- **Automatic Allergy Protection:** Food allergies saved in your profile are automatically injected into Emma's prompts across text and live audio so unsafe ingredients are always avoided.

### 📊 Recipe Details, Nutrition & Multi-Photo Galleries
- **Deterministic USDA FoodData Central Nutrition:** Saved recipes and Masterpiece nutrition upgrades calculate per-serving macros and 13 micronutrients mathematically from USDA FoodData Central (with a MySQL lookup cache, automatic closest-alternative / Emma fallback for specialty WFPB pantry staples, and always including **Dietary Fiber**, **Sodium**, and **Saturated Fat**), alongside transparent macro energy proofs, a collapsible per-ingredient breakdown card, and a free **🔬 Recalculate (USDA)** button for recipe owners and admins.
- **Inline Recipe Title Editing & Galleries:** Recipe creators can rename their own recipes inline directly from the recipe page, upload additional real-life dish photos after publishing while keeping Emma's AI image as the default cover, or pick any uploaded photo as the public cover.
- **Clipboard Export & Section-Specific British Audio:** One-click **Copy Recipe** (formatted rich text + plain text), speaker buttons in Emma's female British voice that read strictly **Ingredients**, strictly **Instructions**, or **Emma's Deep Dive**, **Admin Quick Edit** link, and **Similar & Suggested Recipes** at the bottom of every recipe page.
- **Ratings, Comments & Community:** 5-star ratings, threaded comments with image uploads and like/dislike voting, **Hover-to-Follow Chefs**, and header notifications for comments, variants, and stories.

### 🩺 Wellness Tools & Meal Planning Calendar
- **Wellness Calculators:** Interactive **BMI Calculator**, **TDEE / Caloric Needs Calculator**, and **Macronutrient Planner** that save directly to your user profile.
- **Meal Planning Calendar & Portion Scaling:** Plan Breakfast, Lunch, Dinner, and Snacks across **Day**, **Week**, and **Month** views in `0.25`-serving increments (`0.25` to `20` servings) with automatic daily macro/micronutrient aggregation against your saved Wellness Profile targets.
- **Emma Meal Concierge & Fitness Tracker:** Ask Emma (via text or live audio) to fill meal slots, balance your week, and automatically rescale meal servings to hit daily calorie targets, and log daily workouts with MET-based calorie burn and net calories.

### 🏆 Multi-Level Achievements & Shareable Profiles
- **Shareable Chef Profiles & SEO:** Copyable profile links (`/profile/{username}`) with Open Graph (`og:type="profile"`) and `ProfilePage` JSON-LD metadata (including server-side crawler previews in `bot-handler.php`), plus tabs for **My Masterpieces** and **My Stories**.
- **Followers List:** Logged-in users viewing their own profile can click their **Followers** count to jump directly to their follower list.
- **Progressive Achievement Badges (10 Multi-Level Tracks):** Earn 4-level achievement badges across **Masterpiece Chef**, **Community Chatterbox**, **Meal Prep Strategist**, **Active Explorer**, **Calorie Crusher**, **Vault Supporter**, **Flavor Remixer** (`variants_created`), **Culinary Muse** (`variants_inspired`), **Vault Storyteller** (`stories_published`), and **Beloved Author** (`story_likes_received`).

### 🔐 Security, Moderation & Admin Vault Control
- **Server-Side AI Proxy & Ephemeral Live Tokens:** All Gemini text, image, and Live Audio token requests are authenticated and proxied through `pantry-rebuild-api` (`/ai/chat`, `/ai/image`, `/ai/live-token`) so `GEMINI_API_KEY` never appears in frontend bundles or browser network requests.
- **Community Language Filter:** Server-side moderation backed by `dsojevic/profanity-list` (with word-boundary matching, leetspeak/obfuscation detection, and culinary safe-word awareness) validates comments, user profile fields, registration usernames, recipe variant descriptions, story content, and user-edited recipe titles.
- **Gemini Vision Image Upload Moderation:** All user-uploaded images (profile avatars, recipe cover/gallery photos, variant cover photos, comment attachments, story cover/inline images, and admin uploads) are scanned in memory with Gemini Vision safety checks before writing any file to disk.
- **Auth & Upload Hardening:** Idempotent email verification, password strength meter, password reset emails, configurable beta invite codes, validated image uploads, and sanitized error responses.
- **Upgraded Admin Dashboard (`AdminDashboard.jsx`):**
  - **Manage Recipes Tab:** Mobile-first stacked cards, live inventory search across title, `#ID`, creator, parent recipe, or variant twist, **Originals / All Variants / Masterpiece Variants** filter pills with counts, inline `<VariantBadge />` lineage links, pagination/endless scroll, and **Hide/Publish / Edit / Delete** actions.
  - **📖 Manage Stories Tab (`GET /admin/stories`):** Search across story title, `#ID`, slug, excerpt, author, or linked recipe, filter by **All Stories / Published / Drafts**, and **Hide/Publish**, **Edit** (via `StoryEditorModal`), or **Delete** stories.
  - **Invites, Free Emma DB Assistant & Private Context:** Manage beta invite codes, run admin DB workflows via **Admin Emma DB Assistant**, and upload a confidential **Emma Context Document** (`.txt`, `.md`, `.docx`, `.pdf`, etc.) in the **🧠 Emma Context** tab so Emma retains your personal/brand context across all text chats and Live Audio sessions.

---

## 🚀 Getting Started

1. **Clone the repository** and install dependencies:
   ```bash
   npm install
   ```
2. **Database Migrations (`pantry-rebuild-api/migrations/`):**
   Apply the MySQL migrations when provisioning or updating a live database:
   - `migrations/add_recipe_variants.sql` — adds variant lineage (`parent_recipe_id`, `root_recipe_id`, `variant_summary`, `is_masterpiece`) to `recipes` and `DECIMAL(10,2)` precision to `users.generation_tokens`.
   - `migrations/add_recipe_stories.sql` — creates `recipe_stories`, `story_likes`, and adds `notifications.story_slug`.
3. **Configure environment variables** in `.env` at the project root:
   ```env
   VITE_API_BASE_URL=http://localhost/pantry-rebuild-api/public
   ```
   *(Keep `GEMINI_API_KEY`, `USDA_API_KEY`, and Stripe secrets strictly in `pantry-rebuild-api/.env` on the backend—never in the frontend `.env`.)*
4. **Start the development server:**
   ```bash
   npm run dev
   ```
5. **Lint and build for production:**
   ```bash
   npm run lint
   npm run build
   ```
