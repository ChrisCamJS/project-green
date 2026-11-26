import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';
import './Header.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const checkStandaloneMode = () => {
    if (typeof window === 'undefined') return false;
    return Boolean(
        window.matchMedia?.('(display-mode: standalone)')?.matches ||
        window.navigator?.standalone === true
    );
};

const resolveAvatarSrc = (rawPath) => {
    if (!rawPath) return null;
    const str = String(rawPath).trim();
    if (!str) return null;
    if (str.startsWith('http://') || str.startsWith('https://') || str.startsWith('data:')) {
        return str;
    }
    return `${API_BASE_URL}${str.startsWith('/') ? '' : '/'}${str}`;
};

const TokenIcon = ({ className = 'token-icon', style }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className={className}
        style={style}
        aria-hidden="true"
    >
        <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22ZM12 15.5C13.933 15.5 15.5 13.933 15.5 12C15.5 10.067 13.933 8.5 12 8.5C10.067 8.5 8.5 10.067 8.5 12C8.5 13.933 10.067 15.5 12 15.5Z"></path>
    </svg>
);

const Header = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
    const [isStandalone, setIsStandalone] = useState(checkStandaloneMode);
    const [avatarFailed, setAvatarFailed] = useState(false);

    const navRef = useRef(null);
    const hamburgerRef = useRef(null);
    const accountMenuRef = useRef(null);

    const isAdmin = Boolean(
        user && (user.is_admin === 1 || user.is_admin === '1' || user.is_admin === true)
    );
    const isPremium = user?.account_tier === 'premium';

    const closeAllMenus = () => {
        setIsMenuOpen(false);
        setIsAccountMenuOpen(false);
    };

    // Close mobile drawer on outside click or Escape
    useEffect(() => {
        if (!isMenuOpen) return undefined;

        const handleOutsideInteraction = (event) => {
            const clickedInsideNav = navRef.current?.contains(event.target);
            const clickedHamburger = hamburgerRef.current?.contains(event.target);
            if (!clickedInsideNav && !clickedHamburger) {
                setIsMenuOpen(false);
            }
        };

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                setIsMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handleOutsideInteraction);
        document.addEventListener('touchstart', handleOutsideInteraction, { passive: true });
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('mousedown', handleOutsideInteraction);
            document.removeEventListener('touchstart', handleOutsideInteraction);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isMenuOpen]);

    // Close desktop account dropdown on outside click or Escape
    useEffect(() => {
        if (!isAccountMenuOpen) return undefined;

        const handleOutsideInteraction = (event) => {
            if (!accountMenuRef.current?.contains(event.target)) {
                setIsAccountMenuOpen(false);
            }
        };

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                setIsAccountMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handleOutsideInteraction);
        document.addEventListener('touchstart', handleOutsideInteraction, { passive: true });
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('mousedown', handleOutsideInteraction);
            document.removeEventListener('touchstart', handleOutsideInteraction);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isAccountMenuOpen]);

    // Track standalone PWA mode
    useEffect(() => {
        const mediaQuery = window.matchMedia?.('(display-mode: standalone)');
        const onDisplayChange = (e) => {
            if (e.matches) setIsStandalone(true);
        };
        const onInstalled = () => setIsStandalone(true);

        mediaQuery?.addEventListener?.('change', onDisplayChange);
        window.addEventListener('appinstalled', onInstalled);
        return () => {
            mediaQuery?.removeEventListener?.('change', onDisplayChange);
            window.removeEventListener('appinstalled', onInstalled);
        };
    }, []);

    const handleInstallClick = () => {
        closeAllMenus();
        window.dispatchEvent(new CustomEvent('veggie-vault:install-app'));
    };

    const handleLogout = async () => {
        await logout();
        closeAllMenus();
        navigate('/');
    };

    const isActivePath = (path) => {
        if (path === '/') {
            return location.pathname === '/';
        }
        return location.pathname === path || location.pathname.startsWith(`${path}/`);
    };

    const displayName = user?.username || 'Chef';
    const userInitial = String(displayName).charAt(0).toUpperCase();
    const avatarSrc = !avatarFailed ? resolveAvatarSrc(user?.profile_image) : null;
    const tokenBalance = Number(Number(user?.generation_tokens ?? 0).toFixed(1));

    const handleBrandClick = () => {
        closeAllMenus();
        try {
            const raw = window.sessionStorage.getItem('veggieVault_homeGridState');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    window.sessionStorage.setItem(
                        'veggieVault_homeGridState',
                        JSON.stringify({
                            ...parsed,
                            currentPage: 1,
                            endlessCount: 10,
                            scrollY: 0,
                        })
                    );
                }
            }
        } catch {
            // Ignore storage failures
        }
        window.dispatchEvent(new CustomEvent('veggie-vault:reset-home-pagination'));
    };

    return (
        <header className="main-header">
            <div className="header-inner">
                {/* ZONE 1 (Left): Brand */}
                <div className="logo-container">
                    <h1>
                        <Link to="/" onClick={handleBrandClick}>
                            The Veggie Vault
                        </Link>
                    </h1>
                </div>

                {/* ZONE 2 (Center, Desktop): Clean Primary Navigation */}
                <nav className="desktop-primary-nav" aria-label="Primary navigation">
                    <Link
                        to="/"
                        onClick={closeAllMenus}
                        className={`nav-item-link ${isActivePath('/') ? 'active' : ''}`}
                    >
                        Home
                    </Link>

                    {user && isPremium && (
                        <Link
                            to="/engine"
                            onClick={closeAllMenus}
                            className={`nav-item-link ${isActivePath('/engine') ? 'active' : ''}`}
                        >
                            Flavor Forge
                        </Link>
                    )}

                    {user && (
                        <Link
                            to="/meal-planner"
                            onClick={closeAllMenus}
                            className={`nav-item-link ${isActivePath('/meal-planner') ? 'active' : ''}`}
                        >
                            Meal Plan
                        </Link>
                    )}

                    <Link
                        to="/wellness"
                        onClick={closeAllMenus}
                        className={`nav-item-link ${isActivePath('/wellness') ? 'active' : ''}`}
                    >
                        Wellness
                    </Link>

                    {user && (
                        <Link
                            to="/favorites"
                            onClick={closeAllMenus}
                            className={`nav-item-link ${isActivePath('/favorites') ? 'active' : ''}`}
                        >
                            My Vault
                        </Link>
                    )}
                </nav>

                {/* ZONE 3 (Right, Desktop): Utility & Account Cluster */}
                <div className="desktop-utility-group">
                    {user ? (
                        <>
                            {isPremium && (
                                <Link
                                    to="/buy-tokens"
                                    onClick={closeAllMenus}
                                    className="token-badge"
                                    title="Emma Generation Tokens — Click to Buy More Tokens"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="token-icon">
                                        <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22ZM12 15.5C13.933 15.5 15.5 13.933 15.5 12C15.5 10.067 13.933 8.5 12 8.5C10.067 8.5 8.5 10.067 8.5 12C8.5 13.933 10.067 15.5 12 15.5Z"></path>
                                    </svg>
                                    <span>{tokenBalance}</span>
                                </Link>
                            )}

                            <div className="desktop-notif-wrap">
                                <NotificationBell onNavigate={closeAllMenus} />
                            </div>

                            <div className="account-menu-wrapper" ref={accountMenuRef}>
                                <button
                                    type="button"
                                    className={`account-menu-trigger ${isAccountMenuOpen ? 'open' : ''}`}
                                    onClick={() => setIsAccountMenuOpen((prev) => !prev)}
                                    aria-expanded={isAccountMenuOpen}
                                    aria-haspopup="menu"
                                >
                                    {avatarSrc ? (
                                        <img
                                            src={avatarSrc}
                                            alt={displayName}
                                            className="account-avatar-img"
                                            onError={() => setAvatarFailed(true)}
                                        />
                                    ) : (
                                        <span className="account-avatar-dot" aria-hidden="true">
                                            {userInitial}
                                        </span>
                                    )}
                                    <span className="account-trigger-name">{displayName}</span>
                                    <span className="account-trigger-caret" aria-hidden="true">
                                        ▾
                                    </span>
                                </button>

                                {isAccountMenuOpen && (
                                    <div className="account-dropdown" role="menu">
                                        <div className="account-dropdown-header">
                                            <span className="account-dropdown-signed">Signed in as</span>
                                            <strong className="account-dropdown-user">@{displayName}</strong>
                                        </div>

                                        <Link
                                            to="/profile"
                                            role="menuitem"
                                            onClick={closeAllMenus}
                                            className="account-dropdown-item"
                                        >
                                            <span>👤 My Profile</span>
                                        </Link>

                                        <Link
                                            to="/favorites"
                                            role="menuitem"
                                            onClick={closeAllMenus}
                                            className="account-dropdown-item"
                                        >
                                            <span>💚 My Vault</span>
                                        </Link>

                                        <Link
                                            to="/buy-tokens"
                                            role="menuitem"
                                            onClick={closeAllMenus}
                                            className="account-dropdown-item"
                                        >
                                            <TokenIcon />
                                            <span>Buy Tokens</span>
                                        </Link>

                                        {isAdmin && (
                                            <Link
                                                to="/admin"
                                                role="menuitem"
                                                onClick={closeAllMenus}
                                                className="account-dropdown-item account-dropdown-admin"
                                            >
                                                <span>🛡️ Admin Vault</span>
                                            </Link>
                                        )}

                                        {!isStandalone && (
                                            <button
                                                type="button"
                                                role="menuitem"
                                                onClick={handleInstallClick}
                                                className="account-dropdown-item"
                                            >
                                                <span>📲 Install App</span>
                                            </button>
                                        )}

                                        <div className="account-dropdown-divider" />

                                        <button
                                            type="button"
                                            role="menuitem"
                                            onClick={handleLogout}
                                            className="account-dropdown-item account-dropdown-logout"
                                        >
                                            <span>🚪 Logout</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <>
                            {!isStandalone && (
                                <button
                                    type="button"
                                    onClick={handleInstallClick}
                                    className="install-app-btn"
                                    title="Download The Veggie Vault as an app on your device"
                                >
                                    📲 Get App
                                </button>
                            )}
                            <Link to="/login" onClick={closeAllMenus} className="header-login-link">
                                Login
                            </Link>
                            <Link to="/register" onClick={closeAllMenus} className="header-register-btn">
                                Register
                            </Link>
                        </>
                    )}
                </div>

                {/* Mobile Top-Right Controls (<= 960px) */}
                <div className="mobile-controls">
                    {!isStandalone && (
                        <button
                            type="button"
                            onClick={handleInstallClick}
                            className="install-app-btn mobile-install-btn"
                            title="Download The Veggie Vault App"
                            aria-label="Install App"
                        >
                            📲 Get App
                        </button>
                    )}

                    {user && (
                        <div className="mobile-notif">
                            <NotificationBell onNavigate={closeAllMenus} />
                        </div>
                    )}

                    {isPremium && (
                        <Link
                            to="/buy-tokens"
                            onClick={closeAllMenus}
                            className="token-badge mobile-token"
                            title="Emma Generation Tokens — Click to Buy More Tokens"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="token-icon">
                                <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22ZM12 15.5C13.933 15.5 15.5 13.933 15.5 12C15.5 10.067 13.933 8.5 12 8.5C10.067 8.5 8.5 10.067 8.5 12C8.5 13.933 10.067 15.5 12 15.5Z"></path>
                            </svg>
                            <span>{tokenBalance}</span>
                        </Link>
                    )}

                    <button
                        ref={hamburgerRef}
                        type="button"
                        className={`hamburger ${isMenuOpen ? 'open' : ''}`}
                        onClick={() => setIsMenuOpen((prev) => !prev)}
                        aria-label="Toggle navigation"
                        aria-expanded={isMenuOpen}
                    >
                        <span></span>
                        <span></span>
                        <span></span>
                    </button>
                </div>
            </div>

            {/* Mobile Slide-Down Drawer (<= 960px) */}
            <nav
                ref={navRef}
                className={`mobile-drawer ${isMenuOpen ? 'open' : ''}`}
                aria-label="Mobile navigation"
            >
                {user && (
                    <Link
                        to="/profile"
                        onClick={closeAllMenus}
                        className="mobile-user-banner"
                    >
                        {avatarSrc ? (
                            <img
                                src={avatarSrc}
                                alt={displayName}
                                className="account-avatar-img"
                                onError={() => setAvatarFailed(true)}
                            />
                        ) : (
                            <span className="account-avatar-dot" aria-hidden="true">
                                {userInitial}
                            </span>
                        )}
                        <div className="mobile-user-meta">
                            <span className="mobile-user-welcome">Welcome, {displayName}</span>
                            <span className="mobile-user-sub">View or edit your chef profile →</span>
                        </div>
                    </Link>
                )}

                <div className="mobile-drawer-section">
                    <span className="mobile-section-label">Explore</span>
                    <ul className="mobile-nav-list">
                        <li>
                            <Link
                                to="/"
                                onClick={closeAllMenus}
                                className={isActivePath('/') ? 'active' : ''}
                            >
                                🏠 Home
                            </Link>
                        </li>
                        {user && isPremium && (
                            <li>
                                <Link
                                    to="/engine"
                                    onClick={closeAllMenus}
                                    className={isActivePath('/engine') ? 'active' : ''}
                                >
                                    ✨ Flavor Forge
                                </Link>
                            </li>
                        )}
                        {user && (
                            <li>
                                <Link
                                    to="/meal-planner"
                                    onClick={closeAllMenus}
                                    className={isActivePath('/meal-planner') ? 'active' : ''}
                                >
                                    📅 Meal Plan
                                </Link>
                            </li>
                        )}
                        <li>
                            <Link
                                to="/wellness"
                                onClick={closeAllMenus}
                                className={isActivePath('/wellness') ? 'active' : ''}
                            >
                                🌱 Wellness Tools
                            </Link>
                        </li>
                        {user && (
                            <li>
                                <Link
                                    to="/favorites"
                                    onClick={closeAllMenus}
                                    className={isActivePath('/favorites') ? 'active' : ''}
                                >
                                    💚 My Vault
                                </Link>
                            </li>
                        )}
                    </ul>
                </div>

                <div className="mobile-drawer-section">
                    <span className="mobile-section-label">Account</span>
                    {user ? (
                        <ul className="mobile-nav-list">
                            <li>
                                <Link
                                    to="/profile"
                                    onClick={closeAllMenus}
                                    className={isActivePath('/profile') ? 'active' : ''}
                                >
                                    👤 My Profile
                                </Link>
                            </li>
                            <li>
                                <Link
                                    to="/buy-tokens"
                                    onClick={closeAllMenus}
                                    className={isActivePath('/buy-tokens') ? 'active' : ''}
                                >
                                    <TokenIcon style={{ marginRight: '0.45rem' }} />
                                    <span>Buy Tokens</span>
                                </Link>
                            </li>
                            {isAdmin && (
                                <li>
                                    <Link
                                        to="/admin"
                                        onClick={closeAllMenus}
                                        className={isActivePath('/admin') ? 'active' : ''}
                                    >
                                        🛡️ Admin Vault
                                    </Link>
                                </li>
                            )}
                            <li>
                                <button
                                    type="button"
                                    onClick={handleLogout}
                                    className="mobile-logout-btn"
                                >
                                    🚪 Logout
                                </button>
                            </li>
                        </ul>
                    ) : (
                        <ul className="mobile-nav-list">
                            <li>
                                <Link to="/login" onClick={closeAllMenus}>
                                    🔑 Login
                                </Link>
                            </li>
                            <li>
                                <Link to="/register" onClick={closeAllMenus} className="mobile-register-link">
                                    ✨ Create Account
                                </Link>
                            </li>
                        </ul>
                    )}
                </div>

                {!isStandalone && (
                    <button
                        type="button"
                        onClick={() => {
                            closeAllMenus();
                            handleInstallClick();
                        }}
                        className="install-app-btn mobile-drawer-install-btn"
                    >
                        📲 Install The Veggie Vault App
                    </button>
                )}
            </nav>
        </header>
    );
};

export default Header;
