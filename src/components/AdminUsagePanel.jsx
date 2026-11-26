import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import './AdminUsagePanel.css';

const formatNumber = (val) => Number(val || 0).toLocaleString();

const formatUsd = (val) => {
  const num = Number(val || 0);
  if (num === 0) return '$0.00';
  if (num < 0.01) return `$${num.toFixed(4)}`;
  return `$${num.toFixed(2)}`;
};

const formatRelativeDate = (raw) => {
  if (!raw) return 'Never';
  const dt = new Date(raw.replace(' ', 'T'));
  if (Number.isNaN(dt.getTime())) return raw;
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function AdminUsagePanel({ onUserDeleted, addToast }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null);
  const [users, setUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('cost');
  const [deletingId, setDeletingId] = useState(null);
  const [suspendingId, setSuspendingId] = useState(null);

  // Token dispensing state
  const [grantIdentifier, setGrantIdentifier] = useState('');
  const [grantAmount, setGrantAmount] = useState('5');
  const [grantReason, setGrantReason] = useState('');
  const [grantBusy, setGrantBusy] = useState(false);
  const grantBoxRef = useRef(null);

  const loadUsage = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.getAdminUsageAnalytics();
      if (res?.success) {
        setSummary(res.summary || null);
        setUsers(Array.isArray(res.users) ? res.users : []);
      } else {
        setError(res?.message || 'Failed to load usage analytics.');
      }
    } catch (err) {
      setError(err?.message || 'Failed to load usage analytics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  const filteredSortedUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? users.filter(
          (u) =>
            String(u.username || '').toLowerCase().includes(q) ||
            String(u.email || '').toLowerCase().includes(q)
        )
      : [...users];

    filtered.sort((a, b) => {
      if (sortBy === 'requests') {
        return (b.total_requests - a.total_requests) || (b.estimated_cost_usd - a.estimated_cost_usd);
      }
      if (sortBy === 'requests_24h') {
        return (b.requests_24h - a.requests_24h) || (b.total_requests - a.total_requests);
      }
      if (sortBy === 'ai_tokens') {
        return (b.total_ai_tokens - a.total_ai_tokens) || (b.total_requests - a.total_requests);
      }
      if (sortBy === 'vault_tokens') {
        return (b.vault_tokens_spent - a.vault_tokens_spent) || (b.total_requests - a.total_requests);
      }
      if (sortBy === 'recipes') {
        return (b.recipes_created - a.recipes_created) || (b.total_requests - a.total_requests);
      }
      return (
        (b.estimated_cost_usd - a.estimated_cost_usd) ||
        (b.total_requests - a.total_requests) ||
        (b.vault_tokens_spent - a.vault_tokens_spent) ||
        (b.recipes_created - a.recipes_created)
      );
    });

    return filtered;
  }, [users, searchQuery, sortBy]);

  const handleDeleteUser = async (target) => {
    if (deletingId || target.is_admin) return;
    const confirmed = window.confirm(
      `Permanently remove @${target.username} (${target.email}) and all of their recipes, comments, meal plans, and usage logs?\n\nThis action cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingId(target.id);
    try {
      const res = await api.deleteAdminUser(target.id);
      if (res?.success) {
        setUsers((prev) => prev.filter((u) => u.id !== target.id));
        addToast?.(res.message || `Removed @${target.username}.`, 'success');
        onUserDeleted?.();
      }
    } catch (err) {
      addToast?.(err?.message || 'Could not remove user account.', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handleGrantTokens = async (e) => {
    e.preventDefault();
    const trimmedTarget = grantIdentifier.trim();
    const numericAmount = Number(grantAmount);
    if (!trimmedTarget) {
      addToast?.('Enter a username or email address.', 'error');
      return;
    }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      addToast?.('Enter a valid token amount greater than 0.', 'error');
      return;
    }

    setGrantBusy(true);
    try {
      const res = await api.grantAdminUserTokens({
        identifier: trimmedTarget,
        amount: numericAmount,
        reason: grantReason.trim(),
      });
      if (res?.success) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === res.user_id
              ? { ...u, tokens_balance: res.tokens_balance }
              : u
          )
        );
        addToast?.(res.message || `Sent +${numericAmount} tokens!`, 'success');
        setGrantReason('');
      }
    } catch (err) {
      addToast?.(err?.message || 'Failed to dispense tokens.', 'error');
    } finally {
      setGrantBusy(false);
    }
  };

  const handleQuickSelectUserForTokens = (username) => {
    setGrantIdentifier(username);
    grantBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const handleToggleSuspend = async (target) => {
    if (suspendingId || target.is_admin) return;
    const nextSuspended = !target.is_suspended;
    let reason = '';
    if (nextSuspended) {
      const promptInput = window.prompt(
        `Suspend @${target.username}? Optionally enter a reason (or leave blank):`,
        ''
      );
      if (promptInput === null) return;
      reason = promptInput.trim();
    } else {
      const ok = window.confirm(`Restore account access for @${target.username}?`);
      if (!ok) return;
    }

    setSuspendingId(target.id);
    try {
      const res = await api.toggleAdminUserSuspension(target.id, nextSuspended, reason);
      if (res?.success) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === target.id
              ? {
                  ...u,
                  is_suspended: Boolean(res.is_suspended),
                  suspended_reason: res.suspended_reason || null,
                }
              : u
          )
        );
        addToast?.(res.message || 'Account status updated.', 'success');
      }
    } catch (err) {
      addToast?.(err?.message || 'Could not update suspension status.', 'error');
    } finally {
      setSuspendingId(null);
    }
  };

  return (
    <section className="admin-usage-panel" aria-label="API and Token Usage Analytics">
      <div className="usage-panel-header">
        <div>
          <h3>📊 API &amp; Token Usage Monitor</h3>
          <p>
            Track AI requests, Gemini token consumption, Vault token spend, and estimated API cost per account to spot abuse.
          </p>
        </div>
        <button type="button" className="usage-refresh-btn" onClick={loadUsage} disabled={loading}>
          {loading ? 'Refreshing...' : '🔄 Refresh'}
        </button>
      </div>

      {summary && (
        <div className="usage-summary-grid">
          <div className="usage-kpi-card">
            <span className="usage-kpi-label">Total API Requests</span>
            <strong className="usage-kpi-value">{formatNumber(summary.total_requests)}</strong>
            <span className="usage-kpi-sub">{formatNumber(summary.requests_24h)} in last 24h</span>
          </div>
          <div className="usage-kpi-card">
            <span className="usage-kpi-label">Total Gemini Tokens</span>
            <strong className="usage-kpi-value">{formatNumber(summary.total_ai_tokens)}</strong>
            <span className="usage-kpi-sub">{formatNumber(summary.active_api_users)} active API accounts</span>
          </div>
          <div className="usage-kpi-card">
            <span className="usage-kpi-label">Vault Tokens Spent</span>
            <strong className="usage-kpi-value">{formatNumber(summary.total_vault_tokens_spent)}</strong>
            <span className="usage-kpi-sub">{formatNumber(summary.total_users)} total accounts</span>
          </div>
          <div className="usage-kpi-card highlight">
            <span className="usage-kpi-label">Est. API Cost</span>
            <strong className="usage-kpi-value">{formatUsd(summary.total_estimated_cost_usd)}</strong>
            <span className="usage-kpi-sub">Since usage tracking enabled</span>
          </div>
        </div>
      )}

      <div ref={grantBoxRef} className="usage-grant-card">
        <div className="usage-grant-header">
          <h4>🪙 Dispense / Refund Tokens</h4>
          <span>Send tokens to any user by username or email</span>
        </div>
        <form className="usage-grant-form" onSubmit={handleGrantTokens}>
          <input
            type="text"
            list="admin-usage-user-list"
            className="usage-grant-input"
            placeholder="Username or email (e.g. Crafty11)"
            value={grantIdentifier}
            onChange={(e) => setGrantIdentifier(e.target.value)}
            required
          />
          <datalist id="admin-usage-user-list">
            {users.map((u) => (
              <option key={u.id} value={u.username}>
                {u.email} (Bal: {u.tokens_balance})
              </option>
            ))}
          </datalist>
          <input
            type="number"
            step="0.01"
            min="0.01"
            max="100000"
            className="usage-grant-amount"
            placeholder="Tokens"
            value={grantAmount}
            onChange={(e) => setGrantAmount(e.target.value)}
            required
          />
          <div className="usage-grant-presets">
            {[1, 5, 10, 25].map((preset) => (
              <button
                key={preset}
                type="button"
                className={`usage-preset-btn ${Number(grantAmount) === preset ? 'active' : ''}`}
                onClick={() => setGrantAmount(String(preset))}
              >
                +{preset}
              </button>
            ))}
          </div>
          <input
            type="text"
            className="usage-grant-reason"
            placeholder="Optional note / refund reason..."
            value={grantReason}
            onChange={(e) => setGrantReason(e.target.value)}
          />
          <button type="submit" className="usage-grant-submit-btn" disabled={grantBusy}>
            {grantBusy ? 'Sending...' : 'Send Tokens'}
          </button>
        </form>
      </div>

      <div className="usage-toolbar">
        <input
          type="search"
          className="usage-search-input"
          placeholder="Filter by username or email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <select
          className="usage-sort-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          aria-label="Sort usage accounts"
        >
          <option value="cost">Sort: Highest Est. Cost</option>
          <option value="requests">Sort: Most Total Requests</option>
          <option value="requests_24h">Sort: Most Requests (24h)</option>
          <option value="ai_tokens">Sort: Most AI Tokens</option>
          <option value="vault_tokens">Sort: Most Vault Tokens Spent</option>
          <option value="recipes">Sort: Most Recipes Created</option>
        </select>
      </div>

      {error && (
        <div className="usage-error-banner" role="alert">
          {error}
        </div>
      )}

      {loading && users.length === 0 ? (
        <div className="usage-empty-box">Loading usage analytics...</div>
      ) : filteredSortedUsers.length === 0 ? (
        <div className="usage-empty-box">No matching accounts found.</div>
      ) : (
        <div className="usage-table-wrap">
          <table className="usage-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Requests</th>
                <th>AI Tokens</th>
                <th>Vault Tokens</th>
                <th>Est. Cost</th>
                <th>Content</th>
                <th>Last API</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredSortedUsers.map((u) => {
                const isHigh24h = u.requests_24h >= 50;
                return (
                  <tr key={u.id} className={u.is_suspended ? 'usage-row-suspended' : (isHigh24h ? 'usage-row-flagged' : '')}>
                    <td>
                      <div className="usage-user-cell">
                        <Link to={`/profile/${u.id}`} className="usage-username-link">
                          @{u.username}
                        </Link>
                        {u.is_admin && <span className="usage-badge admin">Admin</span>}
                        {u.is_suspended && (
                          <span className="usage-badge suspended" title={u.suspended_reason || 'Account suspended'}>
                            Suspended
                          </span>
                        )}
                        {isHigh24h && <span className="usage-badge flag">High 24h</span>}
                      </div>
                      <div className="usage-user-email">{u.email}</div>
                      {u.is_suspended && u.suspended_reason && (
                        <div className="usage-suspended-reason">Reason: {u.suspended_reason}</div>
                      )}
                    </td>
                    <td>
                      <strong>{formatNumber(u.total_requests)}</strong>
                      <div className="usage-sub-meta">
                        24h: {formatNumber(u.requests_24h)} · 7d: {formatNumber(u.requests_7d)}
                      </div>
                      <div className="usage-sub-meta">
                        Chat {u.ai_chat_requests} · Img {u.ai_image_requests} · Live {u.ai_live_requests}
                      </div>
                    </td>
                    <td>
                      <strong>{formatNumber(u.total_ai_tokens)}</strong>
                      <div className="usage-sub-meta">
                        In: {formatNumber(u.prompt_tokens)} · Out: {formatNumber(u.output_tokens)}
                      </div>
                    </td>
                    <td>
                      <strong>{u.vault_tokens_spent}</strong> spent
                      <div className="usage-sub-meta">Bal: {u.tokens_balance}</div>
                    </td>
                    <td>
                      <strong className="usage-cost-text">{formatUsd(u.estimated_cost_usd)}</strong>
                    </td>
                    <td>
                      <strong>{formatNumber(u.recipes_created)}</strong> recipes
                      <div className="usage-sub-meta">{formatNumber(u.comments_count)} comments</div>
                    </td>
                    <td>
                      <span className="usage-date-text">{formatRelativeDate(u.last_api_at)}</span>
                    </td>
                    <td>
                      <div className="usage-row-actions">
                        <button
                          type="button"
                          className="usage-quick-grant-btn"
                          onClick={() => handleQuickSelectUserForTokens(u.username)}
                          title={`Send tokens to @${u.username}`}
                        >
                          + Tokens
                        </button>
                        {u.is_admin ? (
                          <span className="usage-protected-label">Protected</span>
                        ) : (
                          <>
                            <button
                              type="button"
                              className={`usage-suspend-user-btn ${u.is_suspended ? 'restore' : ''}`}
                              onClick={() => handleToggleSuspend(u)}
                              disabled={suspendingId === u.id}
                            >
                              {suspendingId === u.id
                                ? 'Saving...'
                                : (u.is_suspended ? 'Unsuspend' : 'Suspend')}
                            </button>
                            <button
                              type="button"
                              className="usage-delete-user-btn"
                              onClick={() => handleDeleteUser(u)}
                              disabled={deletingId === u.id}
                            >
                              {deletingId === u.id ? 'Removing...' : 'Remove'}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
