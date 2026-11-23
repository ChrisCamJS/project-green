// src/utils/referenceDocument.js

export const MAX_REFERENCE_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export const ACCEPTED_REFERENCE_EXTENSIONS =
  '.txt,.md,.markdown,.csv,.json,.html,.htm,.xml,.rtf,.docx,.pdf,.jpg,.jpeg,.png,.webp';

const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'csv',
  'json',
  'html',
  'htm',
  'xml',
  'rtf',
]);

const INLINE_MIME_MAP = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const MAX_TEXT_CHARS = 60000;
const MAX_INLINE_IMAGE_DIMENSION = 1600;
const IMAGE_COMPRESS_THRESHOLD_BYTES = 350 * 1024;

/**
 * Resizes and compresses large uploaded images on the client so Gemini Vision
 * receives a crisp image without exceeding server JSON body size limits.
 */
async function encodeImageForGemini(file, fallbackMime) {
  const isImage = fallbackMime.startsWith('image/');
  if (isImage && file.size > IMAGE_COMPRESS_THRESHOLD_BYTES && typeof document !== 'undefined') {
    try {
      const objectUrl = URL.createObjectURL(file);
      try {
        const img = await new Promise((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = () => reject(new Error('Image decode failed'));
          el.src = objectUrl;
        });

        const scale = Math.min(
          1,
          MAX_INLINE_IMAGE_DIMENSION / Math.max(img.naturalWidth || 1, img.naturalHeight || 1)
        );
        const targetW = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
        const targetH = Math.max(1, Math.round((img.naturalHeight || 1) * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, targetW, targetH);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.82);
          const commaIdx = compressedDataUrl.indexOf(',');
          if (commaIdx !== -1) {
            return {
              mimeType: 'image/jpeg',
              base64Data: compressedDataUrl.slice(commaIdx + 1),
            };
          }
        }
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch {
      // Fall back to raw file encoding if browser canvas compression fails
    }
  }

  const dataUrl = await readFileAsDataUrl(file);
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) {
    throw new Error(`Failed to encode "${file.name}".`);
  }
  return {
    mimeType: fallbackMime,
    base64Data: dataUrl.slice(commaIdx + 1),
  };
}

/**
 * Formats byte sizes into a compact human-readable string.
 */
