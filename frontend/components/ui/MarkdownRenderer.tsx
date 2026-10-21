'use client';

import { Fragment, memo, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { visit } from 'unist-util-visit';
import type { Root } from 'mdast';

interface MarkdownRendererProps {
  /** Raw Markdown, exactly as stored — never pre-rendered by the caller. */
  content: string;
  /** Known display names. Matched "@Name" occurrences render as mention chips,
   *  matching the legacy plain-text comment styling name-for-name. */
  memberNames?: string[];
  className?: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Longest names first so "@Jane Doe" wins over "@Jane" when both are members.
// The trailing negative lookahead is a word-boundary check — without it, a
// member named "Al" would match the "@Al" prefix inside "@Alice" and leave
// "ice" dangling as plain text. (MentionTextarea's own NAME_CHAR check does
// the equivalent for the compose-time dropdown; this mirrors it for display.)
function buildMentionRegex(memberNames: string[]): RegExp | null {
  if (!memberNames.length) return null;
  const sorted = [...memberNames].sort((a, b) => b.length - a.length);
  return new RegExp(`@(${sorted.map(escapeRegExp).join('|')})(?![a-zA-Z0-9])`, 'g');
}

function highlightMentionsInText(text: string, regex: RegExp): ReactNode {
  regex.lastIndex = 0;
  const parts: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(<span key={match.index} className="font-medium text-primary">@{match[1]}</span>);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : text;
}

// remark-gfm bundles task lists together with tables/strikethrough/autolinks
// with no per-feature switch to turn just one off. This plugin runs after
// remarkGfm and undoes only the task-list part of its output: it clears
// `checked` (so remark-rehype treats the item as an ordinary list item —
// no checkbox) and puts the literal "[ ] " / "[x] " back at the front of the
// item's text, since GFM's task-list parser strips that syntax out of the
// paragraph when it sets `checked`. Tables, strikethrough and autolinks are
// untouched — they're separate GFM sub-extensions this plugin never visits.
function remarkDisableTaskLists() {
  return (tree: Root) => {
    visit(tree, 'listItem', (node) => {
      if (node.checked === null || node.checked === undefined) return;
      const prefix = node.checked ? '[x] ' : '[ ] ';
      node.checked = null;
      const firstChild = node.children[0];
      if (firstChild?.type === 'paragraph') {
        firstChild.children.unshift({ type: 'text', value: prefix });
      } else {
        node.children.unshift({ type: 'paragraph', children: [{ type: 'text', value: prefix }] });
      }
    });
  };
}

// Markdown images render as a link, not a live <img> — product decision, not
// a technical limitation:
//   1. The app already has a separate Attachments feature for images;
//      Markdown image embedding isn't a current requirement.
//   2. Security: an auto-loading <img> fetches its `src` the instant the
//      comment renders, no click required — anyone could drop a per-user
//      tracking pixel into a ticket (`![](https://x.com/pixel?user=123)`)
//      and learn who viewed it, and when, just from them opening the ticket.
//
// To enable real image rendering later (once that's an actual requirement,
// ideally behind an image proxy the way Slack/GitHub do it, so the tracking-
// pixel concern above doesn't just move from us to the proxy), this is the
// only function that needs to change — swap the return below for:
//   <img src={url} alt={alt} loading="lazy" className="max-w-full rounded-md border border-border-subtle" />
// Everything else (mentions, tables, links, code) is unrelated to this and
// needs no changes.
const renderMarkdownImageAsLink: NonNullable<Components['img']> = ({ src, alt }) => {
  const url = typeof src === 'string' ? src : undefined;
  if (!url) return alt ? <>{alt}</> : null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="text-text-link underline underline-offset-2 hover:text-primary-hover"
    >
      🖼 {alt || url}
    </a>
  );
};

// react-markdown only invokes custom renderers for element nodes, never for
// raw text nodes — so mention highlighting has to walk each block's
// `children` itself. Nested elements (inline code, links, bold) pass through
// untouched rather than being re-processed.
function withMentions(children: ReactNode, regex: RegExp | null): ReactNode {
  if (!regex) return children;
  if (typeof children === 'string') return highlightMentionsInText(children, regex);
  if (Array.isArray(children)) {
    return children.map((child, i) => <Fragment key={i}>{withMentions(child, regex)}</Fragment>);
  }
  return children;
}

// Renders stored Markdown as formatted HTML. react-markdown builds a React
// element tree straight from the parsed AST — it never uses
// dangerouslySetInnerHTML and (without rehype-raw, which we don't use) drops
// any literal HTML typed into the source instead of executing it, so this is
// safe against injected <script>/<img onerror> etc. Link hrefs go through
// react-markdown's default sanitizer, which strips dangerous schemes like
// `javascript:`.
//
// Wrapped in memo so an unrelated re-render (e.g. typing in the new-comment
// composer re-renders the whole CommentThread) doesn't re-run the Markdown
// parser for every already-posted comment — only ones whose props actually
// changed. Relies on the caller passing a stable `memberNames` reference.
export const MarkdownRenderer = memo(function MarkdownRenderer({ content, memberNames = [], className }: MarkdownRendererProps) {
  const mentionRegex = buildMentionRegex(memberNames);

  return (
    <div className={`break-words text-sm leading-relaxed text-text ${className ?? ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks, remarkDisableTaskLists]}
        components={{
          h1: ({ children }) => (
            <h1 className="mb-2 mt-3 whitespace-pre-wrap text-lg font-bold text-text first:mt-0">{withMentions(children, mentionRegex)}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-3 whitespace-pre-wrap border-b border-border-subtle pb-1 text-base font-bold text-text first:mt-0">
              {withMentions(children, mentionRegex)}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1.5 mt-2.5 whitespace-pre-wrap text-sm font-bold text-text first:mt-0">{withMentions(children, mentionRegex)}</h3>
          ),
          p: ({ children }) => <p className="mb-2 whitespace-pre-wrap last:mb-0">{withMentions(children, mentionRegex)}</p>,
          // No extra padding here — the `pl-5` on ul/ol already provides the
          // marker's hanging indent. An additional pl on the <li> itself
          // shifted the item's text right of where its own bullet/number
          // sits, reading as slightly misaligned versus normal Markdown output.
          // No whitespace-pre-wrap on <li> itself — for a "loose" list
          // (blank line between items in the source), react-markdown wraps
          // each item's text in its own <p> (which already has pre-wrap),
          // and the structural newline text node next to that nested <p>
          // was rendering as a real blank line, splitting marker from text.
          li: ({ children }) => <li>{withMentions(children, mentionRegex)}</li>,
          ul: ({ children }) => <ul className="mb-2 list-disc space-y-0.5 pl-5 last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 list-decimal space-y-0.5 pl-5 last:mb-0">{children}</ol>,
          strong: ({ children }) => <strong className="font-semibold text-text">{withMentions(children, mentionRegex)}</strong>,
          em: ({ children }) => <em className="italic">{withMentions(children, mentionRegex)}</em>,
          // text-text, not text-text-subtle — text-subtle on this background
          // measured 3.75:1 (axe-core), under the WCAG AA 4.5:1 minimum.
          blockquote: ({ children }) => (
            <blockquote className="mb-2 border-l-2 border-primary bg-primary-subtle py-1.5 pl-3 pr-2 text-text last:mb-0">
              {children}
            </blockquote>
          ),
          // Fenced code blocks come through as a <code> whose text contains a
          // newline (inline code spans never do) — branch on that so a block
          // gets a plain monospace panel instead of the inline "chip" style.
          code: ({ children }) => {
            if (typeof children === 'string' && children.includes('\n')) {
              return <code className="block whitespace-pre font-mono text-[13px] text-text">{children}</code>;
            }
            // Plain text color, not `text-danger` — that token is reserved
            // for actual error/destructive UI elsewhere in the app; reusing
            // it here would make inline code look like an error state.
            return (
              <code className="rounded border border-border-subtle bg-surface px-1 py-0.5 font-mono text-[13px] text-text">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="mb-2 overflow-x-auto rounded-md border border-border-subtle bg-surface p-3 last:mb-0">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="mb-2 overflow-x-auto rounded-md border border-border-subtle last:mb-0">
              <table className="w-full border-collapse text-left text-[13px]">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-surface">{children}</thead>,
          tr: ({ children }) => <tr className="border-b border-border-subtle last:border-0">{children}</tr>,
          th: ({ children }) => <th className="px-3 py-1.5 font-semibold text-text">{withMentions(children, mentionRegex)}</th>,
          td: ({ children }) => <td className="px-3 py-1.5 align-top text-text">{withMentions(children, mentionRegex)}</td>,
          img: renderMarkdownImageAsLink,
          // An href that react-markdown's sanitizer stripped (e.g. a
          // `javascript:`/`data:` scheme) comes through empty — render plain
          // text instead of a blue "link" that does nothing when clicked.
          a: ({ href, children }) => {
            if (!href) return <>{children}</>;
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-text-link underline underline-offset-2 hover:text-primary-hover"
              >
                {children}
              </a>
            );
          },
          hr: () => <hr className="my-3 border-border" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
