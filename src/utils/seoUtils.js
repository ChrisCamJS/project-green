export const SITE_URL = 'https://theveggievault.com';
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-vault-preview.jpeg`;
export const DEFAULT_SITE_NAME = 'The Veggie Vault';
export const DEFAULT_DESCRIPTION =
  'Discover, generate, and plan whole-food, oil-free plant-based recipes with complete macro and micronutrient breakdowns powered by The Chris & Emma Show.';

export const toAbsoluteUrl = (pathOrUrl = '/') => {
  if (!pathOrUrl) return SITE_URL;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const normalized = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${SITE_URL}${normalized}`;
};

export const cleanSeoText = (text = '', maxLength = 160) => {
  const withoutDeepDive = String(text).split(/###\s*(?:Emma'?s\s+)?(?:Deep Dive|Advanced Nutritional Analysis)/i)[0];
  const stripped = withoutDeepDive
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!stripped) return DEFAULT_DESCRIPTION;
  if (stripped.length <= maxLength) return stripped;

  const sliced = stripped.slice(0, maxLength - 3);
  const lastSpace = sliced.lastIndexOf(' ');
  const cut = lastSpace > Math.floor(maxLength * 0.65) ? sliced.slice(0, lastSpace) : sliced;
  return `${cut.replace(/[.,;:\s-]+$/, '')}...`;
};

export const toIsoDuration = (minutes) => {
  const mins = Math.max(0, Math.round(Number(minutes) || 0));
  return mins > 0 ? `PT${mins}M` : undefined;
};
