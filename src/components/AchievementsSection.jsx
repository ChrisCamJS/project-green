import React from 'react';
import './AchievementsSection.css';

const formatEarnedDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr.replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
};

const AchievementsSection = ({ achievements }) => {
    const earned = achievements?.earned || [];
    const tracks = achievements?.tracks || [];

    if (earned.length === 0 && tracks.length === 0) {
        return null;
    }

    return (
        <section className="achievements-section">
            <div className="achievements-header">
                <h3>🏆 Achievements &amp; Badges</h3>
                <span className="achievements-count-pill">
                    {earned.length} {earned.length === 1 ? 'Badge Earned' : 'Badges Earned'}
                </span>
            </div>

            {earned.length > 0 ? (
                <div className="achievements-earned-grid">
                    {earned.map((badge) => (
                        <div
                            key={`${badge.key}-${badge.level}`}
                            className={`achievement-badge-card level-${badge.level}`}
                        >
                            <div className="achievement-badge-top">
                                <span className="achievement-icon" aria-hidden="true">
                                    {badge.icon}
                                </span>
                                <span className="achievement-level-pill">
                                    Level {badge.level}
                                </span>
                            </div>
                            <h4 className="achievement-badge-name">{badge.level_name}</h4>
                            <p className="achievement-badge-track">{badge.title}</p>
                            <p className="achievement-badge-desc">{badge.description}</p>
                            <span className="achievement-earned-date">
                                Earned {formatEarnedDate(badge.earned_at)}
                            </span>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="achievements-empty-note">
                    No badges earned yet — publish recipes, create recipe variants, share cooking stories, comment on community dishes, plan meals, or log workouts to unlock your first badge!
                </p>
            )}

            {tracks.length > 0 && (
                <div className="achievements-tracks-wrap">
                    <h4 className="achievements-tracks-heading">Achievement Progress</h4>
                    <div className="achievements-tracks-grid">
                        {tracks.map((track) => {
                            const target = track.next_target || track.current_value || 1;
                            const pct = track.next_target
                                ? Math.min(100, Math.round((track.current_value / target) * 100))
                                : 100;
                            return (
                                <div key={track.key} className="achievement-track-card">
                                    <div className="achievement-track-top">
                                        <span>
                                            {track.icon} <strong>{track.title}</strong>
                                        </span>
                                        <span className="achievement-track-lvl">
                                            Lv. {track.highest_level}/{track.max_level}
                                        </span>
                                    </div>
                                    <div className="achievement-progress-bar">
                                        <div
                                            className="achievement-progress-fill"
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                    <div className="achievement-track-meta">
                                        <span>
                                            {track.current_value} {track.unit}
                                        </span>
                                        <span>
                                            {track.next_target
                                                ? `Next (Lv. ${track.next_level}: ${track.next_level_name}) at ${track.next_target}`
                                                : 'Max Level Reached!'}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </section>
    );
};

export default AchievementsSection;
