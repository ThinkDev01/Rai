'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, Bug, BookOpen, CheckSquare, Zap, Loader2 } from '@/lib/icons';
import { useSearch } from '@/hooks/useSearch';
import { useDebounce } from '@/hooks/useDebounce';
import { orgRoute, useCurrentSlug } from '@/lib/routes';
import type { TicketType, SearchResult } from '@/types/api.types';

const TYPE_ICON: Record<TicketType, React.ReactNode> = {
  bug:   <Bug         size={13} className="text-bug"   />,
  story: <BookOpen    size={13} className="text-story" />,
  task:  <CheckSquare size={13} className="text-task"  />,
  epic:  <Zap         size={13} className="text-epic"  />,
};

const STATUS_LABEL: Record<string, string> = {
  todo: 'To Do', in_progress: 'In Progress', in_review: 'In Review', done: 'Done',
};

interface Props {
  onClose: () => void;
}

export function SearchModal({ onClose }: Props) {
  const router  = useRouter();
  const slug    = useCurrentSlug() ?? '';
  const [query, setQuery] = useState('');
  const debouncedQuery    = useDebounce(query, 300);
  const inputRef          = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState(0);

  const { data: results = [], isFetching } = useSearch(debouncedQuery);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);

  // Auto-focus input
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Reset selection when results change
  useEffect(() => { setSelected(0); }, [results]);

  // Keyboard navigation + Esc
  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
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
  }, [results, selected, onClose]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  function navigate(result: SearchResult) {
    router.push(orgRoute(slug, `/projects/${result.projectId}/tickets/${result.key}`));
    onClose();
  }

  const showResults  = debouncedQuery.trim().length >= 2;
  const showEmpty    = showResults && !isFetching && results.length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4 bg-black/50"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-surface-raised shadow-2xl">

        {/* Input row */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search size={16} className="flex-shrink-0 text-text-placeholder" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search tickets by title or key…"
            className="flex-1 bg-transparent text-sm text-text placeholder:text-text-placeholder outline-none"
          />
          {isFetching && <Loader2 size={14} className="flex-shrink-0 animate-spin text-text-placeholder" />}
          {query && !isFetching && (
            <button
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              className="flex-shrink-0 rounded p-0.5 text-text-placeholder transition-colors hover:text-text"
              tabIndex={-1}
              title="Clear"
            >
              <X size={13} />
            </button>
          )}
          <div className="w-px h-4 bg-border flex-shrink-0" />
          <button
            onClick={onClose}
            className="flex-shrink-0 rounded p-0.5 text-text-placeholder transition-colors hover:text-text"
          >
            <X size={14} />
          </button>
        </div>

        {/* Results */}
        {showResults && results.length > 0 && (
          <ul className="max-h-80 overflow-y-auto py-1.5">
            {results.map((result, idx) => (
              <li key={result.id} ref={el => { itemRefs.current[idx] = el; }}>
                <button
                  onClick={() => navigate(result)}
                  onMouseEnter={() => setSelected(idx)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    idx === selected ? 'bg-surface' : ''
                  }`}
                >
                  <span className="flex-shrink-0">{TYPE_ICON[result.type]}</span>
                  <span className="w-20 flex-shrink-0 font-mono text-xs text-text-placeholder">
                    {result.key}
                  </span>
                  <span className="flex-1 truncate text-sm text-text">{result.title}</span>
                  <span className="flex-shrink-0 rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] text-text-placeholder">
                    {STATUS_LABEL[result.status]}
                  </span>
                  <span className="hidden sm:block flex-shrink-0 text-[11px] text-text-placeholder truncate max-w-[80px]">
                    {result.projectKey}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {showEmpty && (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-text-placeholder">
              No tickets found for <span className="font-medium text-text">"{debouncedQuery}"</span>
            </p>
          </div>
        )}

        {!showResults && (
          <div className="px-4 py-5">
            <p className="text-xs text-text-placeholder">Type at least 2 characters to search across all tickets.</p>
          </div>
        )}

        {/* Footer hint */}
        <div className="border-t border-border px-4 py-2 flex items-center gap-3 text-[10px] text-text-placeholder">
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> open</span>
          <span><kbd className="font-mono">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
