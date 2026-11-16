import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import RecipeCard from '../components/RecipeCard';
import SearchBar from '../components/SearchBar';
import Paginator from '../components/Paginator';
import { RecipeViewControls, EndlessScrollSentinel } from '../components/RecipeViewControls';
import SEOHead from '../components/SEOHead';
import { SITE_URL, cleanSeoText } from '../utils/seoUtils';
import { isTruthyFlag, getRecipeDietaryFlags } from '../utils/dietaryUtils';
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

/**
 * Home Component
 * Fetches and displays the master list of recipes from the Veggie Vault API.
 */
const Home = () => {
    const { user } = useAuth();
    const { isFollowingUser } = useFollow();
    const [recipes, setRecipes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilters, setActiveFilters] = useState({
        glutenFree: false,
        oilFree: false,
        sugarFree: false,
    });
    const [minRating, setMinRating] = useState(0);
    const [followingOnly, setFollowingOnly] = useState(false);
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
    const [currentPage, setCurrentPage] = useState(1);
    const [viewMode, setViewMode] = useState('6');
    const [endlessCount, setEndlessCount] = useState(10);


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
        const needsGlutenFallback =
            recipes.length > 0 &&
            recipes.every((r) => !isTruthyFlag(r?.is_gluten_free ?? r?.isGlutenFree));

        return recipes.map((recipe) => {
            const flags = getRecipeDietaryFlags(recipe, {
                useGlutenHeuristicFallback: needsGlutenFallback,
            });
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

    const hasActiveFilters =
        Boolean(searchQuery.trim()) ||
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

    const isEndless = viewMode === 'endless';
    const itemsPerPage = isEndless ? filteredRecipes.length || 1 : Number(viewMode) || 6;
    const indexOfLastRecipe = currentPage * itemsPerPage;
    const indexOfFirstRecipe = indexOfLastRecipe - itemsPerPage;
    const currentRecipes = isEndless
        ? filteredRecipes.slice(0, endlessCount)
        : filteredRecipes.slice(indexOfFirstRecipe, indexOfLastRecipe);

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
            />
            <div className={styles.gridHeaderRow}>
                <div>
                    <h2 className={styles.title}>Latest Culinary Discoveries</h2>
                    <p className={styles.subTitle}>Hand-crafted, plant-based, and powered by you.</p>
                </div>
                <div className={styles.controlsCluster}>
                    <div className={styles.filterDropdownWrap} ref={filtersMenuRef}>
                        <button
                            type="button"
                            className={`${styles.filterDropdownBtn} ${
                                (activeFilters.glutenFree || activeFilters.oilFree || activeFilters.sugarFree || minRating > 0 || followingOnly)
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
                                        (activeFilters.glutenFree ? 1 : 0) +
                                        (activeFilters.oilFree ? 1 : 0) +
                                        (activeFilters.sugarFree ? 1 : 0) +
                                        (minRating > 0 ? 1 : 0) +
                                        (followingOnly ? 1 : 0);
                                    return count > 0 ? ` (${count})` : '';
                                })()}
                            </span>
                            <span aria-hidden="true">{showFiltersDropdown ? '▲' : '▼'}</span>
                        </button>

                        {showFiltersDropdown && (
                            <div className={styles.filterDropdownMenu} role="group" aria-label="Recipe filters">
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
                        totalItems={filteredRecipes.length}
                    />
                </div>
            </div>
            {hasActiveFilters && (
                <p className={styles.filterStatusText}>
                    Showing <strong>{filteredRecipes.length}</strong> of {recipes.length} recipes
                </p>
            )}
            <div className={styles.recipeGrid}>
                {currentRecipes.length > 0 ? (
                    currentRecipes.map(recipe => (
                        <RecipeCard key={recipe.id} recipe={recipe} />
                    ))
                ) : (
                    <div className={styles.emptyStateBox}>
                        <p>
                            {hasActiveFilters
                                ? `No wholesome dishes found matching ${
                                      searchQuery.trim() ? `"${searchQuery.trim()}" and ` : ''
                                  }your selected dietary filters.`
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
                    hasMore={endlessCount < filteredRecipes.length}
                    onLoadMore={handleLoadMoreEndless}
                    visibleCount={currentRecipes.length}
                    totalItems={filteredRecipes.length}
                />
            ) : (
                filteredRecipes.length > itemsPerPage && (
                    <Paginator 
                        totalItems={filteredRecipes.length} 
                        itemsPerPage={itemsPerPage} 
                        currentPage={currentPage} 
                        onPageChange={setCurrentPage} 
                    />
                )
            )}
        </div>
    );
}
export default Home;