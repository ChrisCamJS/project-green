# 🥦 The Veggie Vault

**The Veggie Vault** is a full-featured, Whole-Food, Plant-Based (WFPB) & 100% oil-free culinary platform powered by **The Chris & Emma Show** ([chrisandemmashow.com](https://chrisandemmashow.com/)). It pairs community recipe sharing and mathematically verified macro/micronutrient breakdowns with **Emma**, an AI culinary & nutrition assistant available across text chat, voice dictation, and real-time live audio.

---

## 🛠️ Tech Stack

- **Frontend:** React 19 + Vite 7, React Router v7, Vanilla CSS (modular & component-scoped stylesheets), PWA install support.
- **AI, Voice & Nutrition:** Google Gemini API proxied securely through the backend (`pantry-rebuild-api`), ephemeral Live Audio tokens, female British Web Speech TTS & voice-to-text dictation, and deterministic USDA FoodData Central calculations with local MySQL caching.
- **Backend API:** PHP 8+ REST API (`pantry-rebuild-api`) with PDO/MySQL, HTTPS cross-origin session authentication, email verification, `dsojevic/profanity-list` content moderation, and Stripe Checkout token purchases.

---

## ✨ Key Features

### 🔍 Recipe Discovery, Filtering & Viewing
- **Chronological Home Timeline:** Displays all published recipes chronologically by default, with a **Following Only** filter option for chefs you follow.
- **Smart Search & Filters Dropdown:** Filter by dietary tags (`Gluten-Free`, `Oil-Free`, `Refined Sugar-Free`), free-text keywords/ingredients, and **minimum star rating** (`1+` to `4+` stars) from a compact `Filters` dropdown on Home, **My Vault**, and **Chef Profiles**.
- **Flexible Pagination & Endless Scroll:** Switch seamlessly between **6**, **10**, or **15** recipes per page, or **Endless Scroll** (available on both the Home feed and the Admin Manage Recipes inventory).

### 🤖 Emma's Flavor Forge & Site-Wide Floating Helper
- **Unified Chat & Live Audio:** Text chat and **Live Audio** operate as one continuous conversation across Chat, Recipe Draft, and Masterpiece modes—spoken turns are transcribed in real time and saved directly into chat history and 30-day Recent Chats.
- **One-Click Recipe Idea Launching:** Whenever Emma suggests new recipe ideas in any text chat (Floating Emma, Flavor Forge Chat, Recipe Details Chat, or Meal Planner), each suggestion renders **📝 Create Recipe** and **📸 Create Masterpiece** buttons that open Flavor Forge in the selected mode with the idea prompt pre-filled and ready to send.
- **Floating Emma Helper & Audio Playback:** Page-aware site assistant available across the app (Home, Recipe Details, Meal Planner, Wellness, Profile) with compact/expanded/minimized/hidden states, speaker playback on every reply using the consistent female British voice, and smart auto-scroll to the top of long responses.
- **Masterpiece & Recipe Creation:** Generate **Quick Recipe Drafts** (free) or **Full Masterpieces** (1 token, with AI food photography, customizable kitchen/photo styling, bracket-free clean titles, and a save-to-vault reminder modal), then iterate freely in the same conversation.
- **Auto-Expanding Inputs & Reference Attachments:** All chat, reference, kitchen styling, and comment inputs auto-expand as you type or dictate, with client-side compression for large reference images (`.txt`, `.md`, `.docx`, `.pdf`, `.csv`, `.json`, or photos).
- **Automatic Allergy Protection:** Food allergies saved in your profile are automatically injected into Emma's prompts across text and live audio so unsafe ingredients are always avoided.

### 📊 Recipe Details, Nutrition & Multi-Photo Galleries
- **Deterministic USDA FoodData Central Nutrition:** Saved recipes and Masterpiece nutrition upgrades calculate per-serving macros and 13 micronutrients mathematically from USDA FoodData Central (with a MySQL lookup cache and always including **Dietary Fiber**, **Sodium**, and **Saturated Fat**), alongside transparent macro energy math and a free **🔬 Recalculate (USDA)** button for recipe owners and admins.
- **Inline Recipe Title Editing & Galleries:** Recipe creators can rename their own recipes inline directly from the recipe page, upload additional real-life dish photos after publishing while keeping Emma's AI image as the default cover, or pick any uploaded photo as the public cover.
- **Clipboard Export & Section-Specific British Audio:** One-click **Copy Full Recipe** (formatted rich text + plain text), speaker buttons in Emma's female British voice that read strictly **Ingredients**, strictly **Instructions**, or **Emma's Deep Dive**, **Admin Quick Edit** link, and **Similar & Suggested Recipes** at the bottom of every recipe page.
- **Ratings, Comments & Community:** 5-star ratings, threaded comments with image uploads and like/dislike voting, **Hover-to-Follow Chefs**, and header **Comment Notifications**.

### 🩺 Wellness Tools & Meal Planning Calendar
- **Wellness Calculators:** Interactive **BMI Calculator**, **TDEE / Caloric Needs Calculator**, and **Macronutrient Planner** that save directly to your user profile.
- **Meal Planning Calendar & Portion Scaling:** Plan Breakfast, Lunch, Dinner, and Snacks across **Day**, **Week**, and **Month** views in `0.25`-serving increments (`0.25` to `20` servings) with automatic daily macro/micronutrient aggregation against your saved Wellness Profile targets.
- **Emma Meal Concierge & Fitness Tracker:** Ask Emma (via text or live audio) to fill meal slots, balance your week, and automatically rescale meal servings to hit daily calorie targets, and log daily workouts with MET-based calorie burn and net calories.

### 🏆 Multi-Level Achievements & Shareable Profiles
- **Shareable Chef Profiles & SEO:** Copyable profile links (`/profile/{username}`) with Open Graph (`og:type="profile"`) and `ProfilePage` JSON-LD metadata (including server-side crawler previews in `bot-handler.php`).
- **Followers List:** Logged-in users viewing their own profile can click their **Followers** count to jump directly to their follower list.
- **Progressive Achievement Badges:** Earn multi-level badges across 6 tracks (**Masterpiece Chef**, **Community Chatterbox**, **Meal Prep Strategist**, **Active Explorer**, **Calorie Crusher**, **Vault Supporter**).

### 🔐 Security, Moderation & Admin Vault Control
- **Server-Side AI Proxy & Ephemeral Live Tokens:** All Gemini text, image, and Live Audio token requests are authenticated and proxied through `pantry-rebuild-api` (`/ai/chat`, `/ai/image`, `/ai/live-token`) so `GEMINI_API_KEY` never appears in frontend bundles or browser network requests.
- **Community Language Filter:** Server-side moderation backed by `dsojevic/profanity-list` (with word-boundary matching, leetspeak/obfuscation detection, and culinary safe-word awareness) validates comments, user profile fields, registration usernames, and user-edited recipe titles.
- **Auth & Upload Hardening:** Idempotent email verification, password strength meter, password reset emails, configurable beta invite codes, validated image uploads, and sanitized error responses.
- **Admin Dashboard & Private Emma Context:** Add/edit/publish/hide/delete recipes, jump straight from any recipe page via **Edit Recipe**, manage beta invite codes, use the **Free Admin Emma DB Assistant**, and upload a confidential **Emma Context Document** (`.txt`, `.md`, `.docx`, `.pdf`, etc.) in the **🧠 Emma Context** tab so Emma retains your personal/brand context across all text chats and Live Audio sessions.

---

## 🚀 Getting Started

1. **Clone the repository** and install dependencies:
   ```bash
   npm install
   ```
2. **Configure environment variables** in `.env` at the project root:
   ```env
   VITE_API_BASE_URL=http://localhost/pantry-rebuild-api/public
   ```
   *(Keep `GEMINI_API_KEY`, `USDA_API_KEY`, and Stripe secrets strictly in `pantry-rebuild-api/.env` on the backend—never in the frontend `.env`.)*
3. **Start the development server:**
   ```bash
   npm run dev
   ```
4. **Lint and build for production:**
   ```bash
   npm run lint
   npm run build
   ```
