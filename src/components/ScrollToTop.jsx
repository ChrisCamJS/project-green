import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import './ScrollToTop.css';

const ScrollToTop = () => {
    const { pathname, hash } = useLocation();

    // Prevent browser from restoring old scroll positions across SPA route changes
    useEffect(() => {
        if ('scrollRestoration' in window.history) {
            window.history.scrollRestoration = 'manual';
        }
    }, []);

    // Always scroll to the top of the window on every route change (unless a hash anchor exists)
    useEffect(() => {
        if (hash) {
            const el = document.getElementById(hash.replace('#', ''));
            if (el) {
                el.scrollIntoView();
                return;
            }
        }
        try {
            window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        } catch {
            window.scrollTo(0, 0);
        }
    }, [pathname, hash]);

    const [isVisible, setIsVisible] = useState(false);
    useEffect(() => {
        const handleScroll = () => {
            if (window.scrollY > 300) {
                setIsVisible(true);
            } else {
                setIsVisible(false);
            }
        };
        window.addEventListener('scroll', handleScroll, { passive: true });

        return () => {
            window.removeEventListener('scroll', handleScroll);
        };
    }, []);

    const handleClick = () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    };

    return (
        <div className='scroll-to-top-button-div'>
            <button 
                className={`btn ${isVisible ? 'show' : 'hide'}`} 
                type='button' 
                onClick={handleClick}
                aria-label="Scroll to top"
            >
                Scroll to Top &uArr;
            </button>
        </div>
    );
};

export default ScrollToTop;