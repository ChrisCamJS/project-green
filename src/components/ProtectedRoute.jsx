import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ adminOnly = false, premiumOnly = false }) => {
    const { user } = useAuth();

    // Boot them if no user is found at all
    if (!user) {
        return <Navigate to="/login" replace />;
    }
    
    // They are logged in, but are they on the admin guest list?
    // We use String() here just in case PHP sends it as a number, string, or boolean!
    if (adminOnly && String(user.is_admin) !== '1' && user.is_admin !== true) {
        return <Navigate to="/" replace />;
    }

    // We check the new account_tier from the database payload.
    if (premiumOnly && user.account_tier !== 'premium') {
        // Redirecting to home for now. 
        // I completely agree, we need a shiny upgrade page to take their money!
        return <Navigate to="/" replace />;
    }

    // If they pass all the checks, unclip the velvet rope and render the child routes!
    return <Outlet />;
}

export default ProtectedRoute;