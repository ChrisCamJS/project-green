/**
 * Formats a structured recipe object (from RecipeDetails) or markdown string (from RecipeResult)
 * into both rich HTML and visually appealing plain text, then copies both to the clipboard.
 */

const escapeHtml = (str = '') =>
    String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

export const formatStructuredRecipeForClipboard = (recipe) => {
    const title = recipe?.title || 'The Veggie Vault Recipe';
    const description = (recipe?.description || '').trim();
    const prep = Number(recipe?.prepTime ?? recipe?.prep_time_mins ?? 0);
    const cook = Number(recipe?.cookTime ?? recipe?.cook_time_mins ?? 0);
    const yields = recipe?.yields || '';
    const author = recipe?.authorName || 'Emma (AI)';

    const metaParts = [];
    if (yields) metaParts.push(`Servings: ${yields}`);
    if (prep > 0) metaParts.push(`Prep: ${prep} mins`);
    if (cook > 0) metaParts.push(`Cook: ${cook} mins`);
    metaParts.push(`By: ${author}`);

    const ingredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
    const instructions = Array.isArray(recipe?.instructions) ? recipe.instructions : [];
    const macros = recipe?.macros || null;

    // --- Plain Text ---
    const lines = [
        `🥗 ${title}`,
        '='.repeat(Math.min(50, title.length + 3)),
        metaParts.join('  |  '),
        '',
    ];

    if (description) {
        lines.push(description, '');
    }

    if (ingredients.length > 0) {
        lines.push('INGREDIENTS', '-----------');
        ingredients.forEach((ing) => {
            const qty = ing.quantity ? `${ing.quantity} ` : '';
            const unit = ing.unit ? `${ing.unit} ` : '';
            const name = ing.ingredient_name || ing.name || '';
            const notes = ing.notes ? ` (${ing.notes})` : '';
            lines.push(`• ${qty}${unit}${name}${notes}`.trim());
        });
        lines.push('');
    }

    if (instructions.length > 0) {
        lines.push('INSTRUCTIONS', '------------');
        instructions.forEach((step, idx) => {
            const num = step.step_number || idx + 1;
            const text = typeof step === 'string' ? step : step.instruction_text || step.text || '';
            if (text) lines.push(`${num}. ${text}`);
        });
        lines.push('');
    }

    if (macros && (macros.calories || macros.protein_g || macros.carbs_g || macros.fat_g)) {
        lines.push('NUTRITION (PER SERVING)', '-----------------------');
        const macroLine = [
            macros.calories ? `Calories: ${Math.round(macros.calories)} kcal` : null,
            macros.protein_g ? `Protein: ${macros.protein_g}g` : null,
            macros.carbs_g ? `Carbs: ${macros.carbs_g}g` : null,
            macros.fat_g ? `Fat: ${macros.fat_g}g` : null,
            macros.fiber_g ? `Fiber: ${macros.fiber_g}g` : null,
        ]
            .filter(Boolean)
            .join('  |  ');
        if (macroLine) lines.push(macroLine, '');
    }

    if (recipe?.notes) {
        lines.push('CHEF NOTES', '----------', recipe.notes.trim(), '');
    }

    lines.push('Shared from The Veggie Vault (Whole-Food, Plant-Based & 100% Oil-Free)');
    const plainText = lines.join('\n');

    // --- Rich HTML ---
    const htmlParts = [
        `<div style="font-family: system-ui, -apple-system, sans-serif; color: #1f2937; line-height: 1.5;">`,
        `<h1 style="margin: 0 0 6px; color: #1b5e20;">${escapeHtml(title)}</h1>`,
        `<p style="margin: 0 0 12px; color: #4b5563; font-size: 14px;"><strong>${escapeHtml(metaParts.join('  •  '))}</strong></p>`,
    ];

    if (description) {
        htmlParts.push(`<p style="margin: 0 0 14px;">${escapeHtml(description)}</p>`);
    }

    if (ingredients.length > 0) {
        htmlParts.push(`<h2 style="margin: 14px 0 6px; color: #2e7d32; font-size: 18px;">Ingredients</h2><ul style="margin: 0 0 14px; padding-left: 20px;">`);
        ingredients.forEach((ing) => {
            const qty = ing.quantity ? `${ing.quantity} ` : '';
            const unit = ing.unit ? `${ing.unit} ` : '';
            const name = ing.ingredient_name || ing.name || '';
            const notes = ing.notes ? ` (${ing.notes})` : '';
            htmlParts.push(`<li>${escapeHtml(`${qty}${unit}${name}${notes}`.trim())}</li>`);
        });
        htmlParts.push(`</ul>`);
    }

    if (instructions.length > 0) {
        htmlParts.push(`<h2 style="margin: 14px 0 6px; color: #2e7d32; font-size: 18px;">Instructions</h2><ol style="margin: 0 0 14px; padding-left: 20px;">`);
        instructions.forEach((step) => {
            const text = typeof step === 'string' ? step : step.instruction_text || step.text || '';
            if (text) htmlParts.push(`<li style="margin-bottom: 6px;">${escapeHtml(text)}</li>`);
        });
        htmlParts.push(`</ol>`);
    }

    if (macros && (macros.calories || macros.protein_g || macros.carbs_g || macros.fat_g)) {
        const macroLine = [
            macros.calories ? `Calories: ${Math.round(macros.calories)} kcal` : null,
            macros.protein_g ? `Protein: ${macros.protein_g}g` : null,
            macros.carbs_g ? `Carbs: ${macros.carbs_g}g` : null,
            macros.fat_g ? `Fat: ${macros.fat_g}g` : null,
            macros.fiber_g ? `Fiber: ${macros.fiber_g}g` : null,
        ]
            .filter(Boolean)
            .join('  •  ');
        if (macroLine) {
            htmlParts.push(
                `<h2 style="margin: 14px 0 6px; color: #2e7d32; font-size: 18px;">Nutrition (Per Serving)</h2>`,
                `<p style="margin: 0 0 14px;">${escapeHtml(macroLine)}</p>`
            );
        }
    }

    if (recipe?.notes) {
        htmlParts.push(
            `<h2 style="margin: 14px 0 6px; color: #2e7d32; font-size: 18px;">Chef Notes</h2>`,
            `<p style="margin: 0 0 14px;">${escapeHtml(recipe.notes.trim())}</p>`
        );
    }

    htmlParts.push(
        `<p style="margin: 14px 0 0; font-size: 12px; color: #6b7280;"><em>Shared from The Veggie Vault — Whole-Food, Plant-Based &amp; 100% Oil-Free</em></p>`,
        `</div>`
    );

    return { plainText, html: htmlParts.join('\n') };
};

export const copyRichRecipeToClipboard = async ({ plainText, html }) => {
    if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        typeof window !== 'undefined' &&
        typeof window.ClipboardItem !== 'undefined' &&
        html
    ) {
        try {
            const item = new window.ClipboardItem({
                'text/plain': new Blob([plainText], { type: 'text/plain' }),
                'text/html': new Blob([html], { type: 'text/html' }),
            });
            await navigator.clipboard.write([item]);
            return true;
        } catch {
            // Fall back to writeText below
        }
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(plainText);
        return true;
    }

    // Legacy fallback
    const textarea = document.createElement('textarea');
    textarea.value = plainText;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    return true;
};
