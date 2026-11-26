const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const resolveStoryAssetUrl = (rawPath, fallback = '/og-vault-preview.jpg') => {
  if (!rawPath || String(rawPath).includes('default-veggie-vault-placeholder')) {
    return fallback;
  }
  const str = String(rawPath).trim();
  if (str.startsWith('http://') || str.startsWith('https://') || str.startsWith('data:')) {
    return str;
  }
  return `${API_BASE_URL}${str.startsWith('/') ? '' : '/'}${str}`;
};

export const formatStoryDate = (rawDate) => {
  if (!rawDate) return '';
  const normalized = String(rawDate).replace(' ', 'T');
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return String(rawDate).slice(0, 10);
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};
