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
            // If PHP says our session died (401) on a user-initiated route, clear out the ghost login
            const isBackgroundCheck = endpoint === '/notifications' || endpoint === '/users/following';
            if (response.status === 401 && endpoint !== '/login' && endpoint !== '/register' && !isBackgroundCheck) {
                localStorage.removeItem('vault_user');
                window.location.href = '/login'; // Or reload so AuthContext resets
            }
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
        return fetchWrapper(`/recipes?id=${id}`, {
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
    register: (userData) => {
        return fetchWrapper('/register', {
            method: 'POST',
            body: JSON.stringify(userData),
        });
    },

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

    publishWithPhoto: (recipeId, base64Image, source = 'user', publish = null) => {
        return fetchWrapper('/recipes/attach-photo', {
            method: 'POST',
            body: JSON.stringify({ recipe_id: recipeId, image: base64Image, source, publish }),
        });
    },

    upgradeRecipeNutrition: (recipeId, deepDive, micros, publish = null) => {
        return fetchWrapper('/recipes/upgrade-nutrition', {
            method: 'POST',
            body: JSON.stringify({ recipe_id: recipeId, deep_dive: deepDive, micros, publish }),
        });
    },

    publishDraft: (recipeId) => {
        return fetchWrapper('/recipes/publish-draft', {
            method: 'POST',
            body: JSON.stringify({ recipe_id: recipeId }),
        });
    },

    // USER PROFILES & FOLLOWING
    getUserProfile: (identifier = '') => {
        const query = identifier ? `?identifier=${encodeURIComponent(identifier)}` : '';
        return fetchWrapper(`/users/profile${query}`, {
            method: 'GET',
            cache: 'no-store',
        });
    },

    updateUserProfile: (profileData) => {
        return fetchWrapper('/users/profile', {
            method: 'PUT',
            body: JSON.stringify(profileData),
        });
    },

    updateUserWellness: (wellnessData) => {
        return fetchWrapper('/users/wellness', {
            method: 'PUT',
            body: JSON.stringify(wellnessData),
        });
    },

    updateUserEmail: (emailData) => {
        return fetchWrapper('/users/email', {
            method: 'PUT',
            body: JSON.stringify(emailData),
        });
    },

    updateUserPassword: (passwordData) => {
        return fetchWrapper('/users/password', {
            method: 'PUT',
            body: JSON.stringify(passwordData),
        });
    },

    toggleFollowUser: (followedIdOrPayload, action = null) => {
        const payload = typeof followedIdOrPayload === 'object' && followedIdOrPayload !== null
            ? followedIdOrPayload
            : { followed_id: followedIdOrPayload, action };
        return fetchWrapper('/users/follow', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
    },

    getFollowedUsers: () => {
        return fetchWrapper('/users/following', {
            method: 'GET',
            cache: 'no-store',
        });
    },

    // PAYMENTS & TOKEN PURCHASES
    getPaymentConfig: () => {
        return fetchWrapper('/payments/config', {
            method: 'GET',
            cache: 'no-store',
        });
    },

    createCheckoutSession: (tokens, paymentMethod = 'card') => {
        return fetchWrapper('/payments/create-checkout-session', {
            method: 'POST',
            body: JSON.stringify({ tokens, paymentMethod }),
        });
    },

    verifyCheckoutSession: (sessionId) => {
        return fetchWrapper('/payments/verify-session', {
            method: 'POST',
            body: JSON.stringify({ session_id: sessionId }),
        });
    },

    // MEAL PLANNER
    getMealPlans: (startDate, endDate) => {
        const params = new URLSearchParams();
        if (startDate) params.set('start', startDate);
        if (endDate) params.set('end', endDate);
        const query = params.toString();
        return fetchWrapper(`/meal-plans${query ? `?${query}` : ''}`, {
            method: 'GET',
            cache: 'no-store',
        });
    },

    getPlannableRecipes: () => {
        return fetchWrapper('/meal-plans/recipes', {
            method: 'GET',
            cache: 'no-store',
        });
    },

    addMealPlanEntry: (payload) => {
        return fetchWrapper('/meal-plans', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
    },

    updateMealPlanEntry: (payload) => {
        return fetchWrapper('/meal-plans', {
            method: 'PUT',
            body: JSON.stringify(payload),
        });
    },

    deleteMealPlanEntry: (id) => {
        return fetchWrapper(`/meal-plans?id=${encodeURIComponent(id)}`, {
            method: 'DELETE',
        });
    },

    // RECENT CHATS (30-DAY DB STORAGE)
    getRecentChats: () => {
        return fetchWrapper('/chats', {
            method: 'GET',
            cache: 'no-store',
        });
    },

    saveRecentChat: (payload) => {
        return fetchWrapper('/chats', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
    },

    deleteRecentChat: (id) => {
        return fetchWrapper(`/chats?id=${encodeURIComponent(id)}`, {
            method: 'DELETE',
        });
    },

    clearRecentChats: () => {
        return fetchWrapper('/chats?all=1', {
            method: 'DELETE',
        });
    },

    // ADMIN RECIPES (FREE EMMA DB ASSISTANT)
    adminGetRecipes: () => {
        return fetchWrapper('/admin/recipes', {
            method: 'GET',
            cache: 'no-store',
        });
    },

    adminUpdateRecipes: (actions) => {
        return fetchWrapper('/admin/recipes', {
            method: 'PUT',
            body: JSON.stringify({ actions }),
        });
    },

    // NOTIFICATIONS
    getNotifications: () => {
        return fetchWrapper('/notifications', {
            method: 'GET',
            cache: 'no-store',
        });
    },

    markNotificationRead: (id) => {
        return fetchWrapper('/notifications/read', {
            method: 'PUT',
            body: JSON.stringify({ id }),
        });
    },

    markAllNotificationsRead: () => {
        return fetchWrapper('/notifications/read', {
            method: 'PUT',
            body: JSON.stringify({ all: true }),
        });
    },

    deleteNotification: (id) => {
        return fetchWrapper(`/notifications?id=${encodeURIComponent(id)}`, {
            method: 'DELETE',
        });
    },

    // EMAIL VERIFICATION
    verifyEmail: (token) => {
        return fetchWrapper('/verify-email', {
            method: 'POST',
            body: JSON.stringify({ token }),
        });
    },

    resendVerification: (email) => {
        return fetchWrapper('/resend-verification', {
            method: 'POST',
            body: JSON.stringify({ email }),
        });
    },

    // FITNESS ACTIVITIES
    getFitnessActivities: (startDate, endDate) => {
        const params = new URLSearchParams();
        if (startDate) params.set('start', startDate);
        if (endDate) params.set('end', endDate);
        const query = params.toString();
        return fetchWrapper(`/fitness-activities${query ? `?${query}` : ''}`, {
            method: 'GET',
            cache: 'no-store',
        });
    },

    addFitnessActivity: (payload) => {
        return fetchWrapper('/fitness-activities', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
    },

    deleteFitnessActivity: (id) => {
        return fetchWrapper(`/fitness-activities?id=${encodeURIComponent(id)}`, {
            method: 'DELETE',
        });
    },

    // AI PROXY (KEEPS GEMINI API KEY SERVER-SIDE)
    aiChat: (contents, systemInstruction) => {
        return fetchWrapper('/ai/chat', {
            method: 'POST',
            body: JSON.stringify({ contents, systemInstruction }),
        });
    },

    aiGenerateImage: (prompt) => {
        return fetchWrapper('/ai/image', {
            method: 'POST',
            body: JSON.stringify({ prompt }),
        });
    },

    aiGetLiveToken: () => {
        return fetchWrapper('/ai/live-token', {
            method: 'POST',
        });
    },

    // RECIPE PHOTO GALLERY
    addRecipePhotos: (recipeId, images, setPrimary = false) => {
        return fetchWrapper('/recipes/photos', {
            method: 'POST',
            body: JSON.stringify({ recipe_id: recipeId, images, set_primary: setPrimary }),
        });
    },

    setPrimaryRecipePhoto: (recipeId, imageUrl) => {
        return fetchWrapper('/recipes/primary-photo', {
            method: 'PUT',
            body: JSON.stringify({ recipe_id: recipeId, image_url: imageUrl }),
        });
    },

    deleteRecipePhoto: (recipeId, imageId) => {
        return fetchWrapper(`/recipes/photos?recipe_id=${encodeURIComponent(recipeId)}&image_id=${encodeURIComponent(imageId)}`, {
            method: 'DELETE',
        });
    },

    updateRecipeTitle: (recipeId, title) => {
        return fetchWrapper('/recipes/title', {
            method: 'PUT',
            body: JSON.stringify({ recipe_id: recipeId, title }),
        });
    },

    recalculateRecipeNutrition: (recipeId) => {
        return fetchWrapper('/recipes/calculate-nutrition', {
            method: 'POST',
            body: JSON.stringify({ recipe_id: recipeId }),
        });
    },

    // ADMIN EMMA CONTEXT DOCUMENT
    getAdminEmmaContext: () => {
        return fetchWrapper('/admin/emma-context', {
            method: 'GET',
            cache: 'no-store',
        });
    },

    saveAdminEmmaContext: (payload) => {
        return fetchWrapper('/admin/emma-context', {
            method: 'PUT',
            body: JSON.stringify(payload),
        });
    },

    deleteAdminEmmaContext: () => {
        return fetchWrapper('/admin/emma-context', {
            method: 'DELETE',
        });
    }
};