export function formatFileSize(bytes = 0) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileExtension(filename = '') {
  const parts = filename.toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Could not read "${file.name}" as text.`));
    reader.readAsText(file);
  });
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Could not read "${file.name}".`));
    reader.readAsArrayBuffer(file);
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Could not read "${file.name}".`));
    reader.readAsDataURL(file);
  });
}

function stripRtf(rtfText = '') {
  return rtfText
    .replace(/\{\\\*\\[^}]*\}/g, ' ')
    .replace(/\{\\(?:fonttbl|colortbl|stylesheet|info|pict|object)[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, ' ')
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\line\b/g, '\n')
    .replace(/\\tab\b/g, '\t')
    .replace(/\\'[0-9a-fA-F]{2}/g, '')
    .replace(/\\[a-zA-Z]+-?\d* ?/g, '')
    .replace(/[{}]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripHtml(htmlText = '') {
  try {
    if (typeof DOMParser !== 'undefined') {
      const doc = new DOMParser().parseFromString(htmlText, 'text/html');
      return (doc.body?.textContent || '').replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    }
  } catch {
    // Fall back to regex stripping if DOMParser fails
  }
  return htmlText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractWordXmlText(xmlText = '') {
  const withBreaks = xmlText
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<w:tab[^>]*\/>/g, '\t')
    .replace(/<[^>]+>/g, '');

  const decoded =
    typeof DOMParser !== 'undefined'
      ? new DOMParser().parseFromString(withBreaks, 'text/html').documentElement.textContent || withBreaks
      : withBreaks;

  return decoded.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function decompressDeflateRaw(compressedBytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot decompress .docx files directly. Please save as .txt, .md, or .pdf.');
  }
  const stream = new Blob([compressedBytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const decompressedBuffer = await new Response(stream).arrayBuffer();
  return new TextDecoder('utf-8').decode(decompressedBuffer);
}

/**
 * Extracts word/document.xml text from a .docx ZIP buffer using the ZIP Central Directory.
 */
async function extractDocxText(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);

  // Locate End of Central Directory (signature 0x06054b50) scanning backwards from file end
  const minEocdOffset = Math.max(0, bytes.length - 65557);
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= minEocdOffset; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error('Invalid .docx file (missing ZIP central directory).');
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralDirOffset = view.getUint32(eocdOffset + 16, true);
  const textDecoder = new TextDecoder('utf-8');

  let cursor = centralDirOffset;
  for (let entryIdx = 0; entryIdx < totalEntries; entryIdx++) {
    if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== 0x02014b50) {
      break;
    }

    const compressionMethod = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);

    const fileName = textDecoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));

    if (fileName === 'word/document.xml') {
      if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
        throw new Error('Corrupt .docx local entry for word/document.xml.');
      }
      const localNameLen = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
      const compressedSlice = bytes.subarray(dataStart, dataStart + compressedSize);

      let xmlString = '';
      if (compressionMethod === 0) {
        xmlString = textDecoder.decode(compressedSlice);
      } else if (compressionMethod === 8) {
        xmlString = await decompressDeflateRaw(compressedSlice);
      } else {
        throw new Error(`Unsupported .docx compression method (${compressionMethod}).`);
      }

      const extracted = extractWordXmlText(xmlString);
      if (!extracted) {
        throw new Error('The uploaded .docx document did not contain readable text.');
      }
      return extracted;
    }

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  throw new Error('Could not find document contents inside this .docx file.');
}

function clampReferenceText(text = '') {
  const cleaned = text.trim();
  if (cleaned.length <= MAX_TEXT_CHARS) return cleaned;
  return `${cleaned.slice(0, MAX_TEXT_CHARS).trim()}\n\n[Reference truncated to fit prompt limits.]`;
}

/**
 * Parses an uploaded reference document or recipe file into text or Gemini inlineData.
 */
export async function parseReferenceFile(file) {
  if (!file) throw new Error('No file selected.');
  if (file.size > MAX_REFERENCE_FILE_BYTES) {
    throw new Error(`"${file.name}" exceeds the 10 MB reference limit.`);
  }

  const ext = getFileExtension(file.name);
  const rawMime = (file.type || '').toLowerCase();

  if (
    ext === 'docx' ||
    rawMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const buffer = await readFileAsArrayBuffer(file);
    const extractedText = await extractDocxText(buffer);
    return {
      fileName: file.name,
      fileSize: file.size,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      kind: 'text',
      textContent: clampReferenceText(extractedText),
    };
  }

  if (INLINE_MIME_MAP[ext] || rawMime === 'application/pdf' || rawMime.startsWith('image/')) {
    const normalizedMime =
      rawMime === 'image/jpg'
        ? 'image/jpeg'
        : INLINE_MIME_MAP[ext] || rawMime || 'application/octet-stream';

    const { mimeType, base64Data } = await encodeImageForGemini(file, normalizedMime);

    return {
      fileName: file.name,
      fileSize: file.size,
      mimeType,
      kind: 'inlineData',
      inlineData: {
        mimeType,
        data: base64Data,
      },
    };
  }

  if (TEXT_EXTENSIONS.has(ext) || rawMime.startsWith('text/')) {
    let rawText = await readFileAsText(file);
    if (ext === 'rtf') {
      rawText = stripRtf(rawText);
    } else if (ext === 'html' || ext === 'htm') {
      rawText = stripHtml(rawText);
    }
    const cleaned = clampReferenceText(rawText);
    if (!cleaned) {
      throw new Error(`"${file.name}" appears to be empty.`);
    }
    return {
      fileName: file.name,
      fileSize: file.size,
      mimeType: rawMime || 'text/plain',
      kind: 'text',
      textContent: cleaned,
    };
  }

  throw new Error(
    `Unsupported file format "${file.name}". Please upload .txt, .md, .docx, .pdf, .csv, .json, .rtf, .html, or a recipe photo (.jpg/.png/.webp).`
  );
}

/**
 * Extracts a short dish subject suitable for image generation prompts when a long reference is attached.
 */
function extractImageSubjectHint({ userPrompt, pastedReference, uploadedDoc }) {
  const trimmedPrompt = (userPrompt || '').trim();
  if (trimmedPrompt) {
    return trimmedPrompt.slice(0, 160);
  }

  const refText = (uploadedDoc?.textContent || pastedReference || '').trim();
  if (refText) {
    const candidateLine = refText
      .split('\n')
      .map((line) => line.replace(/^#+\s*/, '').replace(/[*_`]/g, '').trim())
      .find(
        (line) =>
          line.length >= 4 &&
          !/^https?:\/\//i.test(line) &&
          !/^(?:prep(?:\s*time)?|cook(?:\s*time)?|total\s*time|yields?|servings?|ingredients?|instructions?|directions?|method|notes?|author|source)\s*:/i.test(line)
      );
    if (candidateLine) {
      return candidateLine.slice(0, 120).trim();
    }
  }

  if (uploadedDoc?.fileName) {
    return `Whole-food plant-based adaptation of ${uploadedDoc.fileName.replace(/\.[^.]+$/, '')}`;
  }

  return 'Whole-Food Plant-Based Dish';
}

