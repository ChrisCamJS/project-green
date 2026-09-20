// base url from .env file
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

/**
 * A generic helper function to handle fetch requests and catch errors.
 * @param {string} endpoint - The API route (e.g., '/recipes')
 * @param {Object} options - Fetch options (method, headers, body)
 */
async function fetchWrapper(endpoint, options = {}) {
    // check if we are sending files (like images)
    const isFormData = options.body instanceof FormData;
    
    // Conditionally build our headers
    const headers = { ...options.headers };
    if (!isFormData) {
        headers['Content-Type'] = 'application/json';
    }

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            credentials: 'include',
            headers,
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || data.message || 'Something went wrong with the API!');
        }
        return data;
    } catch (error) {
        console.error(`API Error at ${endpoint}:`, error);
        throw error;
    }
}

export const api = {
    // CORE RECIPE CRUD
    getRecipes: () => {
        return fetchWrapper('/recipes', { method: 'GET', cache: 'no-store' });
    },
    
    getRecipesById: (id) => {
        return fetchWrapper(`/recipes/single?id=${id}`, { method: 'GET' });
    },
    
    addRecipe: (recipeData) => {
        return fetchWrapper('/recipes', {
            method: 'POST',
            body: JSON.stringify(recipeData),
        });
    },

    updateRecipe: (id, recipeData) => {
        // Our PHP backend looks for the ID in the payload, so we spread it in here to be safe!
        return fetchWrapper('/recipes', {
            method: 'PUT',
            body: JSON.stringify({ ...recipeData, id }), 
        });
    },

    deleteRecipe: (id) => {
        return fetchWrapper(`/recipes?id=${id}`, { method: 'DELETE' });
    },

    rateRecipe: (recipeId, rating) => {
        return fetchWrapper('/recipes/rate', {
            method: 'POST',
            body: JSON.stringify({ recipe_id: recipeId, rating }),
        });
    },

    // COMMENTS & ENGAGEMENT
    getComments: (recipeId) => {
        return fetchWrapper(`/recipes/comments?recipe_id=${recipeId}`, { 
            method: 'GET',
            cache: 'no-store' // Keeps the banter fresh
        });
    },

    addComment: (commentData) => {
        // commentData should include: recipe_id, parent_id (optional), author_name, body, and image (base64 string)
        return fetchWrapper('/recipes/comments', {
            method: 'POST',
            body: JSON.stringify(commentData),
        });
    },

    voteComment: (commentId, voteType) => {
        // voteType must be exactly 'like' or 'dislike'
        return fetchWrapper('/recipes/comments/vote', {
            method: 'POST',
            body: JSON.stringify({ comment_id: commentId, vote_type: voteType }),
        });
    },

    // RECIPE MANAGEMENT & EXTRAS
    toggleDraft: async (id, isPublicStatus) => {
        const response = await fetch(`${API_BASE_URL}/recipes/draft`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ id, is_public: isPublicStatus })
        });
    return response.json();
    },

    uploadImages: (formData) => {
        return fetchWrapper('/upload', {
            method: 'POST',
            body: formData,
        });
    },

    saveGeneratedRecipe: (recipeData) => {
        return fetchWrapper('/recipes/save-generated', {
            method: 'POST',
            body: JSON.stringify(recipeData),
        });
    },

    // AUTHENTICATION & USERS
    login: (credentials) => {
        return fetchWrapper('/login', {
            method: 'POST',
            body: JSON.stringify(credentials),
        });
    },

    logout: () => {
        return fetchWrapper('/logout', { method: 'POST' });
    },

    deductToken: (cost = 1) => {
        return fetchWrapper('/users/deduct-token', { 
            method: 'POST',
            body: JSON.stringify({ cost })
        });
    },
    // FAVORITES & DRAFT GRADUATION
    toggleFavorite: (recipeId) => {
        return fetchWrapper('/recipes/favorite', {
            method: 'POST',
            body: JSON.stringify({ recipe_id: recipeId }),
        });
    },

    getFavorites: () => {
        return fetchWrapper('/recipes/favorites', {
            method: 'GET',
            cache: 'no-store',
        });
    },

    publishWithPhoto: (recipeId, base64Image) => {
        return fetchWrapper('/recipes/attach-photo', {
            method: 'POST',
            body: JSON.stringify({ recipe_id: recipeId, image: base64Image }),
        });
    }
};