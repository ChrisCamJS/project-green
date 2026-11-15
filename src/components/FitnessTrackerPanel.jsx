import React, { useState } from 'react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import './FitnessTrackerPanel.css';

const ACTIVITY_OPTIONS = [
    { value: 'running', label: '🏃 Running', icon: '🏃' },
    { value: 'cycling', label: '🚴 Cycling', icon: '🚴' },
    { value: 'walking', label: '🚶 Walking', icon: '🚶' },
    { value: 'hiking', label: '🥾 Hiking', icon: '🥾' },
    { value: 'swimming', label: '🏊 Swimming', icon: '🏊' },
    { value: 'other', label: '🏅 Other (Custom)', icon: '🏅' },
];

const getActivityMeta = (type, customLabel) => {
    const found = ACTIVITY_OPTIONS.find((opt) => opt.value === type);
    if (type === 'other') {
        return { icon: '🏅', name: customLabel || 'Other Activity' };
    }
    return {
        icon: found?.icon || '🏅',
        name: found ? found.label.replace(/^[^\s]+\s/, '') : type,
    };
};

const FitnessTrackerPanel = ({
    selectedDate,
    activities = [],
    onActivityAdded,
    onActivityDeleted,
    dailyIntakeCalories = 0,
}) => {
    const { addToast } = useToast();
    const [activityType, setActivityType] = useState('running');
    const [customLabel, setCustomLabel] = useState('');
    const [durationMins, setDurationMins] = useState('30');
    const [saving, setSaving] = useState(false);

    const dayActivities = activities.filter((a) => a.activity_date === selectedDate);
    const totalBurned = dayActivities.reduce((sum, a) => sum + Number(a.calories_burned || 0), 0);
    const totalMinutes = dayActivities.reduce((sum, a) => sum + Number(a.duration_mins || 0), 0);
    const netCalories = dailyIntakeCalories - totalBurned;

    const handleAdd = async (e) => {
        e.preventDefault();
        const mins = Number(durationMins);
        if (!Number.isFinite(mins) || mins <= 0) {
            addToast('Please enter a valid number of minutes.', 'error');
            return;
        }
        if (activityType === 'other' && !customLabel.trim()) {
            addToast('Please enter the activity name (e.g., Basketball).', 'error');
            return;
        }

        setSaving(true);
        try {
            const res = await api.addFitnessActivity({
                activity_date: selectedDate,
                activity_type: activityType,
                custom_label: activityType === 'other' ? customLabel.trim() : '',
                duration_mins: Math.round(mins),
            });
            if (res?.activity && onActivityAdded) {
                onActivityAdded(res.activity);
            }
            if (activityType === 'other') setCustomLabel('');
            setDurationMins('30');
            addToast(
                `Logged ${Math.round(mins)} min (~${res?.activity?.calories_burned ?? 0} kcal burned)!`,
                'success'
            );
        } catch (err) {
            addToast(err.message || 'Failed to add fitness activity.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id) => {
        try {
            await api.deleteFitnessActivity(id);
            if (onActivityDeleted) onActivityDeleted(id);
            addToast('Activity removed.', 'info');
        } catch (err) {
            addToast(err.message || 'Failed to remove activity.', 'error');
        }
    };

    return (
        <div className="mp-fitness-panel">
            <div className="mp-fitness-header">
                <div>
                    <h3>🏃 Daily Fitness &amp; Calories Burned</h3>
                    <p className="mp-fitness-sub">
                        Log one or more workouts for {selectedDate}. Estimates use your Wellness Profile weight (or 155 lbs default).
                    </p>
                </div>
                <div className="mp-fitness-totals">
                    <span className="mp-fitness-badge burned">
                        🔥 {totalBurned} kcal burned ({totalMinutes} min)
                    </span>
                    {dailyIntakeCalories > 0 && (
                        <span className="mp-fitness-badge net">
                            ⚖️ Net: {netCalories} kcal
                        </span>
                    )}
                </div>
            </div>

            <form className="mp-fitness-form" onSubmit={handleAdd}>
                <select
                    value={activityType}
                    onChange={(e) => setActivityType(e.target.value)}
                    className="mp-fitness-select"
                    aria-label="Fitness activity type"
                >
                    {ACTIVITY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>

                {activityType === 'other' && (
                    <input
                        type="text"
                        value={customLabel}
                        onChange={(e) => setCustomLabel(e.target.value)}
                        placeholder="e.g., Basketball, Yoga, Rowing"
                        className="mp-fitness-input"
                        maxLength={100}
                        required
                    />
                )}

                <div className="mp-fitness-mins-wrap">
                    <input
                        type="number"
                        min={1}
                        max={1440}
                        value={durationMins}
                        onChange={(e) => setDurationMins(e.target.value)}
                        className="mp-fitness-mins-input"
                        aria-label="Duration in minutes"
                        required
                    />
                    <span className="mp-fitness-mins-unit">mins</span>
                </div>

                <button
                    type="submit"
                    className="mp-fitness-add-btn"
                    disabled={saving}
                >
                    {saving ? 'Adding...' : '+ Log Workout'}
                </button>
            </form>

            {dayActivities.length === 0 ? (
                <p className="mp-fitness-empty">
                    No fitness activities logged for this day yet.
                </p>
            ) : (
                <ul className="mp-fitness-list">
                    {dayActivities.map((act) => {
                        const meta = getActivityMeta(act.activity_type, act.custom_label);
                        return (
                            <li key={act.id} className="mp-fitness-item">
                                <span className="mp-fitness-item-info">
                                    <span className="mp-fitness-item-icon">{meta.icon}</span>
                                    <strong>{meta.name}</strong>
                                    <span className="mp-fitness-item-meta">
                                        {act.duration_mins} mins &middot; ~{act.calories_burned} kcal burned
                                    </span>
                                </span>
                                <button
                                    type="button"
                                    className="mp-fitness-del-btn"
                                    onClick={() => handleDelete(act.id)}
                                    title="Remove workout"
                                    aria-label="Remove workout"
                                >
                                    ×
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};

export default FitnessTrackerPanel;
