import React from 'react';
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
  return (
    <div className="wellness-page-container">
      <SEOHead
        title="Wellness Calculators — BMI, TDEE & Plant-Based Macro Planner"
        description="Calculate your BMI, daily calorie needs (TDEE), and whole-food plant-based macronutrient targets with interactive precision tools powered by The Chris & Emma Show."
        canonicalPath="/wellness"
        jsonLd={WELLNESS_JSON_LD}
      />
      <div className="wellness-content-wrapper">
        {/* Page Header Section */}
        <header className="wellness-header">
          <h1 className="wellness-title">Wellness Dashboard</h1>
          <p className="wellness-subtitle">
            Powered by The Chris & Emma Show. Dial in your body composition, energy expenditure, and macronutrient goals with our suite of precision tools.
          </p>
        </header>

        {/* The Calculators - Using a uniform card class with specific accent modifiers */}
        <section className="calculator-card">
          {/* A splash of color to differentiate the tools */}
          <div className="card-accent accent-bmi"></div>
          <div className="calculator-content">
            <BMICalculator />
          </div>
        </section>

        <section className="calculator-card">
          <div className="card-accent accent-tdee"></div>
          <div className="calculator-content">
            <TDEECalculator />
          </div>
        </section>

        <section className="calculator-card">
          <div className="card-accent accent-macro"></div>
          <div className="calculator-content">
            <MacroNutrientPlanner />
          </div>
        </section>

      </div>
    </div>
  );
};

export default WellnessTools;