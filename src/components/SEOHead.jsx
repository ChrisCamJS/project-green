import { useEffect } from 'react';
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_IMAGE,
  DEFAULT_SITE_NAME,
  toAbsoluteUrl,
} from '../utils/seoUtils';

const DEFAULT_KEYWORDS =
  'whole food plant based recipes, WFPB, oil-free vegan recipes, vegan meal planner, plant-based nutrition calculator, refined sugar-free recipes, gluten-free vegan, The Veggie Vault';

const upsertMetaTag = (attrName, attrValue, content) => {
  let el = document.head.querySelector(`meta[${attrName}="${attrValue}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attrName, attrValue);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
};

const upsertCanonicalLink = (href) => {
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', href);
};

export default function SEOHead({
  title,
  description = DEFAULT_DESCRIPTION,
  keywords = DEFAULT_KEYWORDS,
  canonicalPath = '/',
  ogType = 'website',
  image = DEFAULT_OG_IMAGE,
  noindex = false,
  jsonLd = null,
  publishedTime = null,
  authorName = null,
}) {
  const serializedJsonLd = jsonLd ? JSON.stringify(jsonLd) : '';

  useEffect(() => {
    const fullTitle = !title
      ? `${DEFAULT_SITE_NAME} | Whole Food Plant-Based Recipes & Engine`
      : title.includes(DEFAULT_SITE_NAME)
        ? title
        : `${title} | ${DEFAULT_SITE_NAME}`;

    document.title = fullTitle;

    const canonicalUrl = toAbsoluteUrl(canonicalPath);
    const resolvedImage = toAbsoluteUrl(image || DEFAULT_OG_IMAGE);
    const robotsDirective = noindex
      ? 'noindex, nofollow'
      : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

    upsertMetaTag('name', 'description', description || DEFAULT_DESCRIPTION);
    upsertMetaTag('name', 'keywords', keywords || DEFAULT_KEYWORDS);
    upsertMetaTag('name', 'robots', robotsDirective);
    upsertCanonicalLink(canonicalUrl);

    // Open Graph
    upsertMetaTag('property', 'og:type', ogType);
    upsertMetaTag('property', 'og:site_name', DEFAULT_SITE_NAME);
    upsertMetaTag('property', 'og:title', fullTitle);
    upsertMetaTag('property', 'og:description', description || DEFAULT_DESCRIPTION);
    upsertMetaTag('property', 'og:url', canonicalUrl);
    upsertMetaTag('property', 'og:image', resolvedImage);
    upsertMetaTag('property', 'og:image:secure_url', resolvedImage);
    upsertMetaTag('property', 'og:image:alt', title || DEFAULT_SITE_NAME);

    if (publishedTime) {
      upsertMetaTag('property', 'article:published_time', publishedTime);
    }
    if (authorName) {
      upsertMetaTag('property', 'article:author', authorName);
      upsertMetaTag('name', 'author', authorName);
    }

    // Twitter / X Cards
    upsertMetaTag('name', 'twitter:card', 'summary_large_image');
    upsertMetaTag('name', 'twitter:site', '@VeggieVault');
    upsertMetaTag('name', 'twitter:title', fullTitle);
    upsertMetaTag('name', 'twitter:description', description || DEFAULT_DESCRIPTION);
    upsertMetaTag('name', 'twitter:image', resolvedImage);
    upsertMetaTag('name', 'twitter:image:alt', title || DEFAULT_SITE_NAME);

    // Dynamic page-level JSON-LD
    const scriptId = 'veggie-vault-jsonld';
    let scriptEl = document.getElementById(scriptId);

    if (serializedJsonLd) {
      if (!scriptEl) {
        scriptEl = document.createElement('script');
        scriptEl.type = 'application/ld+json';
        scriptEl.id = scriptId;
        document.head.appendChild(scriptEl);
      }
      scriptEl.textContent = serializedJsonLd;
    } else if (scriptEl) {
      scriptEl.remove();
    }

    return () => {
      const activeScript = document.getElementById(scriptId);
      if (activeScript) {
        activeScript.remove();
      }
    };
  }, [title, description, keywords, canonicalPath, ogType, image, noindex, serializedJsonLd, publishedTime, authorName]);

  return null;
}
