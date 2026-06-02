/**
 * Text Utilities
 * Helper functions for text processing and formatting
 * @module marketplace/services/textUtils
 */

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} text - Raw text
 * @returns {string} Escaped HTML-safe text
 */
export function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

/**
 * Parse basic Markdown to HTML with auto-linking
 * Supported formats: **bold**, *italic*, `code`, ~~strikethrough~~, [text](url), URLs
 * @param {string} text - Text with optional Markdown formatting
 * @returns {string} HTML string with Markdown converted
 */
export function autoLink(text) {
  if (!text) return ''

  // Escape HTML first for security
  let html = escapeHtml(text)

  // Process Markdown patterns (order matters)

  // Headers: # h1, ## h2, ### h3, #### h4 (must be at start of line)
  html = html.replace(/^#### (.+)$/gm, '<h6 class="mp-md-h4">$1</h6>')
  html = html.replace(/^### (.+)$/gm, '<h5 class="mp-md-h3">$1</h5>')
  html = html.replace(/^## (.+)$/gm, '<h4 class="mp-md-h2">$1</h4>')
  html = html.replace(/^# (.+)$/gm, '<h3 class="mp-md-h1">$1</h3>')

  // Markdown links: [text](url) - process before auto-linking URLs
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="mp-auto-link">$1</a>')

  // Auto-link remaining bare URLs
  html = html.replace(/(?<!\])\((https?:\/\/[^\s)]+)\)|(?<!")(https?:\/\/[^\s<]+)(?![^<]*<\/a>)/g,
    (match, p1, p2) => {
      const url = p1 || p2
      if (!url) return match
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="mp-auto-link">${url}</a>`
    })

  // Bold: **text** or __text__
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>')

  // Italic: *text* or _text_ (single, not double)
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
  html = html.replace(/(?<!_)_([^_]+)_(?!_)/g, '<em>$1</em>')

  // Inline code: `code`
  html = html.replace(/`([^`]+)`/g, '<code class="mp-inline-code">$1</code>')

  // Strikethrough: ~~text~~
  html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>')

  return html
}

/**
 * Strip Markdown formatting from text (plain text output)
 * @param {string} text - Text with Markdown formatting
 * @returns {string} Plain text without formatting
 */
export function stripMarkdown(text) {
  if (!text) return ''
  return text
    .replace(/^#{1,4} /gm, '')                // # header → header
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // [text](url) → text
    .replace(/\*\*([^*]+)\*\*/g, '$1')        // **bold** → bold
    .replace(/__([^_]+)__/g, '$1')            // __bold__ → bold
    .replace(/\*([^*]+)\*/g, '$1')            // *italic* → italic
    .replace(/_([^_]+)_/g, '$1')              // _italic_ → italic
    .replace(/`([^`]+)`/g, '$1')              // `code` → code
    .replace(/~~([^~]+)~~/g, '$1')            // ~~strike~~ → strike
}

export default { escapeHtml, autoLink, stripMarkdown }
