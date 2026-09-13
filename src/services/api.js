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

    // RECIPE MANAGEMENT & EXTRAS
    toggleDraft: (id, isDraft) => {
        return fetchWrapper('/recipes/draft', {
            method: 'PUT',
            body: JSON.stringify({ id, is_draft: isDraft ? 1 : 0 }),
        });
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
};