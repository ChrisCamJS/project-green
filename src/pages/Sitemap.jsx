import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import SEOHead from '../components/SEOHead';
import { SITE_URL, cleanSeoText } from '../utils/seoUtils';
import UserHoverFollow from '../components/UserHoverFollow';
import './Sitemap.css';

export default function Sitemap() {
  const { user } = useAuth();
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterQuery, setFilterQuery] = useState('');

  useEffect(() => {
    let active = true;
    const fetchDirectory = async () => {
      try {
        const res = await api.getRecipes();
        const list = Array.isArray(res?.recipes) ? res.recipes : (Array.isArray(res) ? res : []);
        const publishedOnly = list.filter(
          (r) => r && (r.isPublic === true || r.is_public === 1 || r.isDraft === false)
        );
        if (active) {
          setRecipes(publishedOnly);
        }
      } catch (err) {
        console.error('Failed to load sitemap recipes:', err);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchDirectory();
    return () => {
      active = false;
    };
  }, []);

  const filteredRecipes = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return recipes;
    return recipes.filter(
      (r) =>
        String(r.title || '').toLowerCase().includes(q) ||
        String(r.authorName || '').toLowerCase().includes(q)
    );
  }, [recipes, filterQuery]);

  const chefDirectory = useMemo(() => {
    const map = new Map();
    recipes.forEach((r) => {
      const name = String(r.authorName || '').trim();
      if (!name || name === 'Emma (AI)') return;
      if (!map.has(name)) {
        map.set(name, {
          name,
          count: 1,
          slug: `/profile/${encodeURIComponent(name)}`,
        });
      } else {
        map.get(name).count += 1;
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [recipes]);

  const sitemapJsonLd = useMemo(
    () => ({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'The Veggie Vault Site Map',
      url: `${SITE_URL}/sitemap`,
      description:
        'Complete directory of whole-food plant-based recipes, wellness calculators, meal planning tools, and community chef profiles.',
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: recipes.length,
        itemListElement: recipes.slice(0, 50).map((r, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          url: `${SITE_URL}/recipe/${r.id}`,
          name: r.title,
        })),
      },
    }),
    [recipes]
  );

  return (
    <div className="sitemap-page">
      <SEOHead
        title="Site Map — All Plant-Based Recipes & Pages"
        description="Browse every whole-food, oil-free plant-based recipe, wellness nutrition calculator, chef profile, and meal planning tool inside The Veggie Vault."
        canonicalPath="/sitemap"
        jsonLd={sitemapJsonLd}
      />

      <header className="sitemap-header">
        <h1>🗺️ The Veggie Vault Site Map</h1>
        <p>
          Explore every public page, wellness tool, chef profile, and published oil-free plant-based recipe indexed in The Veggie Vault.
        </p>
        <div className="sitemap-header-meta">
          <span><strong>{recipes.length}</strong> Published Recipes</span>
          <span>&middot;</span>
          <span><strong>{chefDirectory.length}</strong> Featured Chefs</span>
          <span>&middot;</span>
          <a href="/sitemap.xml" target="_blank" rel="noopener noreferrer" className="sitemap-xml-pill">
            View XML Sitemap
          </a>
        </div>
      </header>

      <div className="sitemap-sections-grid">
        <section className="sitemap-card">
          <h2>Explore &amp; Tools</h2>
          <ul className="sitemap-list">
            <li>
              <Link to="/">Home Recipe Feed</Link>
              <span>Latest whole-food, oil-free plant-based recipes</span>
            </li>
            <li>
              <Link to="/engine">Emma&apos;s AI Recipe Engine</Link>
              <span>Create custom recipes, kitchen photography &amp; nutritional deep dives</span>
            </li>
            <li>
              <Link to="/wellness">Wellness &amp; Macro Calculators</Link>
              <span>BMI Calculator, TDEE Energy Expenditure &amp; Daily Macro Planner</span>
            </li>
            <li>
              <Link to="/sitemap">HTML Site Map</Link>
              <span>Complete index of pages and published dishes</span>
            </li>
          </ul>
        </section>

        <section className="sitemap-card">
          <h2>Meal Planning &amp; Member Vault</h2>
          <ul className="sitemap-list">
            <li>
              <Link to="/meal-planner">Meal Planner Calendar</Link>
              <span>Day, Week &amp; Month visual calendar for published &amp; draft recipes</span>
            </li>
            <li>
              <Link to="/favorites">My Vault Collection</Link>
              <span>Saved favorite masterpieces, private drafts &amp; followed chefs</span>
            </li>
            <li>
              <Link to="/profile">My Chef Profile</Link>
              <span>Manage culinary bio, avatar, and followed chefs</span>
            </li>
            <li>
              <Link to="/buy-tokens">Purchase Emma Tokens</Link>
              <span>Add generation tokens via card or cryptocurrency</span>
            </li>
            {!user && (
              <>
                <li>
                  <Link to="/login">Member Log In</Link>
                  <span>Sign in to access your Vault and Meal Planner</span>
                </li>
                <li>
                  <Link to="/register">Create Account</Link>
                  <span>Join The Veggie Vault community</span>
                </li>
              </>
            )}
          </ul>
        </section>
      </div>

      {chefDirectory.length > 0 && (
        <section className="sitemap-directory-card">
          <h2>Community Chefs</h2>
          <div className="sitemap-chef-chips">
            {chefDirectory.map((chef) => (
              <Link key={chef.name} to={chef.slug} className="sitemap-chef-chip">
                <span>@{chef.name}</span>
                <small>{chef.count} {chef.count === 1 ? 'recipe' : 'recipes'}</small>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="sitemap-directory-card">
        <div className="sitemap-recipes-header">
          <h2>Published Recipes ({filteredRecipes.length})</h2>
          <input
            type="search"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Filter recipes or chef names..."
            className="sitemap-filter-input"
            aria-label="Filter recipes in site map"
          />
        </div>

        {loading ? (
          <p className="sitemap-loading">Loading published Vault recipes...</p>
        ) : filteredRecipes.length === 0 ? (
          <p className="sitemap-empty">No published recipes matched your filter.</p>
        ) : (
          <div className="sitemap-recipe-grid">
            {filteredRecipes.map((recipe) => {
              const totalMins = (Number(recipe.prepTime) || 0) + (Number(recipe.cookTime) || 0);
              return (
                <article key={recipe.id} className="sitemap-recipe-item">
                  <h3>
                    <Link to={`/recipe/${recipe.id}`}>{recipe.title}</Link>
                  </h3>
                  <p className="sitemap-recipe-desc">
                    {cleanSeoText(recipe.description || '', 115)}
                  </p>
                  <div className="sitemap-recipe-meta">
                    {recipe.authorName && (
                      <span>
                        By{' '}
                        {recipe.authorName === 'Emma (AI)' ? (
                          'Emma (AI)'
                        ) : (
                          <UserHoverFollow
                            username={recipe.authorName}
                            profileLink={`/profile/${encodeURIComponent(recipe.authorName)}`}
                          >
                            {recipe.authorName}
                          </UserHoverFollow>
                        )}
                      </span>
                    )}
                    {totalMins > 0 && <span>⏱ {totalMins} mins</span>}
                    {recipe.isOilFree && <span>🌱 Oil-Free</span>}
                    {recipe.isGlutenFree && <span>🌾 GF</span>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
