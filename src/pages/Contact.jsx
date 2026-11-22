import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import SEOHead from '../components/SEOHead';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import './LegalPages.css';

export default function Contact() {
  const { user } = useAuth();
  const [name, setName] = useState(() => user?.username || '');
  const [email, setEmail] = useState(() => user?.email || '');
  const [reason, setReason] = useState('');
  const [website, setWebsite] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    if (user) {
      setName((prev) => prev || user.username || '');
      setEmail((prev) => prev || user.email || '');
    }
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const response = await api.submitContactForm({
        name: name.trim(),
        email: email.trim(),
        reason: reason.trim(),
        website,
      });

      setStatusMessage(
        response?.message || 'Thanks for reaching out! Your message has been sent.'
      );
      setReason('');
    } catch (err) {
      setErrorMessage(
        err?.message || 'Could not send your message right now. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="legal-page">
      <SEOHead
        title="Contact Us"
        description="Get in touch with The Veggie Vault team for questions, recipe feedback, or support."
        canonicalPath="/contact"
      />

      <section className="legal-card">
        <header className="legal-header">
          <span className="legal-badge">Get in Touch</span>
          <h1>Contact Us</h1>
          <p className="legal-subtitle">
            Have a question, suggestion, or recipe note? Send us a message and it will go straight
            to our inbox.
          </p>
        </header>

        {statusMessage && (
          <div className="contact-alert success" role="status">
            {statusMessage}
          </div>
        )}

        {errorMessage && (
          <div className="contact-alert error" role="alert">
            {errorMessage}
          </div>
        )}

        <form className="contact-form" onSubmit={handleSubmit}>
          <div className="contact-field">
            <label htmlFor="contact-name">Your Name</label>
            <input
              id="contact-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              required
              maxLength={120}
              disabled={isSubmitting}
            />
          </div>

          <div className="contact-field">
            <label htmlFor="contact-email">Email Address</label>
            <input
              id="contact-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              maxLength={254}
              disabled={isSubmitting}
            />
          </div>

          <div className="contact-field">
            <label htmlFor="contact-reason">Reason for Contact</label>
            <textarea
              id="contact-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Tell us how we can help..."
              required
              rows={5}
              maxLength={3000}
              disabled={isSubmitting}
            />
            <span className="contact-char-hint">{reason.length} / 3000</span>
          </div>

          {/* Honeypot field for spam bots */}
          <div className="contact-honeypot" aria-hidden="true">
            <label htmlFor="contact-website">Website</label>
            <input
              id="contact-website"
              type="text"
              name="website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
            />
          </div>

          <div className="contact-actions">
            <button
              type="submit"
              className="contact-submit-btn"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Sending Message...' : 'Send Message'}
            </button>
            <p className="contact-privacy-note">
              Sent directly by email and not stored in a database. Read our{' '}
              <Link to="/privacy-policy" className="legal-inline-link">
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </form>
      </section>
    </div>
  );
}
