import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import styles from './EditRecipe.module.css';
import { useToast } from '../context/ToastContext';

/**
 * Formats a numeric database value cleanly for display (strips trailing .00).
 */
const formatCleanNumber = (val) => {
    if (val === undefined || val === null || val === '') return '';
    const num = Number(val);
    if (Number.isNaN(num)) return String(val);
    return String(parseFloat(num.toFixed(2)));
};

/**
 * Normalizes recipe ingredients (relational row objects, JSON strings, or plain strings)
 * into newline-separated editable lines.
 */
const formatIngredientsForForm = (ingredients) => {
    if (!ingredients) return '';

    if (typeof ingredients === 'string') {
        const trimmed = ingredients.trim();
        if (!trimmed) return '';
        if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
            try {
                return formatIngredientsForForm(JSON.parse(trimmed));
            } catch {
                return ingredients;
            }
        }
        return ingredients;
    }

    if (Array.isArray(ingredients)) {
        return ingredients
            .map((item) => {
                if (typeof item === 'string') return item.trim();
                if (!item || typeof item !== 'object') return String(item || '').trim();

                const name = String(item.ingredient_name ?? item.name ?? item.ingredient ?? '').trim();
                const rawUnit = String(item.unit ?? '').trim();
                const hasRealUnit = rawUnit !== '' && rawUnit.toLowerCase() !== 'serving';
                const qtyNum = Number(item.quantity);
                const hasRealQty =
                    item.quantity !== undefined &&
                    item.quantity !== null &&
                    item.quantity !== '' &&
                    !Number.isNaN(qtyNum) &&
                    qtyNum > 0 &&
                    !(qtyNum === 1 && !hasRealUnit);

                const qtyStr = hasRealQty ? formatCleanNumber(qtyNum) : '';
                const prefix = [qtyStr, hasRealUnit ? rawUnit : ''].filter(Boolean).join(' ');

                let line = name;
                if (prefix && !name.toLowerCase().startsWith(prefix.toLowerCase())) {
                    const startsWithQtyOnly = qtyStr && !hasRealUnit && name.toLowerCase().startsWith(qtyStr.toLowerCase());
                    if (!startsWithQtyOnly) {
                        line = `${prefix} ${name}`.trim();
                    }
                }

                const ingNotes = String(item.notes ?? '').trim();
                if (ingNotes && !line.includes(ingNotes)) {
                    line = line ? `${line} (${ingNotes})` : ingNotes;
                }
                return line;
            })
            .filter(Boolean)
            .join('\n');
    }

    if (typeof ingredients === 'object') {
        return JSON.stringify(ingredients, null, 2);
    }

    return String(ingredients);
};

/**
 * Normalizes recipe instructions (relational row objects ordered by step_number, JSON strings,
 * or plain strings) into newline-separated editable lines.
 */
const formatInstructionsForForm = (instructions) => {
    if (!instructions) return '';

    if (typeof instructions === 'string') {
        const trimmed = instructions.trim();
        if (!trimmed) return '';
        if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
            try {
                return formatInstructionsForForm(JSON.parse(trimmed));
            } catch {
                return instructions;
            }
        }
        return instructions;
    }

    if (Array.isArray(instructions)) {
        const sorted = [...instructions].sort(
            (a, b) => Number(a?.step_number ?? 0) - Number(b?.step_number ?? 0)
        );
        return sorted
            .map((item) => {
                if (typeof item === 'string') return item.trim();
                if (!item || typeof item !== 'object') return String(item || '').trim();
                return String(item.instruction_text ?? item.text ?? item.step ?? '').trim();
            })
            .filter(Boolean)
            .join('\n');
    }

    if (typeof instructions === 'object') {
        return JSON.stringify(instructions, null, 2);
    }

    return String(instructions);
};

/**
 * Normalizes relational `macros` and `micros` tables (with optional legacy fallback)
 * into human-readable newline-separated nutrition lines.
 */
