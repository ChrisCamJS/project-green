import React, { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import './BuyTokens.css';

const DEFAULT_BUNDLES = [
  { id: 'starter', label: 'Starter Pack', tokens: 5, amountCents: 100, priceDisplay: '$1.00', badge: null },
  { id: 'chef', label: "Chef's Stash", tokens: 25, amountCents: 500, priceDisplay: '$5.00', badge: null },
  { id: 'masterpiece', label: 'Masterpiece Pack', tokens: 50, amountCents: 1000, priceDisplay: '$10.00', badge: 'Popular' },
  { id: 'legend', label: 'Vault Legend', tokens: 100, amountCents: 2000, priceDisplay: '$20.00', badge: 'Best Value' },
];

const QUICK_CUSTOM_STEPS = [5, 15, 30, 75];

const BuyTokens = () => {
  const { user, updateUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [loadingConfig, setLoadingConfig] = useState(true);
  const [config, setConfig] = useState({
    pricePerTokenCents: 20,
    tokensPerDollar: 5,
    minTokens: 5,
    maxTokens: 2500,
    bundles: DEFAULT_BUNDLES,
    stripeConfigured: true,
    purchases: [],
  });

  const [selectedTokens, setSelectedTokens] = useState(25);
  const [customInput, setCustomInput] = useState('25');
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [banner, setBanner] = useState(null);
  const [pendingSessionId, setPendingSessionId] = useState(null);

  const verifiedSessionRef = useRef(null);

  const loadConfig = async () => {
    try {
      const res = await api.getPaymentConfig();
      if (res?.success) {
        setConfig({
          pricePerTokenCents: res.pricePerTokenCents ?? 20,
          tokensPerDollar: res.tokensPerDollar ?? 5,
          minTokens: res.minTokens ?? 5,
          maxTokens: res.maxTokens ?? 2500,
          bundles: Array.isArray(res.bundles) && res.bundles.length ? res.bundles : DEFAULT_BUNDLES,
          stripeConfigured: Boolean(res.stripeConfigured),
          purchases: Array.isArray(res.purchases) ? res.purchases : [],
        });

        if (typeof res.currentTokens === 'number') {
          updateUser({ generation_tokens: res.currentTokens });
        }
      }
    } catch (err) {
      console.error('Failed to load payment config:', err);
      setBanner({
        type: 'error',
        text: err.message || 'Could not load token pricing configuration.',
      });
    } finally {
      setLoadingConfig(false);
    }
  };

  useEffect(() => {
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verifySession = async (sessionId) => {
    if (!sessionId) return;
    setIsVerifying(true);
    try {
      const res = await api.verifyCheckoutSession(sessionId);
      if (res?.success) {
        if (typeof res.tokensRemaining === 'number') {
          updateUser({ generation_tokens: res.tokensRemaining });
        }
        setPendingSessionId(null);
        setBanner({
          type: 'success',
          text: res.alreadyCredited
            ? `🎉 Verified! Your ${res.tokensAdded} tokens are ready in your Vault.`
            : `🎉 Top-Up Complete! +${res.tokensAdded} tokens added to your Vault balance.`,
        });
        setSearchParams({}, { replace: true });
        await loadConfig();
      } else if (res?.pending) {
        setPendingSessionId(sessionId);
        setBanner({
          type: 'info',
          text: res.message || 'Your payment is still processing. Click "Recheck Payment" in a moment to update your balance.',
        });
      } else {
        setBanner({
          type: 'error',
          text: res?.message || 'Unable to verify checkout session.',
        });
      }
    } catch (err) {
      setBanner({
        type: 'error',
        text: err.message || 'Failed to verify Stripe Checkout session.',
      });
    } finally {
      setIsVerifying(false);
    }
  };

  useEffect(() => {
    const status = searchParams.get('status');
    const sessionId = searchParams.get('session_id');

    if (status === 'cancelled') {
      setBanner({
        type: 'info',
        text: 'Checkout cancelled — no charge was made. Pick a bundle whenever you are ready!',
      });
      setSearchParams({}, { replace: true });
      return;
    }

    if (sessionId && verifiedSessionRef.current !== sessionId) {
      verifiedSessionRef.current = sessionId;
      verifySession(sessionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleSelectBundle = (tokens) => {
    setSelectedTokens(tokens);
    setCustomInput(String(tokens));
  };

  const handleCustomChange = (val) => {
    setCustomInput(val);
    const parsed = parseInt(val, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      setSelectedTokens(parsed);
    }
  };

  const handleCheckout = async (e) => {
    e.preventDefault();
    setBanner(null);

    const parsedTokens = parseInt(customInput, 10);
    if (Number.isNaN(parsedTokens) || parsedTokens < config.minTokens || parsedTokens > config.maxTokens) {
      setBanner({
        type: 'error',
        text: `Please enter a whole number of tokens between ${config.minTokens} and ${config.maxTokens} ($${((config.minTokens * config.pricePerTokenCents) / 100).toFixed(2)} minimum).`,
      });
      return;
    }

    if (!config.stripeConfigured) {
      setBanner({
        type: 'error',
        text: 'Stripe credentials are still placeholders. Please add STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY in pantry-rebuild-api/.env first.',
      });
      return;
    }

    setIsCheckingOut(true);
    try {
      const res = await api.createCheckoutSession(parsedTokens, paymentMethod);
      if (res?.success && res.checkoutUrl) {
        window.location.assign(res.checkoutUrl);
      } else {
        setBanner({
          type: 'error',
          text: res?.message || 'Unable to create Stripe Checkout session.',
        });
      }
    } catch (err) {
      setBanner({
        type: 'error',
        text: err.message || 'Could not start Stripe Checkout.',
      });
    } finally {
      setIsCheckingOut(false);
    }
  };

  const currentBalance = Number(user?.generation_tokens ?? 0);
  const numericTokens = Math.max(0, parseInt(customInput, 10) || 0);
  const pricePerTokenDollars = (config.pricePerTokenCents || 20) / 100;
  const totalUsd = (numericTokens * pricePerTokenDollars).toFixed(2);
  const isValidOrder = numericTokens >= config.minTokens && numericTokens <= config.maxTokens;
  const projectedBalance = (currentBalance + (isValidOrder ? numericTokens : 0)).toFixed(1);

  return (
    <div className="buy-tokens-page">
      <div className="buy-tokens-top-nav">
        <Link to="/" className="buy-tokens-nav-link">
          &larr; Back to Recipe Vault
        </Link>
        {user?.account_tier === 'premium' && (
          <Link to="/engine" className="buy-tokens-nav-link">
            Open Flavor Forge &rarr;
          </Link>
        )}
      </div>

      {banner && (
        <div
          className={`buy-tokens-banner buy-tokens-banner-${banner.type}`}
          role="status"
        >
          <span>{banner.text}</span>
          {pendingSessionId && (
            <button
              type="button"
              className="buy-tokens-recheck-btn"
              onClick={() => verifySession(pendingSessionId)}
              disabled={isVerifying}
            >
              {isVerifying ? 'Checking...' : 'Recheck Payment'}
            </button>
          )}
        </div>
      )}

      {!loadingConfig && !config.stripeConfigured && (
        <div className="buy-tokens-setup-warning" role="alert">
          <strong>⚠️ Admin Stripe Setup Required:</strong> Placeholder credentials are still in{' '}
          <code>pantry-rebuild-api/.env</code>. Replace <code>STRIPE_SECRET_KEY</code>,{' '}
          <code>STRIPE_PUBLISHABLE_KEY</code>, <code>STRIPE_WEBHOOK_SECRET</code>, and{' '}
          <code>FRONTEND_URL</code> in <code>pantry-rebuild-api/.env</code> with your Stripe keys
          (and toggle <em>Crypto</em> on in your Stripe Dashboard Payment Methods to enable USDC/stablecoins).
        </div>
      )}

      <section className="buy-tokens-hero">
        <div className="buy-tokens-hero-copy">
          <h1>🪙 Top Up Emma Tokens</h1>
          <p className="buy-tokens-subtitle">
            Power Emma&apos;s Masterpiece Recipes, AI Dish Photography, Full Micronutrient Deep Dives, and Live Audio Sessions.
          </p>
          <div className="buy-tokens-rate-pill">
            <strong>$1.00 USD = {config.tokensPerDollar} Tokens</strong>
            <span>($0.20 / 20¢ per token • Never expire)</span>
          </div>
        </div>

        <div className="buy-tokens-balance-card">
          <span className="balance-card-label">Current Vault Balance</span>
          <strong className="balance-card-value">{currentBalance.toFixed(1)}</strong>
          <span className="balance-card-unit">Generation Tokens</span>
          <ul className="balance-card-costs">
            <li>📸 Full Masterpiece + Photo + Micros: <strong>1.0 Token</strong></li>
            <li>🎙️ Live Audio Session with Emma: <strong>1.0 Token</strong></li>
            <li>🔬 Draft Photo or Deep Dive Upgrade: <strong>0.5 Tokens</strong></li>
          </ul>
        </div>
      </section>

      <form className="buy-tokens-grid" onSubmit={handleCheckout}>
        <div className="buy-tokens-left">
          <section className="buy-tokens-card">
            <h2>1. Choose a Token Bundle</h2>
            <div className="bundle-grid">
              {config.bundles.map((bundle) => {
                const isSelected = selectedTokens === bundle.tokens && String(bundle.tokens) === String(customInput);
                return (
                  <button
                    key={bundle.id}
                    type="button"
                    className={`bundle-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelectBundle(bundle.tokens)}
                  >
                    {bundle.badge && <span className="bundle-badge">{bundle.badge}</span>}
                    <span className="bundle-name">{bundle.label}</span>
                    <strong className="bundle-tokens">{bundle.tokens} Tokens</strong>
                    <span className="bundle-price">{bundle.priceDisplay} USD</span>
                    <span className="bundle-rate">$0.20 / token</span>
                  </button>
                );
              })}
            </div>

            <div className="custom-tokens-box">
              <div className="custom-tokens-header">
                <label htmlFor="custom-token-count">
                  Or enter a custom token amount (min {config.minTokens} tokens = $1.00)
                </label>
                <div className="custom-quick-pills">
                  {QUICK_CUSTOM_STEPS.map((qty) => (
                    <button
                      key={qty}
                      type="button"
                      className={`custom-quick-pill ${String(qty) === String(customInput) ? 'active' : ''}`}
                      onClick={() => handleSelectBundle(qty)}
                    >
                      +{qty} (${(qty * pricePerTokenDollars).toFixed(0)})
                    </button>
                  ))}
                </div>
              </div>

              <div className="custom-input-row">
                <input
                  id="custom-token-count"
                  type="number"
                  min={config.minTokens}
                  max={config.maxTokens}
                  step="1"
                  value={customInput}
                  onChange={(e) => handleCustomChange(e.target.value)}
                  className="custom-token-input"
                />
                <div className="custom-usd-preview">
                  <span>=</span>
                  <strong>${totalUsd} USD</strong>
                </div>
              </div>
              {!isValidOrder && (
                <p className="custom-validation-error">
                  Please choose between {config.minTokens} and {config.maxTokens} whole tokens.
                </p>
              )}
            </div>
          </section>

          <section className="buy-tokens-card">
            <h2>2. Choose Payment Method</h2>
            <div className="payment-method-grid">
              <label className={`payment-method-option ${paymentMethod === 'card' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="card"
                  checked={paymentMethod === 'card'}
                  onChange={() => setPaymentMethod('card')}
                />
                <div className="pm-content">
                  <strong>💳 Credit / Debit Card &amp; Wallets</strong>
                  <span>Visa, Mastercard, Amex, Apple Pay, Google Pay &amp; Link via Stripe</span>
                </div>
              </label>

              <label className={`payment-method-option ${paymentMethod === 'crypto' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="crypto"
                  checked={paymentMethod === 'crypto'}
                  onChange={() => setPaymentMethod('crypto')}
                />
                <div className="pm-content">
                  <strong>🪙 Crypto (USDC / Stablecoins) &amp; Card</strong>
                  <span>Pay with USDC / USDP from your wallet (plus Card fallback) on Stripe Checkout</span>
                </div>
              </label>
            </div>
          </section>
        </div>

        <aside className="buy-tokens-summary">
          <div className="buy-tokens-card summary-card">
            <h2>Order Summary</h2>

            <div className="summary-row">
              <span>Tokens to Add</span>
              <strong>+{isValidOrder ? numericTokens : 0} Tokens</strong>
            </div>
            <div className="summary-row">
              <span>Unit Rate</span>
              <span>$0.20 / token (5 per $1)</span>
            </div>
            <div className="summary-row">
              <span>Payment Method</span>
              <span>{paymentMethod === 'crypto' ? '🪙 Crypto + Card' : '💳 Card & Wallets'}</span>
            </div>
            <div className="summary-row">
              <span>New Balance After Checkout</span>
              <strong className="summary-projected">{projectedBalance} Tokens</strong>
            </div>

            <div className="summary-total-row">
              <span>Total Due</span>
              <strong>${totalUsd} USD</strong>
            </div>

            <button
              type="submit"
              className="checkout-submit-btn"
              disabled={isCheckingOut || isVerifying || !isValidOrder || loadingConfig || !config.stripeConfigured}
            >
              {isCheckingOut
                ? 'Redirecting to Stripe...'
                : isVerifying
                  ? 'Verifying Payment...'
                  : !config.stripeConfigured
                    ? 'Stripe Keys Required in .env'
                    : `Proceed to Checkout ($${totalUsd})`}
            </button>

            <p className="checkout-security-note">
              🔒 Processed securely via Stripe Checkout. Card and crypto transactions settle directly with Stripe — your payment details are never stored on our servers.
            </p>
          </div>
        </aside>
      </form>

      {config.purchases.length > 0 && (
        <section className="buy-tokens-card purchase-history-card">
          <h2>Recent Token Purchases</h2>
          <div className="purchase-history-table-wrap">
            <table className="purchase-history-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Tokens Added</th>
                  <th>Amount Paid</th>
                  <th>Method</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {config.purchases.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.completed_at || row.created_at).toLocaleString()}</td>
                    <td><strong>+{Number(row.tokens_purchased)} tokens</strong></td>
                    <td>${(Number(row.amount_cents || 0) / 100).toFixed(2)} USD</td>
                    <td>{row.payment_method_hint === 'crypto' ? '🪙 Crypto / Stripe' : '💳 Card / Stripe'}</td>
                    <td><span className="purchase-status-pill">Completed</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};

export default BuyTokens;
