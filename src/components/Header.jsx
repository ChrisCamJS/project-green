import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext'; 
import './Header.css';

const Header = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    
    // State to handle our veggie burger menu
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const handleLogout = async () => {
        await logout();
        setIsMenuOpen(false); // Close menu on logout
        navigate('/'); 
    };

    const toggleMenu = () => {
        setIsMenuOpen(!isMenuOpen);
    };

    const closeMenu = () => {
        setIsMenuOpen(false);
    };

    return (
        <header className="main-header">
            {/* Left Side: Logo */}
            <div className="logo-container">
                <h1><Link to="/" onClick={closeMenu}>The Veggie Vault</Link></h1>
            </div>

            {/* Mobile-Only Top Right Controls (Token + Hamburger) */}
            <div className="mobile-controls">
                {user?.account_tier === 'premium' && (
                    <span className="token-badge mobile-token" title="Emma Generation Tokens Remaining">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="token-icon">
                            <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22ZM12 15.5C13.933 15.5 15.5 13.933 15.5 12C15.5 10.067 13.933 8.5 12 8.5C10.067 8.5 8.5 10.067 8.5 12C8.5 13.933 10.067 15.5 12 15.5Z"></path>
                        </svg>
                        {Math.floor(Number(user.generation_tokens ?? 0))}
                    </span>
                )}
                
                <button 
                    className={`hamburger ${isMenuOpen ? 'open' : ''}`} 
                    onClick={toggleMenu} 
                    aria-label="Toggle navigation"
                >
                    <span></span>
                    <span></span>
                    <span></span>
                </button>
            </div>

            {/* The Nav Drawer */}
            <nav className={`main-nav ${isMenuOpen ? 'open' : ''}`}>
                <ul>
                    <li><Link to="/" onClick={closeMenu}>Home</Link></li>
                    <li><Link to="/wellness" onClick={closeMenu}>Wellness Tools</Link></li>
                    
                    {user ? (
                        <>
                            {user?.account_tier === 'premium' && (
                                <li><Link to="/engine" onClick={closeMenu}>Flavor Forge</Link></li>
                            )}
                            
                            {(user?.is_admin === 1 || user?.is_admin === '1' || user?.is_admin === true) && (
                                <li><Link to="/admin" onClick={closeMenu}>Admin Vault</Link></li>
                            )}
                            
                            <li className="user-status">
                                <span className="welcome-text">
                                    Welcome, {user.username || 'Love'} 
                                    {user?.account_tier === 'premium' && (
                                        <span title="Premium Member" className="premium-sparkle">✨</span>
                                    )}
                                </span>
                                
                                {/* Desktop Token Badge */}
                                {user?.account_tier === 'premium' && (
                                    <span className="token-badge desktop-token" title="Emma Generation Tokens Remaining">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="token-icon">
                                            <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22ZM12 15.5C13.933 15.5 15.5 13.933 15.5 12C15.5 10.067 13.933 8.5 12 8.5C10.067 8.5 8.5 10.067 8.5 12C8.5 13.933 10.067 15.5 12 15.5Z"></path>
                                        </svg>
                                        {Math.floor(Number(user.generation_tokens ?? 0))}
                                    </span>
                                )}
                            </li>
                            {user && (
                                <Link to="/favorites" className="nav-link">
                                    My Vault
                                </Link>
                            )}
                            <li>
                                <button onClick={handleLogout} className="logout-btn">
                                    Logout
                                </button>
                            </li>
                        </>
                    ) : (
                        <li><Link to="/login" onClick={closeMenu}>Login</Link></li>
                    )}
                </ul>
            </nav>
        </header>
    );
}

export default Header;