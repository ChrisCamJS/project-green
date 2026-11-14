// src/utils/chatExport.js

const MODE_LABELS = {
    chat: 'Chat /w Emma',
    draft: 'Create Recipe',
    full: 'Create Masterpiece',
};

/**
 * Convert a session title into a clean filename slug.
 */
function slugify(text) {
    const slug = (text || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
    return slug || 'emma-chat';
}

/**
 * Format a timestamp into YYYY-MM-DD for export filenames.
 */
function formatDateSlug(timestamp) {
    const date = timestamp ? new Date(timestamp) : new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Clean Markdown into readable plain text for TXT or PDF output.
 */
function cleanMarkdownForText(md = '', bulletChar = '• ') {
    return md
        .replace(/\r\n/g, '\n')
        .replace(/^#{1,3}\s+(.+)$/gm, (_, heading) => `\n${heading.trim().toUpperCase()}`)
        .replace(/^\s*[-*]\s+/gm, bulletChar)
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/__(.*?)__/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * Combine a model turn's commentary and recipe markdown into one clean string.
 */
function extractModelText(msg) {
    const commentary = msg.displayParts?.commentary?.trim();
    const recipe = msg.displayParts?.recipe?.trim();
    const fallback = msg.parts?.[0]?.text?.trim() || '';

    if (commentary && recipe && commentary !== recipe) {
        return `${commentary}\n\n${recipe}`;
    }
    return recipe || commentary || fallback;
}

/**
 * Extract clean user prompt text plus any attached reference labels for exports.
 */
function extractUserText(msg) {
    const baseText = (msg.displayParts?.userText || msg.parts?.[0]?.text || '').trim();
    const badges = Array.isArray(msg.displayParts?.referenceBadges)
        ? msg.displayParts.referenceBadges
        : [];
    if (badges.length > 0) {
        return `${baseText}\n[Attached References: ${badges.join(', ')}]`;
    }
    return baseText;
}

/**
 * Trigger a browser file download from a Blob.
 */
function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Export a chat session to a formatted plain-text (.txt) file.
 */
export function exportChatToTxt({
    chatHistory = [],
    userName = 'Vault Member',
    title = 'Chat with Emma',
    createdAt,
    engineMode = 'chat',
}) {
    const exportDate = createdAt ? new Date(createdAt) : new Date();
    const formattedDate = exportDate.toLocaleString();
    const modeLabel = MODE_LABELS[engineMode] || engineMode;
    const divider = '='.repeat(60);
    const turnDivider = '-'.repeat(60);

    const lines = [
        'THE VEGGIE VAULT — EMMA\'S FLAVOR FORGE',
        divider,
        `Session: ${title}`,
        `Date:    ${formattedDate}`,
        `Mode:    ${modeLabel}`,
        divider,
        '',
    ];

    chatHistory.forEach((msg) => {
        if (msg.role === 'user') {
            const userText = extractUserText(msg);
            lines.push(`[${userName}]:`);
            lines.push(userText);
        } else {
            const replyText = cleanMarkdownForText(extractModelText(msg), '• ');
            lines.push('[Emma Advanced]:');
            lines.push(replyText);
        }
        lines.push('');
        lines.push(turnDivider);
        lines.push('');
    });

    const content = lines.join('\n');
    const filename = `${slugify(title)}-${formatDateSlug(createdAt)}.txt`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    triggerDownload(blob, filename);
}

/**
 * Sanitize Unicode text to printable ASCII suitable for standard PDF Type1 fonts.
 */
function sanitizePdfText(text = '') {
    return text
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2013\u2014]/g, '-')
        .replace(/\u2022/g, '-')
        .replace(/\u2026/g, '...')
        .replace(/[^\x20-\x7E]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Escape PDF literal string characters.
 */
function escapePdfString(text = '') {
    return text
        .replace(/\\/g, '\\\\')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)');
}

/**
 * Word-wrap a single paragraph line into lines of at most maxChars.
 */
function wrapLine(line, maxChars = 84) {
    const clean = sanitizePdfText(line);
    if (!clean) return [''];
    if (clean.length <= maxChars) return [clean];

    const words = clean.split(' ');
    const wrapped = [];
    let current = '';

    for (const word of words) {
        if (!current) {
            if (word.length > maxChars) {
                for (let i = 0; i < word.length; i += maxChars) {
                    wrapped.push(word.slice(i, i + maxChars));
                }
            } else {
                current = word;
            }
        } else if (current.length + 1 + word.length <= maxChars) {
            current += ` ${word}`;
        } else {
            wrapped.push(current);
            if (word.length > maxChars) {
                for (let i = 0; i < word.length; i += maxChars) {
                    const chunk = word.slice(i, i + maxChars);
                    if (chunk.length === maxChars) {
                        wrapped.push(chunk);
                    } else {
                        current = chunk;
                    }
                }
                if (word.length % maxChars === 0) current = '';
            } else {
                current = word;
            }
        }
    }

    if (current) wrapped.push(current);
    return wrapped;
}

/**
 * Export a chat session to a self-contained formatted PDF (.pdf) file.
 */
export function exportChatToPdf({
    chatHistory = [],
    userName = 'Vault Member',
    title = 'Chat with Emma',
    createdAt,
    engineMode = 'chat',
}) {
    const PAGE_WIDTH = 612;
    const PAGE_HEIGHT = 792;
    const MARGIN = 50;
    const TOP_Y = PAGE_HEIGHT - MARGIN;
    const BOTTOM_Y = MARGIN + 25;
    const LINE_HEIGHT = 15;

    const exportDate = createdAt ? new Date(createdAt) : new Date();
    const formattedDate = sanitizePdfText(exportDate.toLocaleString());
    const modeLabel = sanitizePdfText(MODE_LABELS[engineMode] || engineMode);
    const safeTitle = sanitizePdfText(title) || 'Chat with Emma';
    const safeUser = sanitizePdfText(userName) || 'Vault Member';

    // Build structured drawing commands across pages
    const pages = [[]];
    let cursorY = TOP_Y;

    const ensureSpace = (needed = LINE_HEIGHT) => {
        if (cursorY - needed < BOTTOM_Y) {
            pages.push([]);
            cursorY = TOP_Y;
        }
    };

    const drawTextLine = (text, { font = 'F1', size = 10.5, x = MARGIN, leading = LINE_HEIGHT } = {}) => {
        ensureSpace(leading);
        const safe = escapePdfString(sanitizePdfText(text));
        pages[pages.length - 1].push(
            `BT /${font} ${size} Tf 1 0 0 1 ${x} ${cursorY.toFixed(2)} Tm (${safe}) Tj ET`
        );
        cursorY -= leading;
    };

    const drawRule = (gapAfter = 14) => {
        ensureSpace(gapAfter + 6);
        const ruleY = cursorY + 4;
        pages[pages.length - 1].push(
            `q 0.75 w 0.80 0.84 0.88 RG ${MARGIN} ${ruleY.toFixed(2)} m ${PAGE_WIDTH - MARGIN} ${ruleY.toFixed(2)} l S Q`
        );
        cursorY -= gapAfter;
    };

    // Page 1 Header
    drawTextLine("THE VEGGIE VAULT - EMMA'S FLAVOR FORGE", { font: 'F2', size: 14, leading: 20 });
    wrapLine(safeTitle, 64).forEach((line) => {
        drawTextLine(line, { font: 'F2', size: 12, leading: 17 });
    });
    drawTextLine(`Date: ${formattedDate}   |   Mode: ${modeLabel}`, { font: 'F1', size: 9.5, leading: 15 });
    drawRule(16);

    // Chat Turns
    chatHistory.forEach((msg) => {
        const isUser = msg.role === 'user';
        const speakerLabel = isUser ? `You (${safeUser}):` : 'Emma Advanced:';
        const rawText = isUser
            ? extractUserText(msg)
            : cleanMarkdownForText(extractModelText(msg), '- ');

        ensureSpace(LINE_HEIGHT * 2);
        drawTextLine(speakerLabel, { font: 'F2', size: 11, leading: 16 });

        const paragraphs = rawText.replace(/\r\n/g, '\n').split('\n');
        paragraphs.forEach((para) => {
            const trimmed = para.trim();
            if (!trimmed) {
                cursorY -= 6;
                return;
            }
            const wrappedLines = wrapLine(trimmed, 82);
            wrappedLines.forEach((line) => {
                drawTextLine(line, { font: 'F1', size: 10.5, x: MARGIN + 8, leading: LINE_HEIGHT });
            });
        });

        cursorY -= 10;
    });

    // Add page footers ("Page X of Y")
    const totalPages = pages.length;
    pages.forEach((cmds, idx) => {
        const footerText = escapePdfString(`Page ${idx + 1} of ${totalPages}`);
        cmds.push(
            `BT /F1 9 Tf 1 0 0 1 ${MARGIN} 28 Tm (${footerText}) Tj ET`
        );
    });

    // Assemble PDF 1.4 object graph
    // Object 1: Catalog
    // Object 2: Pages
    // Object 3: Font F1 (Helvetica)
    // Object 4: Font F2 (Helvetica-Bold)
    // Objects 5..(4 + 2*totalPages): pairs of (Page, ContentStream)
    const pageObjIds = [];
    const objects = [];

    // Placeholder for 1..4; we'll fill Pages kids after assigning page IDs
    for (let i = 0; i < totalPages; i++) {
        const pageId = 5 + i * 2;
        const contentId = pageId + 1;
        pageObjIds.push(pageId);

        const streamStr = pages[i].join('\n');
        objects.push({
            id: pageId,
            body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`,
        });
        objects.push({
            id: contentId,
            body: `<< /Length ${streamStr.length} >>\nstream\n${streamStr}\nendstream`,
        });
    }

    const allObjects = [
        { id: 1, body: '<< /Type /Catalog /Pages 2 0 R >>' },
        { id: 2, body: `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${totalPages} >>` },
        { id: 3, body: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>' },
        { id: 4, body: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>' },
        ...objects,
    ];

    let pdf = '%PDF-1.4\n';
    const offsets = [0]; // index 0 is free entry

    for (const obj of allObjects) {
        offsets[obj.id] = pdf.length;
        pdf += `${obj.id} 0 obj\n${obj.body}\nendobj\n`;
    }

    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${allObjects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (let id = 1; id <= allObjects.length; id++) {
        const padded = String(offsets[id]).padStart(10, '0');
        pdf += `${padded} 00000 n \n`;
    }

    pdf += `trailer\n<< /Size ${allObjects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    const bytes = new TextEncoder().encode(pdf);
    const filename = `${slugify(title)}-${formatDateSlug(createdAt)}.pdf`;
    const blob = new Blob([bytes], { type: 'application/pdf' });
    triggerDownload(blob, filename);
}
