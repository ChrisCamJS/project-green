import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { saveLoginRedirect } from '../utils/authRedirect';

// Add 'children' to the destructured props
const ProtectedRoute = ({ children, adminOnly = false, premiumOnly = false }) => {
    const { user } = useAuth();
    const location = useLocation();

    // Boot them if no user is found at all
    if (!user) {
        saveLoginRedirect(location);
        return <Navigate to="/login" state={{ from: location }} replace />;
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