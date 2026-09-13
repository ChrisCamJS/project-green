import React, { useState, useEffect, useMemo } from 'react';
import RecipeCard from '../components/RecipeCard';
import SearchBar from '../components/SearchBar';
import Paginator from '../components/Paginator';
import { api } from '../services/api';
import styles from './Home.module.css';

/**
 * Home Component
 * Fetches and displays the master list of recipes from the Veggie Vault API.
 */
const Home = () => {
    const [recipes, setRecipes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');

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

    const filteredRecipes = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return recipes;

        return recipes.filter((recipe) => {
            const titleMatch = recipe.title?.toLowerCase().includes(query);
            const descMatch = recipe.description?.toLowerCase().includes(query);
            const ingredientMatch = Array.isArray(recipe.ingredients) && recipe.ingredients.some((ing) =>
                (typeof ing === 'string' ? ing : ing.name || '').toLowerCase().includes(query)
            );

            return titleMatch || descMatch || ingredientMatch;
        });
    }, [recipes, searchQuery]);

    if (loading) return <div className={styles.loadingState}>Unlocking the Vault...</div>;
    if (error) return <div className={styles.errorState}>{error}</div>;

    const indexOfLastRecipe = currentPage * itemsPerPage;
    const indexOfFirstRecipe = indexOfLastRecipe - itemsPerPage;
    const currentRecipes = filteredRecipes.slice(indexOfFirstRecipe, indexOfLastRecipe);

    return (
        <div className={styles.homeContainer}>
            <SearchBar
                searchQuery={searchQuery}
                onSearchChange={(value) => {
                    setSearchQuery(value);
                    setCurrentPage(1);
                }}
            />
            <h2 className={styles.title}>Latest Culinary Discoveries</h2>
            <p className={styles.subTitle}>Hand-crafted, plant-based, and powered by you.</p>
            <div className={styles.recipeGrid}>
                {currentRecipes.length > 0 ? (
                    currentRecipes.map(recipe => (
                        <RecipeCard key={recipe.id} recipe={recipe} />
                    ))
                ) : (
                    <p>
                        {searchQuery
                            ? `No wholesome dishes found matching "${searchQuery}".`
                            : 'The Vault is Empty. Add Some Recipes.'}
                    </p>
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