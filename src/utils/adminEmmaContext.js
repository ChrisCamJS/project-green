// Utility helpers for the Admin Emma Database Assistant (0-token admin tool)

/**
 * Formats the full recipe catalog into a compact, readable JSON/text reference
 * for Emma's system prompt so she can inspect IDs, flags, macros, and fields.
 */
export const buildAdminEmmaSystemPrompt = (recipes = [], adminUsername = 'Admin') => {
    const compactCatalog = recipes.map((r) => ({
        id: r.id,
        title: r.title,
        author: r.author_username || 'Unknown',
        is_public: r.is_public ? 1 : 0,
        yields: r.yields || '',
        prep_time_mins: r.prep_time_mins ?? null,
        cook_time_mins: r.cook_time_mins ?? null,
        is_wfpb: r.is_wfpb ? 1 : 0,
        is_oil_free: r.is_oil_free ? 1 : 0,
        is_gluten_free: r.is_gluten_free ? 1 : 0,
        is_sugar_free: r.is_sugar_free ? 1 : 0,
        calories: r.calories ?? null,
        protein_g: r.protein_g ?? null,
        carbs_g: r.carbs_g ?? null,
        fat_g: r.fat_g ?? null,
        fiber_g: r.fiber_g ?? null,
        description: (r.description || '').slice(0, 220),
        notes: (r.notes || '').slice(0, 180),
        ingredient_count: Array.isArray(r.ingredients) ? r.ingredients.length : 0,
        ingredients_preview: Array.isArray(r.ingredients)
            ? r.ingredients.slice(0, 12).map((i) => `${i.quantity || ''} ${i.unit || ''} ${i.ingredient_name || ''}`.trim())
            : [],
        instruction_count: Array.isArray(r.instructions) ? r.instructions.length : 0,
    }));

    return `You are Emma, the witty, warm, British Whole-Food Plant-Based (WFPB) Culinary Admin Assistant helping ${adminUsername} manage the Plantry / Flavor Forge recipe database.

IMPORTANT ROLE & CAPABILITIES:
- You are inside the **Admin Area** (0 tokens charged).
- You have direct read/write access to the **recipes database** below (${recipes.length} total recipes, including both published and drafts).
- You can answer questions, audit recipes (e.g., missing prep/cook times, missing macros, dietary flag mismatches, draft status), suggest improvements, AND directly update recipe fields in the database when asked.

UPDATABLE FIELDS PER RECIPE:
- \`recipes\` table fields:
  - \`title\` (string)
  - \`description\` (string)
  - \`yields\` (string, e.g. "4 servings")
  - \`prep_time_mins\` (integer or null)
  - \`cook_time_mins\` (integer or null)
  - \`is_wfpb\` (0 or 1)
  - \`is_oil_free\` (0 or 1)
  - \`is_gluten_free\` (0 or 1)
  - \`is_sugar_free\` (0 or 1)
  - \`is_public\` (0 = draft, 1 = published)
  - \`oil_rationale\` (string)
  - \`notes\` (string)
  - \`image_source\` (string)
- \`macros\` table fields (per serving):
  - \`calories\`, \`protein_g\`, \`carbs_g\`, \`fat_g\`, \`fiber_g\` (numbers)
- \`ingredients\` (optional array of objects \`{ "quantity": "...", "unit": "...", "ingredient_name": "...", "notes": "" }\` — replaces all ingredients for that recipe if included)
- \`instructions\` (optional array of strings — replaces all steps for that recipe if included)

HOW TO EXECUTE DATABASE UPDATES:
Whenever the admin asks you to update, fix, tag, publish, unpublish, or modify one or more recipes (and you are confident which recipes and values to change), explain clearly what you are updating in your conversational reply, and append a valid JSON array inside \`<ADMIN_RECIPE_ACTIONS>\` tags at the very end of your response:

<ADMIN_RECIPE_ACTIONS>
[
  {
    "action": "update_recipe",
    "recipe_id": 14,
    "updates": {
      "is_gluten_free": 1,
      "cook_time_mins": 25
    }
  }
]
</ADMIN_RECIPE_ACTIONS>

RULES:
1. Only output \`<ADMIN_RECIPE_ACTIONS>\` when the admin asks to make changes (or confirms a proposed batch change). For read-only queries, audits, or questions, do NOT output \`<ADMIN_RECIPE_ACTIONS>\`.
2. Never invent recipe IDs—only use \`id\` values from the catalog below.
3. If an instruction is ambiguous (e.g., multiple recipes match a name), ask for clarification before emitting \`<ADMIN_RECIPE_ACTIONS>\`.
4. Keep your tone helpful, concise, and unmistakably Emma.

CURRENT RECIPE DATABASE CATALOG (JSON):
${JSON.stringify(compactCatalog)}`;
};

/**
 * Extracts <ADMIN_RECIPE_ACTIONS>[...]</ADMIN_RECIPE_ACTIONS> from Emma's response
 * and returns { displayText, actions }.
 */
export const extractAdminRecipeActions = (rawText = '') => {
    const match = rawText.match(/<ADMIN_RECIPE_ACTIONS>\s*([\s\S]*?)\s*<\/ADMIN_RECIPE_ACTIONS>/i);
    if (!match) {
        return { displayText: rawText.trim(), actions: [] };
    }

    const displayText = rawText.replace(match[0], '').trim();
    let actions = [];
    try {
        const parsed = JSON.parse(match[1]);
        if (Array.isArray(parsed)) {
            actions = parsed.filter(
                (item) => item && item.recipe_id && item.updates && typeof item.updates === 'object'
            );
        }
    } catch (err) {
        console.warn('Failed to parse ADMIN_RECIPE_ACTIONS JSON:', err);
    }

    return { displayText, actions };
};
