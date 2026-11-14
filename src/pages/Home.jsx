import React, { useState, useEffect, useMemo } from 'react';
import RecipeCard from '../components/RecipeCard';
import SearchBar from '../components/SearchBar';
import Paginator from '../components/Paginator';
import SEOHead from '../components/SEOHead';
import { SITE_URL, cleanSeoText } from '../utils/seoUtils';
import { api } from '../services/api';
import styles from './Home.module.css';

/**
 * Normalize backend boolean/int dietary flags (handles boolean, 1/0, '1'/'0', camelCase/snake_case).
 */
const isTruthyFlag = (val) => val === true || val === 1 || val === '1' || val === 'true';

const getRecipeDietaryFlags = (recipe) => ({
    glutenFree: isTruthyFlag(recipe?.is_gluten_free ?? recipe?.isGlutenFree),
    oilFree: isTruthyFlag(recipe?.is_oil_free ?? recipe?.isOilFree),
    sugarFree: isTruthyFlag(recipe?.is_sugar_free ?? recipe?.isSugarFree),
    wfpb:
        recipe?.is_wfpb !== undefined || recipe?.isWfpb !== undefined
            ? isTruthyFlag(recipe?.is_wfpb ?? recipe?.isWfpb)
            : true,
});

const DIETARY_FILTER_OPTIONS = [
    { key: 'glutenFree', label: 'Gluten-Free', icon: '🌾' },
    { key: 'oilFree', label: '100% Oil-Free', icon: '🌱' },
    { key: 'sugarFree', label: 'Refined Sugar-Free', icon: '🍯' },
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
    const [recipes, setRecipes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilters, setActiveFilters] = useState({
        glutenFree: false,
        oilFree: false,
        sugarFree: false,
    });

    // --- Pagination State ---
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(6); // change this number for different projects or views


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
    };

    const clearAllFilters = () => {
        setActiveFilters({
            glutenFree: false,
            oilFree: false,
            sugarFree: false,
        });
        setSearchQuery('');
        setCurrentPage(1);
    };

    const dietaryCounts = useMemo(() => {
        return recipes.reduce(
            (counts, recipe) => {
                const flags = getRecipeDietaryFlags(recipe);
                if (flags.glutenFree) counts.glutenFree += 1;
                if (flags.oilFree) counts.oilFree += 1;
                if (flags.sugarFree) counts.sugarFree += 1;
                return counts;
            },
            { glutenFree: 0, oilFree: 0, sugarFree: 0 }
        );
    }, [recipes]);

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

        return recipes.filter((recipe) => {
            const flags = getRecipeDietaryFlags(recipe);

            // 1. Apply pill filters
            if (activeFilters.glutenFree && !flags.glutenFree) return false;
            if (activeFilters.oilFree && !flags.oilFree) return false;
            if (activeFilters.sugarFree && !flags.sugarFree) return false;

            // 2. Apply dietary tags parsed from search bar input
            if (queryRequiredFlags.glutenFree && !flags.glutenFree) return false;
            if (queryRequiredFlags.oilFree && !flags.oilFree) return false;
            if (queryRequiredFlags.sugarFree && !flags.sugarFree) return false;

            // 3. Apply remaining free-text search across title, description, author, ingredients, and WFPB tags
            if (!remainingQuery) return true;

            const ingredientText = Array.isArray(recipe.ingredients)
                ? recipe.ingredients
                      .map((ing) => (typeof ing === 'string' ? ing : ing.ingredient_name || ing.name || ''))
                      .join(' ')
                : '';

            const generalTags = [
                flags.wfpb ? 'wfpb whole food plant-based whole-food plant-based plant-based plant based vegan' : '',
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
    }, [recipes, searchQuery, activeFilters]);

    const hasActiveFilters =
        Boolean(searchQuery.trim()) ||
        activeFilters.glutenFree ||
        activeFilters.oilFree ||
        activeFilters.sugarFree;

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

    const indexOfLastRecipe = currentPage * itemsPerPage;
    const indexOfFirstRecipe = indexOfLastRecipe - itemsPerPage;
    const currentRecipes = filteredRecipes.slice(indexOfFirstRecipe, indexOfLastRecipe);

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
                }}
            />
            <div className={styles.filterBar} role="group" aria-label="Dietary filters">
                <span className={styles.filterLabel}>Filter by Diet:</span>
                <div className={styles.filterPills}>
                    {DIETARY_FILTER_OPTIONS.map(({ key, label, icon }) => {
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
                                <span aria-hidden="true">{icon}</span>
                                <span>{label}</span>
                                <span className={styles.filterCount}>{dietaryCounts[key]}</span>
                            </button>
                        );
                    })}
                    {hasActiveFilters && (
                        <button
                            type="button"
                            onClick={clearAllFilters}
                            className={styles.clearFiltersBtn}
                        >
                            Clear Filters
                        </button>
                    )}
                </div>
                {hasActiveFilters && (
                    <p className={styles.filterStatusText}>
                        Showing <strong>{filteredRecipes.length}</strong> of {recipes.length} recipes
                    </p>
                )}
            </div>
            <h2 className={styles.title}>Latest Culinary Discoveries</h2>
            <p className={styles.subTitle}>Hand-crafted, plant-based, and powered by you.</p>
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

            {filteredRecipes.length > itemsPerPage && (
                <Paginator 
                    totalItems={filteredRecipes.length} 
                    itemsPerPage={itemsPerPage} 
                    currentPage={currentPage} 
                    onPageChange={setCurrentPage} 
                />
            )}
        </div>
    );
}
export default Home;