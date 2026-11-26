import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import RecipeCard from '../components/RecipeCard';
import StoryCard from '../components/StoryCard';
import SearchBar from '../components/SearchBar';
import Paginator from '../components/Paginator';
import { RecipeViewControls, EndlessScrollSentinel } from '../components/RecipeViewControls';
import SEOHead from '../components/SEOHead';
import { SITE_URL, cleanSeoText } from '../utils/seoUtils';
import { getRecipeDietaryFlags } from '../utils/dietaryUtils';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useFollow } from '../context/FollowContext';
import styles from './Home.module.css';

const DIETARY_FILTER_OPTIONS = [
    { key: 'glutenFree', label: 'Gluten-Free' },
    { key: 'oilFree', label: 'Oil-Free' },
    { key: 'sugarFree', label: 'Refined Sugar-Free' },
];

const QUERY_TAG_PATTERNS = [
    { key: 'glutenFree', regex: /\b(?:gluten[-\s]?free|glutenfree|gf)\b/gi },
    { key: 'oilFree', regex: /\b(?:(?:100%\s*)?oil[-\s]?free|oilfree|no\s+oil)\b/gi },
    { key: 'sugarFree', regex: /\b(?:(?:refined\s+)?sugar[-\s]?free|sugarfree|no\s+(?:refined\s+)?sugar)\b/gi },
];

const HOME_GRID_STATE_KEY = 'veggieVault_homeGridState';
const DEFAULT_HOME_FEED_KEY = 'veggieVault_defaultHomeFeed';
const VALID_VIEW_MODES = ['6', '10', '15', 'endless'];
const VALID_FEED_TYPES = ['recipes', 'stories'];

const loadDefaultHomeFeed = () => {
    try {
        const saved = window.localStorage.getItem(DEFAULT_HOME_FEED_KEY);
        return VALID_FEED_TYPES.includes(saved) ? saved : 'recipes';
    } catch {
        return 'recipes';
    }
};