const formatNutritionForForm = (macros, micros, fallbackNutrition) => {
    const lines = [];

    if (macros && typeof macros === 'object') {
        if (macros.calories !== undefined && macros.calories !== null) {
            lines.push(`Calories: ${formatCleanNumber(macros.calories)} kcal`);
        }
        if (macros.protein_g !== undefined && macros.protein_g !== null) {
            lines.push(`Protein: ${formatCleanNumber(macros.protein_g)} g`);
        }
        if (macros.carbs_g !== undefined && macros.carbs_g !== null) {
            lines.push(`Carbs: ${formatCleanNumber(macros.carbs_g)} g`);
        }
        if (macros.fat_g !== undefined && macros.fat_g !== null) {
            lines.push(`Fat: ${formatCleanNumber(macros.fat_g)} g`);
        }
        if (macros.fiber_g !== undefined && macros.fiber_g !== null) {
            lines.push(`Fiber: ${formatCleanNumber(macros.fiber_g)} g`);
        }
    }

    if (Array.isArray(micros) && micros.length > 0) {
        micros.forEach((m) => {
            if (typeof m === 'string') {
                if (m.trim()) lines.push(m.trim());
                return;
            }
            if (!m || typeof m !== 'object') return;
            const name = String(m.nutrient_name ?? m.name ?? '').trim();
            if (!name) return;
            const amt = formatCleanNumber(m.amount);
            const unit = String(m.unit ?? '').trim();
            const dv = formatCleanNumber(m.daily_value_percentage ?? m.dv);
            lines.push(
                `${name}: ${amt}${unit ? ` ${unit}` : ''}${dv !== '' ? ` (${dv}% DV)` : ''}`
            );
        });
    }

    if (lines.length > 0) {
        return lines.join('\n');
    }

    if (!fallbackNutrition) return '';
    if (Array.isArray(fallbackNutrition)) {
        return fallbackNutrition.map((item) => String(item || '').trim()).filter(Boolean).join('\n');
    }
    if (typeof fallbackNutrition === 'string') {
        const trimmed = fallbackNutrition.trim();
        if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    return parsed.map((item) => String(item || '').trim()).filter(Boolean).join('\n');
                }
            } catch {
                return fallbackNutrition;
            }
        }
        return fallbackNutrition;
    }
    return String(fallbackNutrition);
};

