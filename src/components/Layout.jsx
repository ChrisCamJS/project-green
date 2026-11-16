import React from 'react';
import Header from './Header';
import ScrollToTop from './ScrollToTop';
import Footer from './Footer';
import InstallAppBanner from './InstallAppBanner';
import MealPlanModal from './MealPlanModal';
import FloatingEmma from './FloatingEmma';

/**
 * Layout Component
 * Acts as the master wrapper for the entire application.
 * It ensures that every page has consistent padding, headers, and footers.
 */

const Layout = ({children}) => {
    return (
        <div className='app-container'>
                <Header />
                <main className='main-content'>
                    {children}
                </main>
                <Footer />
                <InstallAppBanner />
                <MealPlanModal />
                <FloatingEmma />
                <ScrollToTop />
         </div>
    );
}

export default Layout;