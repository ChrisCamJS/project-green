// src/utils/recipeIdeas.js

/**
 * Prompt instructions appended to all Emma chat system prompts so that whenever
 * Emma suggests new/custom recipe ideas or meal concepts, she also emits a
 * structured <RECIPE_IDEAS> block allowing one-click launch in Flavor Forge.
 */
export const RECIPE_IDEAS_PROMPT_PROTOCOL = `RECIPE IDEA FORGE PROTOCOL:
Whenever you suggest or brainstorm one or more NEW, custom, or adapted recipe ideas / meal suggestions for the user to create (for example, when they ask "give me recipe ideas", "what can I make with X?", "suggest some breakfasts/dinners", or ask for new flavor variations), write your normal engaging Markdown response AND append ONE XML block at the very end of your message listing up to 5 recipe ideas:
<RECIPE_IDEAS>
[
  {
    "title": "Short appetizing dish title without brackets",
    "prompt": "A complete, ready-to-send prompt for Emma's Flavor Forge describing this dish, its main ingredients, flavor profile, cooking style, and any dietary constraints mentioned."
  }
]
</RECIPE_IDEAS>

Rules for <RECIPE_IDEAS>:
- NEVER enclose "title" in square brackets [...].
- NEVER mention "<RECIPE_IDEAS>" or JSON formatting in your conversational text.
- Do NOT output <RECIPE_IDEAS> when merely answering general nutrition/site questions, explaining a single existing recipe without pitching new dishes, or ONLY linking existing published Vault recipes without suggesting ideas to create.`;

const stripOuterBrackets = (value) => {
  let trimmed = String(value || '').trim();
  if (/^\[[^\]]+\]$/.test(trimmed)) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  return trimmed;
};

const normalizeIdeasList = (candidateList, maxCount = 6) => {
  if (!Array.isArray(candidateList)) return [];
  const seen = new Set();
  const normalized = [];

  for (const item of candidateList) {
    if (!item || typeof item !== 'object') continue;
    const rawTitle = stripOuterBrackets(item.title || item.name || '');
    const rawPrompt = String(item.prompt || item.description || rawTitle || '').trim();
    if (!rawTitle || !rawPrompt) continue;

    const dedupeKey = rawTitle.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    normalized.push({
      title: rawTitle,
      prompt: rawPrompt,
    });

    if (normalized.length >= maxCount) break;
  }

  return normalized;
};

/**
 * Extracts <RECIPE_IDEAS>[...]</RECIPE_IDEAS> from Emma's text reply
 * and returns cleaned Markdown plus normalized { title, prompt } objects.
 *
 * @param {string} rawText
 * @returns {{ cleanText: string, ideas: Array<{ title: string, prompt: string }> }}
 */
export const extractRecipeIdeas = (rawText = '') => {
  const source = String(rawText || '');
  if (!source) return { cleanText: '', ideas: [] };

  const collected = [];
  let cleanText = source;

  const tagRegex = /<RECIPE_IDEAS>\s*([\s\S]*?)\s*<\/RECIPE_IDEAS>/gi;
  let match;
  while ((match = tagRegex.exec(source)) !== null) {
    const jsonCandidate = (match[1] || '').trim();
    if (!jsonCandidate) continue;

    try {
      const parsed = JSON.parse(jsonCandidate);
      const list = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.recipe_ideas)
          ? parsed.recipe_ideas
          : Array.isArray(parsed?.ideas)
            ? parsed.ideas
            : [parsed];
      collected.push(...list);
    } catch (err) {
      console.warn('Failed to parse <RECIPE_IDEAS> JSON:', err);
    }
  }

  // Always strip <RECIPE_IDEAS> tags so raw XML/JSON never renders or speaks
  cleanText = cleanText.replace(tagRegex, '').trim();

  // Graceful fallback if Emma wrapped recipe ideas inside a ```json``` block without XML tags
  if (collected.length === 0) {
    const fencedRegex = /```json\s*([\s\S]*?)\s*```/gi;
    cleanText = cleanText
      .replace(fencedRegex, (fullMatch, jsonBody) => {
        try {
          const parsed = JSON.parse(String(jsonBody || '').trim());
          const list = Array.isArray(parsed)
            ? parsed
            : Array.isArray(parsed?.recipe_ideas)
              ? parsed.recipe_ideas
              : Array.isArray(parsed?.ideas)
                ? parsed.ideas
                : null;

          if (
            Array.isArray(list) &&
            list.length > 0 &&
            list.every(
              (it) =>
                it &&
                typeof it === 'object' &&
                typeof it.title === 'string' &&
                typeof it.prompt === 'string'
            )
          ) {
            collected.push(...list);
            return '';
          }
        } catch {
          // Leave genuine code fences untouched
        }
        return fullMatch;
      })
      .trim();
  }

  return {
    cleanText,
    ideas: normalizeIdeasList(collected, 6),
  };
};
