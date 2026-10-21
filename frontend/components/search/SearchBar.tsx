'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, Bug, BookOpen, CheckSquare, Zap, Loader2 } from '@/lib/icons';
import { useSearch } from '@/hooks/useSearch';
import { useDebounce } from '@/hooks/useDebounce';
import { orgRoute, useCurrentSlug } from '@/lib/routes';
import type { TicketType, SearchResult } from '@/types/api.types';

const TYPE_ICON: Record<TicketType, React.ReactNode> = {
  bug:   <Bug         size={12} className="text-bug"   />,
  story: <BookOpen    size={12} className="text-story" />,
  task:  <CheckSquare size={12} className="text-task"  />,
  epic:  <Zap         size={12} className="text-epic"  />,
};

const STATUS_LABEL: Record<string, string> = {
  todo: 'To Do', in_progress: 'In Progress', in_review: 'In Review', done: 'Done',
};

interface Props {
  /** Called from Header so Cmd+K can focus the input */
  inputRef: React.RefObject<HTMLInputElement | null>;
}

export function SearchBar({ inputRef }: Props) {
  const router = useRouter();
  const slug = useCurrentSlug() ?? '';
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs     = useRef<(HTMLLIElement | null)[]>([]);

  const [query,    setQuery]    = useState('');
  const [open,     setOpen]     = useState(false);
  const [selected, setSelected] = useState(0);

  const debouncedQuery = useDebounce(query, 300);
  const { data: results = [], isFetching } = useSearch(debouncedQuery);

  const showResults = debouncedQuery.trim().length >= 2;

  // Close dropdown when clicking outside
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  // Reset selection when results change
  useEffect(() => { setSelected(0); }, [results]);

  function navigate(result: SearchResult) {
    router.push(orgRoute(slug, `/projects/${result.projectId}/tickets/${result.key}`));
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  }

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.min(selected + 1, results.length - 1);
      setSelected(next);
      itemRefs.current[next]?.scrollIntoView({ block: 'nearest' });
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.max(selected - 1, 0);
      setSelected(next);
      itemRefs.current[next]?.scrollIntoView({ block: 'nearest' });
    }
    if (e.key === 'Enter' && results[selected]) {
      navigate(results[selected]);
    }
  }, [open, results, selected]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={containerRef} className="relative w-full max-w-md">

      {/* Input */}
      <div className="relative flex items-center">
        <Search
          size={13}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-placeholder"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search tickets…"
          className="w-full rounded-md border border-border bg-surface py-1.5 pl-8 pr-10 text-sm text-text
            placeholder:text-text-placeholder transition-colors outline-none
            focus:border-primary focus:bg-surface-raised"
        />
        {isFetching ? (
          <Loader2
            size={12}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-text-placeholder"
          />
        ) : query ? (
          <button
            onMouseDown={e => { e.preventDefault(); setQuery(''); setOpen(false); inputRef.current?.blur(); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-placeholder transition-colors hover:text-text"
            tabIndex={-1}
          >
            <X size={12} />
          </button>
        ) : (
          <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 hidden lg:inline-flex
            items-center rounded border border-border px-1 py-px font-mono text-[10px] text-text-placeholder"
          >
            ⌘K
          </kbd>
        )}
      </div>

      {/* Dropdown - only when input is focused */}
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1.5 overflow-hidden rounded-lg border border-border bg-surface-raised shadow-xl z-50">

          {showResults && results.length > 0 && (
            <ul className="max-h-72 overflow-y-auto py-1">
              {results.map((result, idx) => (
                <li key={result.id} ref={el => { itemRefs.current[idx] = el; }}>
                  <button
                    onMouseDown={e => { e.preventDefault(); navigate(result); }}
                    onMouseEnter={() => setSelected(idx)}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                      idx === selected ? 'bg-surface' : ''
                    }`}
                  >
                    <span className="flex-shrink-0 mt-px">{TYPE_ICON[result.type]}</span>
                    <span className="w-[4.5rem] flex-shrink-0 font-mono text-xs text-text-placeholder">
                      {result.key}
                    </span>
                    <span className="flex-1 truncate text-sm text-text">{result.title}</span>
                    <span className="flex-shrink-0 rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] text-text-placeholder">
                      {STATUS_LABEL[result.status]}
                    </span>
                    <span className="hidden sm:block flex-shrink-0 text-[11px] text-text-placeholder max-w-[5rem] truncate">
                      {result.projectKey}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {showResults && !isFetching && results.length === 0 && (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-text-placeholder">
                No results for <span className="font-medium text-text">"{debouncedQuery}"</span>
              </p>
            </div>
          )}

          {!showResults && (
            <div className="px-4 py-3">
              <p className="text-xs text-text-placeholder">Type at least 2 characters to search tickets.</p>
            </div>
          )}

          {/* Keyboard hint footer */}
          {showResults && results.length > 0 && (
            <div className="border-t border-border px-3 py-2 flex items-center gap-3 text-[10px] text-text-placeholder">
              <span><kbd className="font-mono">↑↓</kbd> navigate</span>
              <span><kbd className="font-mono">↵</kbd> open</span>
              <span><kbd className="font-mono">Esc</kbd> close</span>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
