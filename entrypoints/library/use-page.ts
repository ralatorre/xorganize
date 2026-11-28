import { useEffect, useState } from 'preact/hooks';
import type { Page } from '@/src/library/route';

/** Where the page reads which part of the library to show, and hears that it changed. */
export interface Pages {
  current(): Page;
  watch(onChange: () => void): () => void;
  open(page: Page): void;
}

/** The part of the library the address shows, kept current as it changes. */
export function usePage(pages: Pages): Page {
  const [page, setPage] = useState(pages.current);
  useEffect(() => pages.watch(() => setPage(pages.current())), [pages]);
  return page;
}