const loadSavedHomeGridState = () => {
    try {
        const raw = window.sessionStorage.getItem(HOME_GRID_STATE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
};

const persistHomeGridState = (state) => {
    try {
        window.sessionStorage.setItem(HOME_GRID_STATE_KEY, JSON.stringify(state));
    } catch {
        // Ignore storage quota or private-mode errors
    }
};

/**
 * Home Component
 * Fetches and displays the master list of recipes from the Veggie Vault API.
 */
const Home = () => {
    const { user } = useAuth();
    const { isFollowingUser } = useFollow();
    const [initialSavedState] = useState(() => loadSavedHomeGridState());
    const [feedType, setFeedType] = useState(() => {
        const savedFeed = initialSavedState?.feedType;
        if (VALID_FEED_TYPES.includes(savedFeed)) return savedFeed;
        return loadDefaultHomeFeed();
    });
    const [recipes, setRecipes] = useState([]);
    const [stories, setStories] = useState([]);
    const [storiesLoading, setStoriesLoading] = useState(false);
    const [storiesLoaded, setStoriesLoaded] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState(() =>
        typeof initialSavedState?.searchQuery === 'string' ? initialSavedState.searchQuery : ''
    );
    const [activeFilters, setActiveFilters] = useState(() => ({
        glutenFree: Boolean(initialSavedState?.activeFilters?.glutenFree),
        oilFree: Boolean(initialSavedState?.activeFilters?.oilFree),
        sugarFree: Boolean(initialSavedState?.activeFilters?.sugarFree),
    }));
    const [minRating, setMinRating] = useState(() => {
        const num = Number(initialSavedState?.minRating);
        return Number.isFinite(num) && num >= 0 ? num : 0;
    });
    const [followingOnly, setFollowingOnly] = useState(() => Boolean(initialSavedState?.followingOnly));
    const [showFiltersDropdown, setShowFiltersDropdown] = useState(false);
    const filtersMenuRef = useRef(null);

    useEffect(() => {
        if (!showFiltersDropdown) return undefined;
        const handleOutsideClick = (event) => {
            if (filtersMenuRef.current && !filtersMenuRef.current.contains(event.target)) {
                setShowFiltersDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleOutsideClick);
        document.addEventListener('touchstart', handleOutsideClick, { passive: true });
        return () => {
            document.removeEventListener('mousedown', handleOutsideClick);
            document.removeEventListener('touchstart', handleOutsideClick);
        };
    }, [showFiltersDropdown]);

    // --- Pagination / Endless Scroll State ---
    const [currentPage, setCurrentPage] = useState(() => {
        const page = Number(initialSavedState?.currentPage);
        return Number.isInteger(page) && page >= 1 ? page : 1;
    });
    const [viewMode, setViewMode] = useState(() => {
        const mode = String(initialSavedState?.viewMode || '');
        return VALID_VIEW_MODES.includes(mode) ? mode : '6';
    });
    const [endlessCount, setEndlessCount] = useState(() => {
        const count = Number(initialSavedState?.endlessCount);
        return Number.isInteger(count) && count >= 10 ? count : 10;
    });

    const savedScrollYRef = useRef(
        Number.isFinite(Number(initialSavedState?.scrollY)) && Number(initialSavedState?.scrollY) > 0
            ? Number(initialSavedState.scrollY)
            : 0
    );
    const lastScrollYRef = useRef(savedScrollYRef.current);
    const hasRestoredScrollRef = useRef(false);
    const latestGridStateRef = useRef({
        feedType,
        searchQuery,
        activeFilters,
        minRating,
        followingOnly,
        currentPage,
        viewMode,
        endlessCount,
    });

    useEffect(() => {
        if (loading) return undefined;
        const handleScroll = () => {
            lastScrollYRef.current = window.scrollY;
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, [loading]);

    useEffect(() => {
        const snapshot = {
            feedType,
            searchQuery,
            activeFilters,
            minRating,
            followingOnly,
            currentPage,
            viewMode,
            endlessCount,
        };
        latestGridStateRef.current = snapshot;
        persistHomeGridState({
            ...snapshot,
            scrollY: lastScrollYRef.current,
        });
    }, [feedType, currentPage, viewMode, endlessCount, searchQuery, activeFilters, minRating, followingOnly]);

    useEffect(() => {
        const handleResetPagination = () => {
            setCurrentPage(1);
            setEndlessCount(10);
            lastScrollYRef.current = 0;
            latestGridStateRef.current = {
                ...latestGridStateRef.current,
                currentPage: 1,
                endlessCount: 10,
            };
            window.scrollTo({ top: 0, behavior: 'smooth' });
        };

        window.addEventListener('veggie-vault:reset-home-pagination', handleResetPagination);
        return () => {
            window.removeEventListener('veggie-vault:reset-home-pagination', handleResetPagination);
            persistHomeGridState({
                ...latestGridStateRef.current,
                scrollY: lastScrollYRef.current,
            });
        };
    }, []);

    useEffect(() => {
        if (feedType !== 'stories' || storiesLoaded) return undefined;
        let active = true;
        setStoriesLoading(true);
        api.getStories({ page: 1, perPage: 100 })
            .then((res) => {
                if (!active) return;
                const list = Array.isArray(res?.stories) ? res.stories : [];
                setStories(list);
                setStoriesLoaded(true);
            })
            .catch((err) => {
                console.error('Failed to fetch published stories:', err);
            })
            .finally(() => {
                if (active) setStoriesLoading(false);
            });
        return () => {
            active = false;
        };
    }, [feedType, storiesLoaded]);

    const handleFeedTypeChange = (nextFeed) => {
        if (!VALID_FEED_TYPES.includes(nextFeed) || nextFeed === feedType) return;
        setFeedType(nextFeed);
        setCurrentPage(1);
        setEndlessCount(10);
    };

    useEffect(() => {
        if (loading || hasRestoredScrollRef.current) return undefined;
        hasRestoredScrollRef.current = true;
        const targetY = savedScrollYRef.current;
        if (targetY <= 0) return undefined;

        lastScrollYRef.current = targetY;
        const rafId = window.requestAnimationFrame(() => {
            try {
                window.scrollTo({ top: targetY, left: 0, behavior: 'instant' });
            } catch {
                window.scrollTo(0, targetY);
            }
        });
        return () => window.cancelAnimationFrame(rafId);
    }, [loading]);


    useEffect(() => {
        const loadRecipes = async () => {
            try {
                setLoading(true);
                const data = await api.getRecipes();
                setRecipes(data.recipes || data);
                setError(null);
            } catch {
                setError('Failed to retrieve recipes from the vault. Check the connection');
            }
            finally {
                setLoading(false);
            }
        }
        loadRecipes();
    }, []);

    const toggleFilter = (filterKey) => {
        setActiveFilters((prev) => ({
            ...prev,
            [filterKey]: !prev[filterKey],
        }));
        setCurrentPage(1);
        setEndlessCount(10);
    };

    const handleRatingChange = (val) => {
        setMinRating(Number(val));
        setCurrentPage(1);
        setEndlessCount(10);
    };

    const handleViewModeChange = (nextMode) => {
        setViewMode(nextMode);
        setCurrentPage(1);
        setEndlessCount(10);
    };

    const handleLoadMoreEndless = useCallback(() => {
        setEndlessCount((prev) => prev + 10);
    }, []);

    const clearAllFilters = () => {
        setActiveFilters({
            glutenFree: false,
            oilFree: false,
            sugarFree: false,
        });
        setMinRating(0);
        setFollowingOnly(false);
        setSearchQuery('');
        setCurrentPage(1);
        setEndlessCount(10);
    };

    const normalizedRecipes = useMemo(() => {
        return recipes.map((recipe) => {
            const flags = getRecipeDietaryFlags(recipe);
            return {
                ...recipe,
                isGlutenFree: flags.glutenFree,
                is_gluten_free: flags.glutenFree ? 1 : 0,
                isOilFree: flags.oilFree,
                is_oil_free: flags.oilFree ? 1 : 0,
                isSugarFree: flags.sugarFree,
                is_sugar_free: flags.sugarFree ? 1 : 0,
                isWfpb: flags.wfpb,
            };
        });
    }, [recipes]);

    const dietaryCounts = useMemo(() => {
        return normalizedRecipes.reduce(
            (counts, recipe) => {
                if (recipe.isGlutenFree) counts.glutenFree += 1;
                if (recipe.isOilFree) counts.oilFree += 1;
                if (recipe.isSugarFree) counts.sugarFree += 1;
                return counts;
            },
            { glutenFree: 0, oilFree: 0, sugarFree: 0 }
        );
    }, [normalizedRecipes]);

    const filteredRecipes = useMemo(() => {
        const rawQuery = searchQuery.trim().toLowerCase();

        // Detect dietary tag phrases typed in the search bar (e.g. "gluten-free", "oil-free", "sugar-free")
        const queryRequiredFlags = {
            glutenFree: false,
            oilFree: false,
            sugarFree: false,
        };
        let remainingQuery = rawQuery;
        if (rawQuery) {
            QUERY_TAG_PATTERNS.forEach(({ key, regex }) => {
                regex.lastIndex = 0;
                if (regex.test(remainingQuery)) {
                    queryRequiredFlags[key] = true;
                    regex.lastIndex = 0;
                    remainingQuery = remainingQuery.replace(regex, ' ');
                }
            });
            remainingQuery = remainingQuery.replace(/\s+/g, ' ').trim();
        }
        const normalizedRemaining = remainingQuery.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();

        return normalizedRecipes.filter((recipe) => {
            // 1. Apply pill filters
            if (activeFilters.glutenFree && !recipe.isGlutenFree) return false;
            if (activeFilters.oilFree && !recipe.isOilFree) return false;
            if (activeFilters.sugarFree && !recipe.isSugarFree) return false;

            // 1b. Apply minimum star rating filter
            if (minRating > 0) {
                const ratingVal = Number(recipe.averageRating ?? recipe.average_rating ?? 0);
                if (ratingVal < minRating) return false;
            }

            // 1c. Apply "Following Only" filter
            if (followingOnly) {
                const followed =
                    isFollowingUser({
                        userId: recipe.authorId || recipe.user_id,
                        username: recipe.authorName,
                    }) || Boolean(recipe.isFollowedAuthor);
                if (!followed) return false;
            }

            // 2. Apply dietary tags parsed from search bar input
            if (queryRequiredFlags.glutenFree && !recipe.isGlutenFree) return false;
            if (queryRequiredFlags.oilFree && !recipe.isOilFree) return false;
            if (queryRequiredFlags.sugarFree && !recipe.isSugarFree) return false;

            // 3. Apply remaining free-text search across title, description, author, ingredients, and WFPB tags
            if (!remainingQuery) return true;

            const ingredientText = Array.isArray(recipe.ingredients)
                ? recipe.ingredients
                      .map((ing) => (typeof ing === 'string' ? ing : ing.ingredient_name || ing.name || ''))
                      .join(' ')
                : '';

            const generalTags = [
                recipe.isWfpb ? 'wfpb whole food plant-based whole-food plant-based plant-based plant based vegan' : '',
            ]
                .filter(Boolean)
                .join(' ');

            const searchableText = [
                recipe.title || '',
                recipe.description || '',
                recipe.authorName || '',
                ingredientText,
                generalTags,
            ]
                .join(' ')
                .toLowerCase();

            const normalizedSearchable = searchableText.replace(/-/g, ' ').replace(/\s+/g, ' ');

            return (
                searchableText.includes(remainingQuery) ||
                (normalizedRemaining && normalizedSearchable.includes(normalizedRemaining))
            );
        });
    }, [normalizedRecipes, searchQuery, activeFilters, minRating, followingOnly, isFollowingUser]);

    const filteredStories = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return stories.filter((story) => {
            if (followingOnly && user) {
                const authorId = story.userId || story.user_id;
                if (!authorId || !isFollowingUser(authorId)) {
                    return false;
                }
            }
            if (!q) return true;
            const titleMatch = String(story.title || '').toLowerCase().includes(q);
            const summaryMatch = String(story.summary || story.excerpt || '').toLowerCase().includes(q);
            const authorMatch = String(story.authorName || story.author_name || story.authorDisplayName || '').toLowerCase().includes(q);
            const recipeMatch = String(story.recipeTitle || story.recipe_title || '').toLowerCase().includes(q);
            return titleMatch || summaryMatch || authorMatch || recipeMatch;
        });
    }, [stories, searchQuery, followingOnly, user, isFollowingUser]);

    const isStoriesFeed = feedType === 'stories';
    const hasActiveFilters = isStoriesFeed
        ? Boolean(searchQuery.trim()) || followingOnly
        : Boolean(searchQuery.trim()) ||
          activeFilters.glutenFree ||
          activeFilters.oilFree ||
          activeFilters.sugarFree ||
          minRating > 0 ||
          followingOnly;

    const homeJsonLd = useMemo(() => {
        const publicList = (recipes || []).slice(0, 24);
        return {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: 'The Veggie Vault — Whole Food Plant-Based Recipes',
            url: `${SITE_URL}/`,
            description: 'Discover wholesome, 100% oil-free, plant-based culinary creations with full macronutrient and micronutrient breakdowns.',
            mainEntity: {
                '@type': 'ItemList',
                numberOfItems: publicList.length,
                itemListElement: publicList.map((recipe, idx) => ({
                    '@type': 'ListItem',
                    position: idx + 1,
                    url: `${SITE_URL}/recipe/${recipe.id}`,
                    name: recipe.title,
                })),
            },
        };
    }, [recipes]);

    if (loading) return <div className={styles.loadingState}>Unlocking the Vault...</div>;
    if (error) return <div className={styles.errorState}>{error}</div>;

    const activeFeedList = isStoriesFeed ? filteredStories : filteredRecipes;
    const isEndless = viewMode === 'endless';
    const itemsPerPage = isEndless ? activeFeedList.length || 1 : Number(viewMode) || 6;
    const totalPages = Math.max(1, Math.ceil(activeFeedList.length / itemsPerPage));
    const safeCurrentPage = Math.min(currentPage, totalPages);
    const indexOfLastRecipe = safeCurrentPage * itemsPerPage;
    const indexOfFirstRecipe = indexOfLastRecipe - itemsPerPage;
    const currentItems = isEndless
        ? activeFeedList.slice(0, endlessCount)
        : activeFeedList.slice(indexOfFirstRecipe, indexOfLastRecipe);

    return (
        <div className={styles.homeContainer}>
            <SEOHead
                title="The Veggie Vault | Whole Food Plant-Based Recipes & Engine"
                description={
                    recipes[0]?.description
                        ? `Explore ${recipes.length}+ whole-food, oil-free plant-based recipes including ${recipes[0].title}. ${cleanSeoText(recipes[0].description, 95)}`
                        : undefined
                }
                canonicalPath="/"
                jsonLd={homeJsonLd}
            />
            <SearchBar
                searchQuery={searchQuery}
                onSearchChange={(value) => {
                    setSearchQuery(value);
                    setCurrentPage(1);
                    setEndlessCount(10);
                }}
                placeholder={
                    isStoriesFeed
                        ? 'Search stories by title, chef, or linked recipe...'
                        : undefined
                }
            />
            <div className={styles.gridHeaderRow}>
                <div>
                    <h2 className={styles.title}>
                        {isStoriesFeed ? 'Latest Recipe Stories' : 'Latest Culinary Discoveries'}
                    </h2>
                    <p className={styles.subTitle}>
                        {isStoriesFeed
                            ? 'Cooking reflections, kitchen notes, and plant-based stories from our community.'
                            : 'Hand-crafted, plant-based, and powered by you.'}
                    </p>
                </div>
                <div className={styles.controlsCluster}>
                    <div className={styles.filterDropdownWrap} ref={filtersMenuRef}>
                        <button
                            type="button"
                            className={`${styles.filterDropdownBtn} ${
                                (isStoriesFeed || activeFilters.glutenFree || activeFilters.oilFree || activeFilters.sugarFree || minRating > 0 || followingOnly)
                                    ? styles.filterDropdownBtnActive
                                    : ''
                            }`}
                            onClick={() => setShowFiltersDropdown((prev) => !prev)}
                            aria-expanded={showFiltersDropdown}
                            aria-haspopup="true"
                        >
                            <span>
                                Filters
                                {(() => {
                                    const count =
                                        (isStoriesFeed ? 1 : 0) +
                                        (!isStoriesFeed && activeFilters.glutenFree ? 1 : 0) +
                                        (!isStoriesFeed && activeFilters.oilFree ? 1 : 0) +
                                        (!isStoriesFeed && activeFilters.sugarFree ? 1 : 0) +
                                        (!isStoriesFeed && minRating > 0 ? 1 : 0) +
                                        (followingOnly ? 1 : 0);
                                    return count > 0 ? ` (${count})` : '';
                                })()}
                            </span>
                            <span aria-hidden="true">{showFiltersDropdown ? '▲' : '▼'}</span>
                        </button>

                        {showFiltersDropdown && (
                            <div className={styles.filterDropdownMenu} role="group" aria-label="Feed and recipe filters">
                                <div className={styles.filterDropdownSectionTitle}>Show in Feed</div>
                                <div className={styles.filterFeedRow}>
                                    <button
                                        type="button"
                                        onClick={() => handleFeedTypeChange('recipes')}
                                        aria-pressed={!isStoriesFeed}
                                        className={`${styles.filterPill} ${styles.oilFreePill} ${
                                            !isStoriesFeed ? styles.filterPillActive : ''
                                        }`}
                                    >
                                        🍽️ Recipes
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleFeedTypeChange('stories')}
                                        aria-pressed={isStoriesFeed}
                                        className={`${styles.filterPill} ${styles.oilFreePill} ${
                                            isStoriesFeed ? styles.filterPillActive : ''
                                        }`}
                                    >
                                        📖 Stories
                                    </button>
                                </div>

                                {!isStoriesFeed && (
                                    <>
                                        <div className={styles.filterDropdownSectionTitle}>Diet</div>
                                        <div className={styles.filterDropdownPills}>
                                            {DIETARY_FILTER_OPTIONS.map(({ key, label }) => {
                                                const isActive = activeFilters[key];
                                                return (
                                                    <button
                                                        key={key}
                                                        type="button"
                                                        onClick={() => toggleFilter(key)}
                                                        aria-pressed={isActive}
                                                        className={`${styles.filterPill} ${styles[`${key}Pill`]} ${
                                                            isActive ? styles.filterPillActive : ''
                                                        }`}
                                                    >
                                                        <span>{label}</span>
                                                        <span className={styles.filterCount}>{dietaryCounts[key]}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        <div className={styles.filterDropdownSectionTitle}>Rating</div>
                                        <select
                                            className={styles.ratingFilterSelect}
                                            value={minRating}
                                            onChange={(e) => handleRatingChange(e.target.value)}
                                            aria-label="Filter by minimum star rating"
                                        >
                                            <option value={0}>⭐ All Ratings</option>
                                            <option value={4}>⭐ 4+ Stars</option>
                                            <option value={3}>⭐ 3+ Stars</option>
                                            <option value={2}>⭐ 2+ Stars</option>
                                            <option value={1}>⭐ 1+ Stars</option>
                                        </select>
                                    </>
                                )}

                                {user && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setFollowingOnly((prev) => !prev);
                                            setCurrentPage(1);
                                            setEndlessCount(10);
                                        }}
                                        aria-pressed={followingOnly}
                                        className={`${styles.filterPill} ${styles.oilFreePill} ${
                                            followingOnly ? styles.filterPillActive : ''
                                        }`}
                                        style={{ width: '100%', justifyContent: 'center' }}
                                    >
                                        <span>Following Only</span>
                                    </button>
                                )}

                                {hasActiveFilters && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            clearAllFilters();
                                            setShowFiltersDropdown(false);
                                        }}
                                        className={styles.clearFiltersBtn}
                                        style={{ width: '100%' }}
                                    >
                                        Clear Filters
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    <RecipeViewControls
                        viewMode={viewMode}
                        onChange={handleViewModeChange}
                        totalItems={activeFeedList.length}
                        itemLabel={isStoriesFeed ? 'stories' : 'recipes'}
                    />
                </div>
            </div>
            {hasActiveFilters && (
                <p className={styles.filterStatusText}>
                    Showing <strong>{activeFeedList.length}</strong> of{' '}
                    {isStoriesFeed ? `${stories.length} stories` : `${recipes.length} recipes`}
                </p>
            )}
            <div className={styles.recipeGrid}>
                {isStoriesFeed && storiesLoading && !storiesLoaded ? (
                    <div className={styles.emptyStateBox}>Loading latest stories...</div>
                ) : currentItems.length > 0 ? (
                    isStoriesFeed ? (
                        currentItems.map((story) => (
                            <StoryCard key={story.id || story.slug} story={story} showRecipeTag />
                        ))
                    ) : (
                        currentItems.map((recipe) => (
                            <RecipeCard key={recipe.id} recipe={recipe} />
                        ))
                    )
                ) : (
                    <div className={styles.emptyStateBox}>
                        <p>
                            {hasActiveFilters
                                ? `No ${isStoriesFeed ? 'stories' : 'wholesome dishes'} found matching ${
                                      searchQuery.trim() ? `"${searchQuery.trim()}" and ` : ''
                                  }your selected filters.`
                                : isStoriesFeed
                                    ? 'No published stories yet. Start one from any recipe!'
                                    : 'The Vault is Empty. Add Some Recipes.'}
                        </p>
                        {hasActiveFilters && (
                            <button
                                type="button"
                                onClick={clearAllFilters}
                                className={styles.emptyResetBtn}
                            >
                                Reset Search & Filters
                            </button>
                        )}
                    </div>
                )}
            </div>

            {isEndless ? (
                <EndlessScrollSentinel
                    hasMore={endlessCount < activeFeedList.length}
                    onLoadMore={handleLoadMoreEndless}
                    visibleCount={currentItems.length}
                    totalItems={activeFeedList.length}
                />
            ) : (
                activeFeedList.length > itemsPerPage && (
                    <Paginator 
                        totalItems={activeFeedList.length} 
                        itemsPerPage={itemsPerPage} 
                        currentPage={safeCurrentPage} 
                        onPageChange={setCurrentPage} 
                    />
                )
            )}
        </div>
    );
}
export default Home;