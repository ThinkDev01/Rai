// Allowlist HTML sanitizer for untrusted HTML we must render with
// dangerouslySetInnerHTML (today: mammoth's DOCX → HTML output in the
// attachment preview). Mammoth does NOT sanitize: a crafted .docx can carry
// `javascript:` hyperlinks, which would run in our origin (where auth tokens
// live) on click. Dependency-free on purpose — swap for DOMPurify if the
// allowlist ever needs to grow.
//
// Rules:
//   - Only tags in ALLOWED_TAGS survive; anything else is unwrapped (children
//     kept) — except DROP_WITH_CONTENT tags, removed with everything inside.
//   - Only attributes in ALLOWED_ATTRS survive; every on* handler, style,
//     srcset, etc. is stripped.
//   - href must be http(s)/mailto or an in-page #anchor; img src must be a
//     data:image/* (mammoth inlines images) or http(s) URL.
//   - Links open in a new tab with rel="noopener noreferrer".
// Browser-only (uses DOMParser) — call from client components.

const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr', 'span', 'div',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'small', 'mark',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  'a', 'img',
]);

const DROP_WITH_CONTENT = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template',
  'svg', 'math', 'form', 'input', 'button', 'textarea', 'select', 'link', 'meta', 'base',
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a:   new Set(['href', 'id', 'name']),
  img: new Set(['src', 'alt', 'width', 'height']),
  td:  new Set(['colspan', 'rowspan']),
  th:  new Set(['colspan', 'rowspan']),
  col: new Set(['span']),
  '*': new Set(['id']),
};

function isSafeHref(value: string): boolean {
  const v = value.trim();
  if (v.startsWith('#')) return true;
  return /^(https?:|mailto:)/i.test(v);
}

function isSafeImgSrc(value: string): boolean {
  const v = value.trim();
  return /^data:image\/(png|jpe?g|gif|webp|bmp);base64,/i.test(v) || /^https?:/i.test(v);
}

function cleanNode(node: Node, doc: Document): void {
  // Iterate over a static copy — we mutate the live child list.
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.COMMENT_NODE) {
      child.remove();
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const el = child as Element;
    const tag = el.tagName.toLowerCase();

    if (DROP_WITH_CONTENT.has(tag)) {
      el.remove();
      continue;
    }

    if (!ALLOWED_TAGS.has(tag)) {
      // Unwrap: keep the (cleaned) children, drop the element itself.
      cleanNode(el, doc);
      const frag = doc.createDocumentFragment();
      while (el.firstChild) frag.appendChild(el.firstChild);
      el.replaceWith(frag);
      continue;
    }

    const allowed = ALLOWED_ATTRS[tag];
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const keep = (allowed?.has(name) ?? false) || ALLOWED_ATTRS['*']!.has(name);
      if (!keep) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (tag === 'a' && name === 'href' && !isSafeHref(attr.value)) el.removeAttribute(attr.name);
      if (tag === 'img' && name === 'src' && !isSafeImgSrc(attr.value)) el.removeAttribute(attr.name);
    }

    if (tag === 'a' && el.hasAttribute('href') && !el.getAttribute('href')!.trim().startsWith('#')) {
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer');
    }

    cleanNode(el, doc);
  }
}

/** Returns a sanitized copy of `html`, safe for dangerouslySetInnerHTML. */
export function sanitizeHtml(html: string): string {
  // DOMParser with text/html never executes scripts or loads resources.
  const doc = new DOMParser().parseFromString(html, 'text/html');
  cleanNode(doc.body, doc);
  return doc.body.innerHTML;
}
