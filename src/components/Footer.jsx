import React from 'react';
import './Footer.css'; // Don't forget the CSS!

const Footer = () => {
  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth' // This makes the scroll elegant, not jarring
    });
  };

  return (
    <footer className="vault-footer">
      <div className="footer-content">
        <p className="copyright-text">
          © {new Date().getFullYear()} The Veggie Vault. All rights reserved.
        </p>
      </div>
    </footer>
  );
};

export default Footer;