const EditRecipe = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { addToast } = useToast();

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [recipeForm, setRecipeForm] = useState({
        title: '',
        description: '',
        yields: '',
        prepTime: 0,
        cookTime: 0,
        ingredients: '',
        instructions: '',
        nutritionInfo: '',
        notes: '',
        imageUrl: '',
        imageSource: 'none',
        isDraft: false,
        isOilFree: true,
        isGlutenFree: false,
        isSugarFree: true,
    });

    useEffect(() => {
        const fetchRecipe = async () => {
            try {
                const data = await api.getRecipesById(id);

                const resolvedPublic =
                    data.is_public !== undefined
                        ? Number(data.is_public) === 1
                        : Boolean(data.isPublic);

                setRecipeForm({
                    title: data.title || '',
                    description: data.description || '',
                    yields: data.yields || '',
                    prepTime: data.prep_time_mins ?? data.prep_time ?? data.prepTime ?? 0,
                    cookTime: data.cook_time_mins ?? data.cook_time ?? data.cookTime ?? 0,
                    ingredients: formatIngredientsForForm(data.ingredients),
                    instructions: formatInstructionsForForm(data.instructions),
                    nutritionInfo: formatNutritionForForm(data.macros, data.micros, data.nutrition_info),
                    notes: data.notes || data.oil_rationale || '',
                    imageUrl: data.image_url || data.imageUrl || '',
                    imageSource: data.image_source || data.imageSource || 'none',
                    isDraft: !resolvedPublic,
                    isOilFree: Boolean(Number(data.is_oil_free ?? (data.isOilFree ? 1 : 1))),
                    isGlutenFree: Boolean(Number(data.is_gluten_free ?? (data.isGlutenFree ? 1 : 0))),
                    isSugarFree: Boolean(Number(data.is_sugar_free ?? (data.isSugarFree ? 1 : 1))),
                });
            } catch (err) {
                console.error('Failed to fetch recipe for editing:', err);
                addToast('Could not find that recipe in the Vault.', 'error');
                navigate('/admin', { state: { activeTab: 'manage' } });
            } finally {
                setIsLoading(false);
            }
        };

        fetchRecipe();
    }, [id, navigate, addToast]);

    const handleFormChange = (e) => {
        const { name, value, type, checked } = e.target;
        setRecipeForm((prev) => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value,
        }));
    };

    const handleImageUpload = async (e) => {
        const files = e.target.files;
        if (!files || !files.length) return;

        const formData = new FormData();
        for (let i = 0; i < files.length; i++) {
            formData.append('images[]', files[i]);
        }

        try {
            const response = await api.uploadImages(formData);
            if (response?.success && Array.isArray(response.urls) && response.urls.length > 0) {
                const newUrls = response.urls.join(',');
                setRecipeForm((prev) => ({
                    ...prev,
                    imageUrl: prev.imageUrl ? `${prev.imageUrl},${newUrls}` : newUrls,
                    imageSource: 'user',
                }));
                addToast('Images uploaded!', 'success');
            } else {
                addToast(response?.message || 'Image upload failed.', 'error');
            }
        } catch (err) {
            console.error('Upload failed:', err);
            addToast(err?.message || 'Upload failed.', 'error');
        }
    };

    const handleUpdateSubmit = async (e) => {
        e.preventDefault();
        setIsSaving(true);

        const formattedData = {
            ...recipeForm,
            prepTime: Number(recipeForm.prepTime) || 0,
            cookTime: Number(recipeForm.cookTime) || 0,
            isPublic: recipeForm.isDraft ? 0 : 1,
            isDraft: Boolean(recipeForm.isDraft),
            imageSource: recipeForm.imageSource || 'none',
            isOilFree: Boolean(recipeForm.isOilFree),
            isGlutenFree: Boolean(recipeForm.isGlutenFree),
            isSugarFree: Boolean(recipeForm.isSugarFree),
            ingredients: recipeForm.ingredients.split('\n').map((line) => line.trim()).filter(Boolean),
            instructions: recipeForm.instructions.split('\n').map((line) => line.trim()).filter(Boolean),
            nutritionInfo: recipeForm.nutritionInfo.split('\n').map((line) => line.trim()).filter(Boolean),
        };

        try {
            const response = await api.updateRecipe(id, formattedData);
            if (response?.success) {
                addToast('Recipe Successfully Vaulted!', 'success');
                navigate('/admin', { state: { activeTab: 'manage' } });
            } else {
                addToast(response?.message || 'Failed to update recipe.', 'error');
            }
        } catch (err) {
            console.error('Update failed:', err);
            addToast(err?.message || 'Failed to update recipe.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className={styles.adminContainer}>
                <h2 style={{ textAlign: 'center', marginTop: '50px' }}>Fetching Masterpiece...</h2>
            </div>
        );
    }

    return (
        <div className={styles.adminContainer}>
            <header className={styles.adminHeader}>
                <h2>Edit Recipe #{id}</h2>
                <p className={styles.editSubtitle}>
                    Editing: <strong>{recipeForm.title}</strong>
                </p>
            </header>

            <main className={styles.adminContentArea}>
                <section className={styles.addRecipeSection}>
                    <form onSubmit={handleUpdateSubmit} className={styles.adminForm}>
                        <div className={styles.statusToggleBar}>
                            <span className={styles.statusLabel}>Current Status:</span>
                            <button
                                type="button"
                                onClick={() => setRecipeForm((prev) => ({ ...prev, isDraft: !prev.isDraft }))}
                                className={recipeForm.isDraft ? styles.draftBadge : styles.publishBadge}
                            >
                                {recipeForm.isDraft ? 'DRAFT (Hidden)' : 'PUBLISHED (Live)'}
                            </button>
                        </div>

                        <div className={styles.formRow}>
                            <div className={styles.formGroup}>
                                <label>Recipe Title</label>
                                <input
                                    type="text"
                                    name="title"
                                    value={recipeForm.title}
                                    onChange={handleFormChange}
                                    required
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label>Yields</label>
                                <input
                                    type="text"
                                    name="yields"
                                    value={recipeForm.yields}
                                    onChange={handleFormChange}
                                    placeholder="e.g. 4 servings"
                                />
                            </div>
                        </div>

                        <div className={styles.formGroup}>
                            <label>Description</label>
                            <textarea
                                name="description"
                                rows="3"
                                value={recipeForm.description}
                                onChange={handleFormChange}
                                required
                            />
                        </div>

                        <div className={styles.formRow}>
                            <div className={styles.formGroup}>
                                <label>Prep Time (mins)</label>
                                <input
                                    type="number"
                                    name="prepTime"
                                    min="0"
                                    value={recipeForm.prepTime}
                                    onChange={handleFormChange}
                                    required
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label>Cook Time (mins)</label>
                                <input
                                    type="number"
                                    name="cookTime"
                                    min="0"
                                    value={recipeForm.cookTime}
                                    onChange={handleFormChange}
                                    required
                                />
                            </div>
                        </div>

                        <div className={styles.formGroup}>
                            <label>Dietary Badges</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', paddingTop: '0.25rem' }}>
                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', textTransform: 'none', fontSize: '0.92rem', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        name="isOilFree"
                                        checked={Boolean(recipeForm.isOilFree)}
                                        onChange={handleFormChange}
                                    />
                                    100% Oil-Free
                                </label>
                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', textTransform: 'none', fontSize: '0.92rem', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        name="isGlutenFree"
                                        checked={Boolean(recipeForm.isGlutenFree)}
                                        onChange={handleFormChange}
                                    />
                                    Gluten-Free
                                </label>
                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', textTransform: 'none', fontSize: '0.92rem', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        name="isSugarFree"
                                        checked={Boolean(recipeForm.isSugarFree)}
                                        onChange={handleFormChange}
                                    />
                                    Refined Sugar-Free
                                </label>
                            </div>
                        </div>

                        <div className={styles.formRow}>
                            <div className={styles.formGroup}>
                                <label>Ingredients (One per line)</label>
                                <textarea
                                    name="ingredients"
                                    rows="8"
                                    value={recipeForm.ingredients}
                                    onChange={handleFormChange}
                                    required
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label>Instructions (One step per line)</label>
                                <textarea
                                    name="instructions"
                                    rows="8"
                                    value={recipeForm.instructions}
                                    onChange={handleFormChange}
                                    required
                                />
                            </div>
                        </div>

                        <div className={styles.formRow}>
                            <div className={styles.formGroup}>
                                <label>Nutrition Info (Macros &amp; Micros, one per line)</label>
                                <textarea
                                    name="nutritionInfo"
                                    rows="6"
                                    value={recipeForm.nutritionInfo}
                                    onChange={handleFormChange}
                                    placeholder={'Calories: 350 kcal\nProtein: 14 g\nCarbs: 58 g\nFat: 6 g\nFiber: 12 g\nIron: 4.5 mg (25% DV)'}
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label>Oil-Free Rationale / Emma&apos;s Notes</label>
                                <textarea
                                    name="notes"
                                    rows="6"
                                    value={recipeForm.notes}
                                    onChange={handleFormChange}
                                    placeholder="Optional culinary notes or Emma's Deep Dive analysis..."
                                />
                            </div>
                        </div>

                        <div className={styles.formRow}>
                            <div className={styles.formGroup}>
                                <label>Image URLs (Comma separated)</label>
                                <input
                                    type="text"
                                    name="imageUrl"
                                    value={recipeForm.imageUrl}
                                    onChange={handleFormChange}
                                    placeholder="/images/dish.jpg"
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label>Upload Image Directly to Vault</label>
                                <input
                                    type="file"
                                    multiple
                                    accept="image/*"
                                    onChange={handleImageUpload}
                                    style={{ padding: '0.55rem 0' }}
                                />
                            </div>
                        </div>

                        <div className={styles.formActions}>
                            <button
                                type="button"
                                onClick={() => navigate('/admin', { state: { activeTab: 'manage' } })}
                                className={styles.cancelBtn}
                                disabled={isSaving}
                            >
                                Cancel
                            </button>
                            <button type="submit" className={styles.saveBtn} disabled={isSaving}>
                                {isSaving ? 'Saving...' : 'Update Recipe'}
                            </button>
                        </div>
                    </form>
                </section>
            </main>
        </div>
    );
};

export default EditRecipe;
