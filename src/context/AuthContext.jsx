import React, { createContext, useState, useContext } from 'react';
import { api } from '../services/api'; 

// create the context
const AuthContext = createContext(null);

export const AuthProvider = ({children}) => {
    // initialize state from local storage
    const [user, setUser] = useState(()=> {
        const savedUser = localStorage.getItem('vault_user');
        return savedUser ? JSON.parse(savedUser) : null;
    });

    // call when login succeeds
    const loginContext = (userData) => {
        setUser(userData);
        localStorage.setItem('vault_user', JSON.stringify(userData));
    }
    
    // call this to bin the session and kick them out
    const logoutContext = async () => {
        try {
            // tell the backend to destroy the session cookie
            await api.logout();
        }
        catch (err) {
            console.error('Backend Logout Threw a Wobbly', err);
        }

        // wipe the react state and local storage
        setUser(null);
        localStorage.removeItem('vault_user');
    }

    // --- THE UPGRADED TOKEN MANAGER ---
    // Now accepts a specific cost, defaulting to 1 for full recipes
    const spendToken = async (cost = 1) => {
        if (!user) return { success: false, message: "No user found" };

        try {
            // Pass the specific cost down to the API service
            const response = await api.deductToken(cost);
            
            if (response.success) {
                // Clone the user object, update the token count, and save it!
                const updatedUser = { ...user, generation_tokens: response.tokensRemaining };
                setUser(updatedUser);
                localStorage.setItem('vault_user', JSON.stringify(updatedUser));
                return { success: true, tokensRemaining: response.tokensRemaining };
            }
        } catch (error) {
            console.error("Token deduction threw a strop:", error);
            return { success: false, message: error.message };
        }
    }

    return (
        <AuthContext.Provider value={{ user, login: loginContext, logout: logoutContext, spendToken }}>
            {children}
        </AuthContext.Provider>
    );
}

// A custom hook to make grabbing the context simple in other components
export const useAuth = () => useContext(AuthContext);