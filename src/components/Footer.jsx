import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Footer.css';

const Footer = () => {
  const { user, logout } = useAuth();
  const isAdmin = Boolean(user?.is_admin === 1 || user?.is_admin === true || user?.role === 'admin');

  return (
    <footer className="vault-footer" role="contentinfo">
      <div className="footer-shell">
        <div className="footer-grid">
          {/* Brand Summary */}
          <div className="footer-brand-col">
            <Link to="/" className="footer-brand-logo">
              The Veggie Vault
            </Link>
            <p className="footer-brand-desc">
              Whole-food, 100% oil-free plant-based recipes, AI culinary creation with Emma, precision nutrition deep dives, and interactive meal planning.
            </p>
            <div className="footer-dietary-pills">
              <span className="footer-pill">🌱 100% Oil-Free</span>
              <span className="footer-pill">🥬 Whole-Food Plant-Based</span>
            </div>
          </div>

          {/* Site Map Columns */}
          <nav className="footer-sitemap-nav" aria-label="Footer Sitemap">
            <div className="footer-nav-col">
              <h3 className="footer-col-heading">Discover &amp; Culinary</h3>
              <ul className="footer-link-list">
                <li><Link to="/">Home Recipe Feed</Link></li>
                <li><Link to="/engine">Emma&apos;s AI Recipe Engine</Link></li>
                <li><Link to="/wellness">Wellness &amp; Macro Calculators</Link></li>
                <li><Link to="/sitemap">Full HTML Site Map</Link></li>
                <li>
                  <a href="/sitemap.xml" target="_blank" rel="noopener noreferrer">
                    XML Sitemap
                  </a>
                </li>
              </ul>
            </div>

            <div className="footer-nav-col">
              <h3 className="footer-col-heading">Kitchen &amp; Planning</h3>
              <ul className="footer-link-list">
                <li><Link to="/meal-planner">Meal Planner Calendar</Link></li>
                <li><Link to="/favorites">My Vault &amp; Saved Drafts</Link></li>
                <li><Link to="/profile">Chef Profile</Link></li>
                <li><Link to="/buy-tokens">Buy Generation Tokens</Link></li>
              </ul>
            </div>

            <div className="footer-nav-col">
              <h3 className="footer-col-heading">Account &amp; Access</h3>
              <ul className="footer-link-list">
                {user ? (
                  <>
                    <li><Link to="/profile">Account Settings (@{user.username})</Link></li>
                    <li><Link to="/buy-tokens">Token Balance &amp; Refill</Link></li>
                    {isAdmin && (
                      <li><Link to="/admin">Admin Vault Control</Link></li>
                    )}
                    <li>
                      <button type="button" onClick={logout} className="footer-text-btn">
                        Log Out
                      </button>
                    </li>
                  </>
                ) : (
                  <>
                    <li><Link to="/login">Log In</Link></li>
                    <li><Link to="/register">Register Account</Link></li>
                    <li><Link to="/forgot-password">Reset Forgotten Password</Link></li>
                  </>
                )}
              </ul>
            </div>
          </nav>
        </div>

        <div className="footer-bottom-bar">
          <p className="copyright-text">
            &copy; {new Date().getFullYear()} The Veggie Vault. All rights reserved.
          </p>
          <p className="footer-attribution">
            Powered by{' '}
            <a
              href="https://chrisandemmashow.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-attribution-link"
            >
              <strong>The Chris &amp; Emma Show</strong>
            </a>
          </p>
          <div className="footer-bottom-links">
            <Link to="/sitemap">Site Map</Link>
            <span aria-hidden="true">&middot;</span>
            <a href="/sitemap.xml" target="_blank" rel="noopener noreferrer">
              XML Sitemap
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
