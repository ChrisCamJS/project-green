import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Add 'children' to the destructured props
const ProtectedRoute = ({ children, adminOnly = false, premiumOnly = false }) => {
    const { user } = useAuth();

    // Boot them if no user is found at all
    if (!user) {
        return <Navigate to="/login" replace />;
    }
    
    // They are logged in, but are they on the admin guest list?
    if (adminOnly && String(user.is_admin) !== '1' && user.is_admin !== true) {
        return <Navigate to="/" replace />;
    }

    // Check the account_tier
    if (premiumOnly && user.account_tier !== 'premium') {
        return <Navigate to="/" replace />;
    }

    // Unclip the velvet rope! 
    // If 'children' was passed directly, render it. Otherwise, fallback to Outlet for nested routes.
    return children ? children : <Outlet />;
}

export default ProtectedRoute;