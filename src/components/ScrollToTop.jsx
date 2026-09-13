import { useState, useEffect } from 'react';
import './ScrollToTop.css';

const ScrollToTop = () => {

    const [isVisible, setIsVisible] = useState(true);
        useEffect(() => {
            const handleScroll = () => {
                if (window.scrollY > 300) {
                setIsVisible(true);
                } else {
                    setIsVisible(false);
                }
            }
            window.addEventListener('scroll', handleScroll, {passive: true});

            return () => {
                window.removeEventListener('scroll', handleScroll);
            }
        }, []);

    const handleClick = () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    }

    return (
        <div className='scroll-to-top-button-div'>
            <button 
                className={`btn ${isVisible  ? 'show' : 'hide'}`} 
                type='button' 
                onClick={handleClick}
                aria-label="Scroll to top"
            >
                Scroll to Top &uArr;
            </button>
        </div>
    )
}

export default ScrollToTop;