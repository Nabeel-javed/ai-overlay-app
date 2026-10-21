'use strict';
(() => {
  const md = window.markdownit({ html: false, linkify: false, breaks: true });
  // Preserve LaTeX before Markdown consumes its backslashes or underscores.
  md.inline.ruler.before('escape', 'math', (state, silent) => {
    const start = state.pos;
    const open = ['$$', '\\[', '\\(', '$'].find(marker => state.src.startsWith(marker, start));
    if (!open || (open === '$' && /\s/.test(state.src[start + 1] || ' '))) return false;
    const close = { '\\[': '\\]', '\\(': '\\)' }[open] || open;
    let end = state.src.indexOf(close, start + open.length);
    while (end >= 0 && state.src[end - 1] === '\\') end = state.src.indexOf(close, end + close.length);
    if (end < 0) return false;
    if (!silent) {
      const token = state.push('text', '', 0);
      token.content = state.src.slice(start, end + close.length);
    }
    state.pos = end + close.length;
    return true;
  });
  md.block.ruler.before('paragraph', 'math_block', (state, start, end, silent) => {
    const offset = state.bMarks[start] + state.tShift[start];
    const open = state.src.slice(offset, offset + 2);
    if (!['$$', '\\['].includes(open)) return false;
    const close = open === '$$' ? '$$' : '\\]';
    const finish = state.src.indexOf(close, offset + 2);
    if (finish < 0) return false;
    let line = start;
    while (line < end && state.eMarks[line] < finish + 2) line++;
    if (line >= end) return false;
    // Let the inline rule preserve prose following a closing delimiter.
    if (state.src.slice(finish + 2, state.eMarks[line]).trim()) return false;
    if (!silent) {
      const token = state.push('math_block', 'div', 0);
      token.content = state.src.slice(offset, finish + 2);
      token.map = [start, line + 1];
    }
    state.line = line + 1;
    return true;
  });
  md.renderer.rules.math_block = (tokens, index) => `<div class="math">${md.utils.escapeHtml(tokens[index].content)}</div>\n`;
  const renderVersions = new WeakMap();
  let typesetQueue = Promise.resolve();
  window.renderAnswer = (element, text, format = 'markdown') => {
    const version = (renderVersions.get(element) || 0) + 1;
    renderVersions.set(element, version);
    const html = format === 'legacy' ? text : md.render(text);
    window.MathJax.typesetClear?.([element]);
    element.innerHTML = window.DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['img', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'video', 'audio'],
      FORBID_ATTR: ['style', 'id', 'name'],
    });
    // Link navigation is deliberately handled outside model output.
    element.querySelectorAll('a').forEach(link => link.addEventListener('click', event => event.preventDefault()));
    typesetQueue = typesetQueue.catch(() => {}).then(async () => {
      await window.MathJax.startup?.promise;
      if (element.isConnected && version === renderVersions.get(element)) await window.MathJax.typesetPromise?.([element]);
    }).catch(() => {});
    return typesetQueue;
  };
})();
