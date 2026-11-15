import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './WellnessTools.css';
import SEOHead from '../components/SEOHead';
import { SITE_URL } from '../utils/seoUtils';
import BMICalculator from '../components/BMICalculator.jsx';
import TDEECalculator from '../components/TDEECalculator.jsx';
import MacroNutrientPlanner from '../components/MacroNutrientPlanner.jsx';

const WELLNESS_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'The Veggie Vault Wellness & Nutrition Calculators',
  url: `${SITE_URL}/wellness`,
  applicationCategory: 'HealthApplication',
  operatingSystem: 'Web',
  description:
    'Interactive Body Mass Index (BMI), Total Daily Energy Expenditure (TDEE), and whole-food plant-based macronutrient calculators.',
};

const WellnessTools = () => {
  const { user } = useAuth();

  // Shared state between calculators so entering height/weight in BMI immediately propagates to TDEE
  const [sharedHeightFt, setSharedHeightFt] = useState(() => (user?.height_ft ? String(user.height_ft) : ''));
  const [sharedHeightIn, setSharedHeightIn] = useState(() => (user?.height_in !== null && user?.height_in !== undefined ? String(user.height_in) : ''));
  const [sharedWeightLbs, setSharedWeightLbs] = useState(() => (user?.weight_lbs ? String(user.weight_lbs) : ''));
  const [sharedCalorieGoal, setSharedCalorieGoal] = useState(() => (user?.calorie_target ? String(user.calorie_target) : ''));

  const handleApplyCaloriesFromTDEE = (calories) => {
    if (calories > 0) {
      setSharedCalorieGoal(String(calories));
    }
  };

  const hasSavedWellness = Boolean(
    user && (user.calorie_target || user.protein_target_g || user.bmi || user.tdee)
  );

  return (
    <div className="wellness-page-container">
      <SEOHead
        title="Wellness Calculators — BMI, TDEE & Plant-Based Macro Planner"
        description="Calculate your BMI, daily calorie needs (TDEE), and whole-food plant-based macronutrient targets with interactive precision tools powered by The Chris & Emma Show."
        canonicalPath="/wellness"
        jsonLd={WELLNESS_JSON_LD}
      />
      <div className="wellness-content-wrapper" key={user?.id || 'guest'}>
        {/* Page Header Section */}
        <header className="wellness-header">
          <h1 className="wellness-title">Wellness Dashboard</h1>
          <p className="wellness-subtitle">
            Powered by The Chris &amp; Emma Show. Dial in your body composition, energy expenditure, and macronutrient goals with our suite of precision tools.
          </p>
        </header>

        {/* Sync Status Banner */}
        {user ? (
          <div className="wellness-user-banner">
            <div className="wellness-banner-header">
              <div className="wellness-banner-title">
                🥗 {user.display_name || user.username}&apos;s Saved Wellness Profile
              </div>
              <Link to="/meal-planner" className="wellness-banner-link">
                Plan Meals With These Targets &rarr;
              </Link>
            </div>

            {hasSavedWellness ? (
              <div className="wellness-banner-stats">
                {user.calorie_target && (
                  <div className="wellness-banner-stat-chip">
                    <span className="stat-label">Daily Calories</span>
                    <span className="stat-val">{Number(user.calorie_target).toLocaleString()} kcal</span>
                  </div>
                )}
                {user.protein_target_g && (
                  <div className="wellness-banner-stat-chip">
                    <span className="stat-label">Protein Target</span>
                    <span className="stat-val">{user.protein_target_g}g</span>
                  </div>
                )}
                {user.carbs_target_g && (
                  <div className="wellness-banner-stat-chip">
                    <span className="stat-label">Carbs Target</span>
                    <span className="stat-val">{user.carbs_target_g}g</span>
                  </div>
                )}
                {user.fat_target_g && (
                  <div className="wellness-banner-stat-chip">
                    <span className="stat-label">Fat Target</span>
                    <span className="stat-val">{user.fat_target_g}g</span>
                  </div>
                )}
                {user.bmi && (
                  <div className="wellness-banner-stat-chip">
                    <span className="stat-label">Body Mass Index</span>
                    <span className="stat-val">{user.bmi}</span>
                  </div>
                )}
                {user.tdee && (
                  <div className="wellness-banner-stat-chip">
                    <span className="stat-label">Maintenance TDEE</span>
                    <span className="stat-val">{Number(user.tdee).toLocaleString()} kcal</span>
                  </div>
                )}
              </div>
            ) : (
              <p style={{ margin: 0, color: '#065f46', fontSize: '0.92rem' }}>
                You have not saved any wellness calculations yet. Use the calculators below and click <strong>&quot;Save to Profile&quot;</strong> to personalize Emma and your daily Meal Planning targets!
              </p>
            )}
          </div>
        ) : (
          <div className="wellness-banner-guest">
            <p>
              🔒 <strong>Want personalized meal planning?</strong> <Link to="/login">Log into the Vault</Link> to save your calculations to your profile. Emma will automatically use your personal numbers when planning meals!
            </p>
            <Link to="/login" className="wellness-banner-link">
              Log In to Sync &rarr;
            </Link>
          </div>
        )}

        {/* 1. Body Composition (BMI) */}
        <section className="calculator-card">
          <div className="card-accent accent-bmi"></div>
          <div className="calculator-content">
            <BMICalculator
              heightFt={sharedHeightFt}
              setHeightFt={setSharedHeightFt}
              heightIn={sharedHeightIn}
              setHeightIn={setSharedHeightIn}
              weightLbs={sharedWeightLbs}
              setWeightLbs={setSharedWeightLbs}
            />
          </div>
        </section>

        {/* 2. Caloric Needs (TDEE) */}
        <section className="calculator-card">
          <div className="card-accent accent-tdee"></div>
          <div className="calculator-content">
            <TDEECalculator
              heightFt={sharedHeightFt}
              setHeightFt={setSharedHeightFt}
              heightIn={sharedHeightIn}
              setHeightIn={setSharedHeightIn}
              weightLbs={sharedWeightLbs}
              setWeightLbs={setSharedWeightLbs}
              onApplyCalories={handleApplyCaloriesFromTDEE}
            />
          </div>
        </section>

        {/* 3. Macronutrient Planner */}
        <section className="calculator-card">
          <div className="card-accent accent-macro"></div>
          <div className="calculator-content">
            <MacroNutrientPlanner
              calorieGoal={sharedCalorieGoal}
              setCalorieGoal={setSharedCalorieGoal}
            />
          </div>
        </section>
      </div>
    </div>
  );
};

export default WellnessTools;
