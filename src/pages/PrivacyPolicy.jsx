import React from 'react';
import { Link } from 'react-router-dom';
import SEOHead from '../components/SEOHead';
import './LegalPages.css';

export default function PrivacyPolicy() {
  return (
    <div className="legal-page">
      <SEOHead
        title="Privacy Policy"
        description="Read The Veggie Vault privacy policy: we do not share, rent, or sell your personal information, ever, unless and until we update this policy."
        canonicalPath="/privacy-policy"
      />

      <article className="legal-card">
        <header className="legal-header">
          <span className="legal-badge">Last Updated: November 22, 2026</span>
          <h1>Privacy Policy</h1>
          <p className="legal-subtitle">
            Plain-English transparency on how The Veggie Vault handles your information.
          </p>
        </header>

        <div className="legal-promise-callout">
          <strong>Our Core Promise:</strong> We do not share, rent, or sell any of your personal
          information to third parties &mdash; ever &mdash; unless and until we decide to change this
          policy.
        </div>

        <section className="legal-section">
          <h2>1. Information We Collect</h2>
          <p>
            We only collect what is needed to keep your kitchen, recipes, and account running
            smoothly:
          </p>
          <ul>
            <li>
              <strong>Account basics:</strong> Your username, email address, and encrypted password
              when you register or sign in.
            </li>
            <li>
              <strong>Your vault &amp; kitchen data:</strong> Recipes you generate, save, customize,
              or publish, plus your stories, ratings, comments, and meal plans.
            </li>
            <li>
              <strong>Contact form messages:</strong> Submissions from our{' '}
              <Link to="/contact" className="legal-inline-link">
                Contact Us
              </Link>{' '}
              page are emailed directly to our inbox and are <strong>not</strong> stored in our
              database.
            </li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>2. How We Use Information</h2>
          <p>
            Your information is used solely to operate The Veggie Vault, authenticate your account,
            save your recipes and meal plans, and reply when you contact us. We do not build
            advertising profiles or broker your data.
          </p>
        </section>

        <section className="legal-section">
          <h2>3. Zero Data Selling or Sharing</h2>
          <p>
            We do not sell, rent, trade, or share your personal details with advertisers, data
            brokers, or outside marketers &mdash; ever. Only the minimum technical processing needed
            to host the app, deliver emails, or power requested AI/payment features applies.
          </p>
        </section>

        <section className="legal-section">
          <h2>4. Policy Updates</h2>
          <p>
            This policy stays in effect unless and until we decide to update it. If we make any
            changes in the future, we will post the revised Privacy Policy right here with an
            updated date at the top of the page.
          </p>
        </section>

        <section className="legal-section">
          <h2>5. Questions?</h2>
          <p>
            Have a question or concern about your privacy? Reach out anytime through our{' '}
            <Link to="/contact" className="legal-inline-link">
              Contact Form
            </Link>
            .
          </p>
        </section>
      </article>
    </div>
  );
}
