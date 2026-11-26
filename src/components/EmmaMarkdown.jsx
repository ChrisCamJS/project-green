import React from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';

const extractInternalPath = (href = '') => {
  const raw = String(href || '').trim();
  if (!raw) return null;

  if (raw.startsWith('/')) {
    return raw;
  }

  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    const isVaultHost =
      host === 'theveggievault.com' ||
      host === 'www.theveggievault.com' ||
      host === 'veggievault.chrisandemmashow.com' ||
      host === 'www.veggievault.chrisandemmashow.com' ||
      host === 'vault.chrisandemmashow.com' ||
      host === 'localhost' ||
      host === '127.0.0.1';

    if (isVaultHost) {
      return `${url.pathname}${url.search}${url.hash}` || '/';
    }
  } catch {
    return null;
  }

  return null;
};

const normalizeMarkdownForDisplay = (text = '') => {
  return String(text || '')
    .replace(/<RECIPE_IDEAS>[\s\S]*?<\/RECIPE_IDEAS>/gi, '')
    .replace(/<RECIPE_IDEAS>[\s\S]*$/i, '')
    .replace(/<\/?RECIPE_IDEAS>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/^(#{1,6})([^\s#])/gm, '$1 $2')
    .trim();
};

const EmmaMarkdown = ({ children }) => {
  if (!children) return null;
  const cleaned = normalizeMarkdownForDisplay(children);

  return (
    <ReactMarkdown
      components={{
        a: ({ href, children: linkText, ...props }) => {
          const internalPath = extractInternalPath(href);
          if (internalPath) {
            return (
              <Link
                to={internalPath}
                style={{
                  color: '#2f855a',
                  fontWeight: 700,
                  textDecoration: 'underline',
                  textUnderlineOffset: '2px',
                }}
                {...props}
              >
                {linkText}
              </Link>
            );
          }

          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: '#6b46c1',
                fontWeight: 600,
                textDecoration: 'underline',
                textUnderlineOffset: '2px',
              }}
              {...props}
            >
              {linkText}
            </a>
          );
        },
      }}
    >
      {cleaned}
    </ReactMarkdown>
  );
};

export default EmmaMarkdown;