/**
 * Builds the Gemini API parts, UI display metadata, and image hint for a turn with optional references.
 */
export function buildReferencePayload({
  userPrompt = '',
  pastedReference = '',
  uploadedDoc = null,
  engineMode = 'chat',
  isInitialTurn = false,
}) {
  const trimmedPrompt = (userPrompt || '').trim();
  const trimmedPaste = (pastedReference || '').trim();
  const hasReference = Boolean(trimmedPaste || uploadedDoc);

  let effectiveUserText = trimmedPrompt;
  if (!effectiveUserText && hasReference) {
    effectiveUserText =
      engineMode === 'chat'
        ? 'Please review this reference document/recipe and share your thoughts.'
        : 'Use the provided reference recipe/document as the base and generate a complete Whole-Food Plant-Based recipe adapted to my dietary settings.';
  }

  const baseApiLead =
    isInitialTurn && engineMode !== 'chat' && trimmedPrompt
      ? `I want a recipe for: ${trimmedPrompt}`
      : effectiveUserText;

  let combinedTextForApi = baseApiLead;

  if (trimmedPaste) {
    combinedTextForApi += `\n\n--- BEGIN PASTED REFERENCE RECIPE / NOTES ---\n${trimmedPaste}\n--- END PASTED REFERENCE RECIPE / NOTES ---`;
  }

  if (uploadedDoc?.kind === 'text' && uploadedDoc.textContent) {
    combinedTextForApi += `\n\n--- BEGIN UPLOADED REFERENCE DOCUMENT (${uploadedDoc.fileName}) ---\n${uploadedDoc.textContent.trim()}\n--- END UPLOADED REFERENCE DOCUMENT ---`;
  } else if (uploadedDoc?.kind === 'inlineData') {
    combinedTextForApi += `\n\n[Attached Reference File: ${uploadedDoc.fileName} — Use the contents of this attached file as the base reference for this request.]`;
  }

  const apiParts = [{ text: combinedTextForApi }];
  if (uploadedDoc?.kind === 'inlineData' && uploadedDoc.inlineData) {
    apiParts.push({ inlineData: uploadedDoc.inlineData });
  }

  const referenceBadges = [];
  if (uploadedDoc?.fileName) {
    referenceBadges.push(`📄 ${uploadedDoc.fileName}`);
  }
  if (trimmedPaste) {
    const wordCount = trimmedPaste.split(/\s+/).filter(Boolean).length;
    referenceBadges.push(`📋 Pasted Reference (${wordCount} ${wordCount === 1 ? 'word' : 'words'})`);
  }

  const displayParts = {
    userText: effectiveUserText,
    referenceBadges,
  };

  const imageSubjectHint = extractImageSubjectHint({
    userPrompt: trimmedPrompt,
    pastedReference: trimmedPaste,
    uploadedDoc,
  });

  return {
    apiParts,
    displayParts,
    imageSubjectHint,
  };
}
