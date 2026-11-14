import React, { useState, useEffect, useCallback } from 'react';
import './InstallAppBanner.css';

const DISMISS_STORAGE_KEY = 'veggie_vault_install_banner_dismissed';

const checkStandalone = () => {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
    window.navigator?.standalone === true
  );
};

const detectPlatform = () => {
  if (typeof window === 'undefined') return 'desktop';
  const ua = window.navigator.userAgent || '';
  const isTouchMac = /Macintosh/i.test(ua) && Number(window.navigator.maxTouchPoints || 0) > 1;
  if (/iPhone|iPad|iPod/i.test(ua) || isTouchMac) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Safari/i.test(ua) && !/Chrome|Chromium|Edg|OPR|Firefox/i.test(ua) && /Macintosh/i.test(ua)) {
    return 'mac-safari';
  }
  return 'desktop';
};

const InstallAppBanner = () => {
  const [isStandalone, setIsStandalone] = useState(checkStandalone);
  const [deferredPrompt, setDeferredPrompt] = useState(() =>
    typeof window !== 'undefined' ? window.__deferredPwaPrompt || null : null
  );
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [activeGuideTab, setActiveGuideTab] = useState(detectPlatform);

  const triggerInstallFlow = useCallback(async () => {
    const promptEvent = deferredPrompt || (typeof window !== 'undefined' ? window.__deferredPwaPrompt : null);

    if (promptEvent) {
      try {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice?.outcome === 'accepted') {
          setIsStandalone(true);
        }
      } catch (err) {
        console.warn('Native PWA install prompt could not open:', err);
        setShowGuideModal(true);
      } finally {
        setDeferredPrompt(null);
        if (typeof window !== 'undefined') {
          window.__deferredPwaPrompt = null;
        }
      }
      return;
    }

    setActiveGuideTab(detectPlatform());
    setShowGuideModal(true);
  }, [deferredPrompt]);

  useEffect(() => {
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      window.__deferredPwaPrompt = e;
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      window.__deferredPwaPrompt = null;
      setDeferredPrompt(null);
      setIsStandalone(true);
      setShowGuideModal(false);
    };

    const handleCustomInstallTrigger = () => {
      triggerInstallFlow();
    };

    const mediaQuery = window.matchMedia?.('(display-mode: standalone)');
    const handleDisplayModeChange = (e) => {
      if (e.matches) {
        setIsStandalone(true);
        setShowGuideModal(false);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('veggie-vault:install-app', handleCustomInstallTrigger);
    mediaQuery?.addEventListener?.('change', handleDisplayModeChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('veggie-vault:install-app', handleCustomInstallTrigger);
      mediaQuery?.removeEventListener?.('change', handleDisplayModeChange);
    };
  }, [triggerInstallFlow]);

  const handleDismissBanner = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_STORAGE_KEY, 'true');
    } catch {
      // Ignore storage errors
    }
  };

  if (isStandalone) {
    return null;
  }

  return (
    <>
      {!dismissed && !showGuideModal && (
        <aside className="pwa-install-banner" aria-label="Install Veggie Vault App">
          <div className="pwa-banner-brand">
            <img
              src="/pwa-192x192.png"
              alt="The Veggie Vault App Icon"
              className="pwa-banner-icon"
              width="44"
              height="44"
            />
            <div className="pwa-banner-text">
              <strong>Install The Veggie Vault App</strong>
              <span>1-tap home screen launch, full-screen cooking &amp; faster loading.</span>
            </div>
          </div>

          <div className="pwa-banner-actions">
            <button
              type="button"
              className="pwa-banner-install-btn"
              onClick={triggerInstallFlow}
            >
              📲 Install App
            </button>
            <button
              type="button"
              className="pwa-banner-dismiss-btn"
              onClick={handleDismissBanner}
              aria-label="Dismiss install banner"
              title="Dismiss"
            >
              ✕
            </button>
          </div>
        </aside>
      )}

      {showGuideModal && (
        <div
          className="pwa-guide-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-guide-title"
          onClick={() => setShowGuideModal(false)}
        >
          <div className="pwa-guide-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pwa-guide-header">
              <div className="pwa-guide-title-row">
                <img
                  src="/pwa-192x192.png"
                  alt="The Veggie Vault"
                  className="pwa-guide-icon"
                  width="48"
                  height="48"
                />
                <div>
                  <h3 id="pwa-guide-title">Download &amp; Install The Veggie Vault</h3>
                  <p>Run Veggie Vault like a native app on your phone, tablet, or computer — no app store needed.</p>
                </div>
              </div>
              <button
                type="button"
                className="pwa-guide-close-x"
                onClick={() => setShowGuideModal(false)}
                aria-label="Close install instructions"
              >
                ✕
              </button>
            </div>

            <div className="pwa-guide-tabs" role="tablist" aria-label="Device instructions">
              <button
                type="button"
                role="tab"
                aria-selected={activeGuideTab === 'ios'}
                className={`pwa-guide-tab ${activeGuideTab === 'ios' ? 'active' : ''}`}
                onClick={() => setActiveGuideTab('ios')}
              >
                🍎 iPhone / iPad
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeGuideTab === 'android'}
                className={`pwa-guide-tab ${activeGuideTab === 'android' ? 'active' : ''}`}
                onClick={() => setActiveGuideTab('android')}
              >
                🤖 Android
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeGuideTab === 'desktop' || activeGuideTab === 'mac-safari'}
                className={`pwa-guide-tab ${activeGuideTab === 'desktop' || activeGuideTab === 'mac-safari' ? 'active' : ''}`}
                onClick={() => setActiveGuideTab('desktop')}
              >
                💻 Windows / Mac
              </button>
            </div>

            <div className="pwa-guide-body">
              {activeGuideTab === 'ios' && (
                <ol className="pwa-guide-steps">
                  <li>
                    Open <strong>The Veggie Vault</strong> in <strong>Safari</strong> on your iPhone or iPad.
                  </li>
                  <li>
                    Tap the <strong>Share</strong> button (the square with an upward arrow <code>⬆️</code>) in Safari&apos;s toolbar.
                  </li>
                  <li>
                    Scroll down and tap <strong>&ldquo;Add to Home Screen&rdquo;</strong>, then tap <strong>&ldquo;Add&rdquo;</strong> in the top-right corner.
                  </li>
                </ol>
              )}

              {activeGuideTab === 'android' && (
                <ol className="pwa-guide-steps">
                  <li>
                    Tap the browser menu (<code>⋮</code>) in the top-right corner of <strong>Chrome</strong> or your Android browser.
                  </li>
                  <li>
                    Tap <strong>&ldquo;Install app&rdquo;</strong> or <strong>&ldquo;Add to Home screen&rdquo;</strong>.
                  </li>
                  <li>
                    Confirm <strong>Install</strong> to place <strong>Veggie Vault</strong> right in your app drawer and home screen.
                  </li>
                </ol>
              )}

              {(activeGuideTab === 'desktop' || activeGuideTab === 'mac-safari') && (
                <ol className="pwa-guide-steps">
                  <li>
                    <strong>Chrome / Edge (Windows &amp; Mac):</strong> Look at the right side of the address bar and click the{' '}
                    <strong>Install The Veggie Vault</strong> icon (or open browser menu <code>⋮</code> &rarr;{' '}
                    <strong>Cast, save, and share</strong> &rarr; <strong>Install page as app...</strong>).
                  </li>
                  <li>
                    <strong>Safari (macOS):</strong> Click <strong>File</strong> in the top Mac menu bar and select{' '}
                    <strong>&ldquo;Add to Dock...&rdquo;</strong>.
                  </li>
                  <li>
                    Once installed, The Veggie Vault opens in its own clean app window with a desktop/Dock shortcut!
                  </li>
                </ol>
              )}
            </div>

            <div className="pwa-guide-footer">
              <button
                type="button"
                className="pwa-guide-done-btn"
                onClick={() => setShowGuideModal(false)}
              >
                Got It!
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default InstallAppBanner;
