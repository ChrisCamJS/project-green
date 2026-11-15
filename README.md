# 🥦 The Veggie Vault

**The Veggie Vault** is a full-featured, Whole-Food, Plant-Based (WFPB) & 100% oil-free culinary platform powered by **The Chris & Emma Show** ([chrisandemmashow.com](https://chrisandemmashow.com/)). It pairs community recipe sharing and mathematically verified macro/micronutrient breakdowns with **Emma**, an AI culinary & nutrition assistant available across text chat and real-time live voice.

---

## 🛠️ Tech Stack

- **Frontend:** React 19 + Vite 7, React Router v7, Vanilla CSS (modular & component-scoped stylesheets), PWA install support.
- **AI & Voice:** Google Gemini API (Recipe Engine, Meal Planning Concierge, Admin DB Assistant, AI food photography, Live Audio sessions, and Web Speech API voice-to-text dictation).
- **Backend API:** PHP 8+ REST API (`pantry-rebuild-api`) with PDO/MySQL, session authentication, email verification, and Stripe Checkout token purchases.

---

## ✨ Key Features

### 🔍 Recipe Discovery, Filtering & Viewing
- **Master Recipe Grid:** Browse community and AI-crafted recipes with prep/cook times, macro summaries, dietary badges (`100% Oil-Free`, `Gluten-Free`, `Refined Sugar-Free`), and oil-free ingredient rationales.
- **Smart Search & Filters:** Filter by dietary tags, free-text keywords/ingredients, and **minimum star rating** (`1+` to `4+` stars).
- **Flexible Pagination & Endless Scroll:** Switch seamlessly between **6**, **10**, or **15** recipes per page, or **Endless Scroll** (available on both the Home feed and the Admin Manage Recipes inventory).

### 🤖 Emma's Flavor Forge (AI Recipe & Nutrition Engine)
- **Multiple Creation Modes:** Create complete **Masterpiece Recipes** (with nutrition deep dives and AI-generated photography), chat in text mode, or talk hands-free in **Live Voice Audio** sessions.
- **Automatic Allergy Protection:** Food allergies saved in your profile are automatically injected into Emma's prompts across text and live audio so unsafe ingredients are always avoided.
- **Voice-to-Text Dictation:** Microphone dictation button built into every text chat input across the platform (Flavor Forge, Recipe Q&A, Meal Planner Concierge, and Admin DB Assistant).
- **30-Day Database Chat History:** Conversations are persisted in the database for 30 days, with one-click export to `.txt` or `.pdf` and support for uploading reference documents (`.txt`, `.md`, `.docx`, `.pdf`, `.csv`, `.json`, or images).
- **Transparent Metered Tokens:** Masterpiece generation, per-minute Live Audio billing, per-message Meal Planner chat, and Stripe token top-ups.

### 📊 Recipe Details, Nutrition & Community Engagement
- **Progressive Disclosure Nutrition:** `NutritionPanel` verifies macro math (`Protein × 4`, `Carbs × 4`, `Fat × 9`) and breaks down 15+ micronutrients with Daily Value percentages.
- **Localized Recipe Chat:** Ask Emma recipe-specific questions (text or live audio) right on any recipe page.
- **Ratings, Comments & Vaulting:** 5-star ratings, threaded comments with image uploads and like/dislike voting, and Favorites / Drafts in **My Vault**.
- **Hover-to-Follow Chefs:** Mouse over any chef's username on recipe cards, recipe pages, comments, sitemaps, or profiles to follow/unfollow them directly from a floating popover.
- **Comment Notifications:** Header notification bell with unread badge, dropdown feed, mark-as-read controls, and direct navigation when someone comments on or replies to your recipes.

### 🩺 Wellness Tools & Meal Planning Calendar
- **Wellness Calculators:** Interactive **BMI Calculator**, **TDEE / Caloric Needs Calculator**, and **Macronutrient Planner** that save directly to your user profile.
- **Meal Planning Calendar:** Plan Breakfast, Lunch, Dinner, and Snacks across **Day**, **Week**, and **Month** views with automatic daily macro/micronutrient aggregation against your saved Wellness Profile targets.
- **Emma Meal Concierge:** Ask Emma (via text or live audio) to fill meal slots, suggest nutrient-rich recipes, and balance your week.
- **Daily Fitness & Calorie Burn Tracker:** Log multiple workouts per day (`Running`, `Cycling`, `Walking`, `Hiking`, `Swimming`, or custom `Other` activities like *Basketball*) with duration in minutes, MET-based estimated calories burned, and daily net calories.

### 🏆 Multi-Level Achievements & Profiles
- **Chef Profiles:** Customizable bio, avatar, location, pronouns, website, dietary focus, and allergies.
- **Progressive Achievement Badges:** Earn multi-level badges with unlock timestamps across 6 tracks:
  - **Masterpiece Chef** (published recipes)
  - **Community Chatterbox** (recipe comments)
  - **Meal Prep Strategist** (meals planned)
  - **Active Explorer** (fitness sessions logged)
  - **Calorie Crusher** (active minutes logged)
  - **Vault Supporter** (chefs followed)

### 🔐 Security & Admin Vault Control
- **Email Verification & Auth:** Registration email verification links, password strength meter, resend verification flow, password reset emails, and configurable beta invite codes.
- **Admin Dashboard:** Add/edit/publish/hide/delete recipes, manage beta invite codes, and use the **Free Admin Emma DB Assistant** (0 tokens) to audit and batch-update recipe database fields via natural language.

---

## 🚀 Getting Started

1. **Clone the repository** and install dependencies:
   ```bash
   npm install
   ```
2. **Configure environment variables** in `.env` at the project root (pointing `VITE_API_BASE_URL` to your `pantry-rebuild-api` backend and configuring your `VITE_GEMINI_API_KEY`).
3. **Start the development server:**
   ```bash
   npm run dev
   ```
4. **Lint and build for production:**
   ```bash
   npm run lint
   npm run build
   ```
