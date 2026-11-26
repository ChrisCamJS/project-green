// Shared helpers for Meal Planner calendar formatting, slots, and recipe image URLs

export const MEAL_SLOTS = [
  { id: 'breakfast', label: 'Breakfast', icon: '🌅' },
  { id: 'lunch', label: 'Lunch', icon: '🥗' },
  { id: 'dinner', label: 'Dinner', icon: '🍽️' },
  { id: 'snack', label: 'Snack', icon: '🍎' },
];

export const getMealSlotMeta = (slotId) =>
  MEAL_SLOTS.find((s) => s.id === slotId) || MEAL_SLOTS[2];

export const formatDateYMD = (dateObj) => {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const parseDateYMD = (ymd) => {
  if (!ymd || typeof ymd !== 'string') return new Date();
  const [y, m, d] = ymd.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
};

export const addDaysYMD = (ymd, deltaDays) => {
  const dt = parseDateYMD(ymd);
  dt.setDate(dt.getDate() + deltaDays);
  return formatDateYMD(dt);
};

export const resolveRecipeImageUrl = (recipeOrPath, apiBaseUrl = import.meta.env.VITE_API_BASE_URL) => {
  const raw =
    typeof recipeOrPath === 'string'
      ? recipeOrPath
      : recipeOrPath?.imageUrl || recipeOrPath?.image_url || '';

  const trimmed = String(raw || '').trim();
  if (!trimmed || trimmed.includes('default-veggie-vault-placeholder')) {
    return '/og-vault-preview.jpg';
  }
  if (trimmed.startsWith('http') || trimmed.startsWith('data:')) {
    return trimmed;
  }
  const cleanBase = String(apiBaseUrl || '').replace(/\/+$/, '');
  return `${cleanBase}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
};
