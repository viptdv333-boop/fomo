"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Facets, GroupTab, MarketItem, MarketPage } from "@/lib/market-types";
import { applyFilters, computeFacets, type Filters } from "@/lib/instrument-filters";
import { staticPopular } from "@/lib/market-popular";
import { fetchMarketPage, PAGE_SIZE } from "@/lib/market-client";
import { itemKey } from "@/lib/instrument-rows";

/** the wait after the last keystroke before a typed query goes to the server */
export const SEARCH_DEBOUNCE_MS = 250;
const POPULAR_TTL = 5 * 60_000;

/** first pages of the popular lists (nothing typed) by chip + filters: a reopened dialog shows them at once. A copy of the server's answer. */
const popularCache = new Map<string, { at: number; page: MarketPage }>();
const filtersKey = (f: Filters) => `${f.country}|${f.venue}|${f.asset}`;
const popularKey = (tab: GroupTab, f: Filters) => `${tab}|${filtersKey(f)}`;

interface Loaded {
  /** the request this answers (chip | filters | query) */
  key: string;
  tab: GroupTab;
  items: MarketItem[];
  total: number;
  hasMore: boolean;
  facets: Facets;
  /** answer to an empty query */
  popular: boolean;
}

const fromPage = (key: string, tab: GroupTab, page: MarketPage, popular: boolean): Loaded => ({ key, tab, items: page.items, total: page.total, hasMore: page.hasMore, facets: page.facets, popular });

export interface InstrumentSearch {
  items: MarketItem[];
  /** rows after the filters, all pages */
  total: number;
  hasMore: boolean;
  /** a request is on its way (the rows shown may be the previous ones) */
  loading: boolean;
  loadingMore: boolean;
  /** nothing typed: the chip's popular list */
  popular: boolean;
  /** the last request failed (network / server) */
  failed: boolean;
  /** options of the two dropdowns, from the rows on offer */
  facets: Facets;
  loadMore: () => void;
}

/**
 * Server-side search of the instrument dialog: a typed query goes out 250 ms after the last keystroke, an empty one (the chip's popular list, also
 * after a chip / filter change) at once; pages of 40 rows, the next one on loadMore(). With nothing typed the curated static list stands in until the
 * live one arrives (never an empty hint), the previous rows of the same chip stay while a typed query loads.
 */
export function useInstrumentSearch(q: string, tab: GroupTab, filters: Filters, enabled = true): InstrumentSearch {
  const needle = q.trim();
  const fKey = filtersKey(filters);
  const reqKey = `${tab}|${fKey}|${needle}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const moreCtl = useRef<AbortController | null>(null);

  useEffect(() => {
    moreCtl.current?.abort();
    setLoadingMore(false);
    if (!enabled) {
      setLoaded(null);
      setLoading(false);
      setFailed(false);
      return;
    }
    const f = filtersRef.current;
    const ctl = new AbortController();
    if (!needle) {
      const ck = popularKey(tab, f);
      const hit = popularCache.get(ck);
      if (hit && Date.now() - hit.at < POPULAR_TTL) {
        setLoaded(fromPage(reqKey, tab, hit.page, true));
        setLoading(false);
        setFailed(false);
        return;
      }
      setLoading(true);
      void fetchMarketPage({ q: "", group: tab, filters: f }, ctl.signal).then((page) => {
        if (ctl.signal.aborted) return;
        setLoading(false);
        setFailed(!page);
        if (page) {
          popularCache.set(ck, { at: Date.now(), page });
          setLoaded(fromPage(reqKey, tab, page, true));
        }
      });
      return () => ctl.abort();
    }
    setLoading(true);
    const id = setTimeout(async () => {
      const page = await fetchMarketPage({ q: needle, group: tab, filters: f }, ctl.signal);
      if (ctl.signal.aborted) return;
      setLoading(false);
      setFailed(!page);
      setLoaded(page ? fromPage(reqKey, tab, page, false) : { key: reqKey, tab, items: [], total: 0, hasMore: false, facets: { countries: [], venues: [] }, popular: false });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(id);
      ctl.abort();
    };
    // the filters are read through the ref: their key is in the deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needle, tab, fKey, enabled]);

  const loadMore = useCallback(() => {
    if (!loaded || loaded.key !== reqKey || !loaded.hasMore || loadingMore) return;
    const ctl = new AbortController();
    moreCtl.current = ctl;
    setLoadingMore(true);
    const base = loaded;
    void fetchMarketPage({ q: needle, group: tab, filters: filtersRef.current, offset: base.items.length }, ctl.signal).then((page) => {
      if (ctl.signal.aborted) return;
      setLoadingMore(false);
      if (!page) return;
      setLoaded((cur) => {
        if (!cur || cur.key !== base.key) return cur;
        const seen = new Set(cur.items.map(itemKey));
        return { ...cur, items: [...cur.items, ...page.items.filter((i) => !seen.has(itemKey(i)))], hasMore: page.hasMore, total: page.total };
      });
    });
  }, [loaded, reqKey, loadingMore, needle, tab]);

  if (loaded && loaded.key === reqKey) {
    return { items: loaded.items, total: loaded.total, hasMore: loaded.hasMore, loading, loadingMore, popular: loaded.popular, failed, facets: loaded.facets, loadMore };
  }
  if (!needle) {
    // the popular list is there before the answer: the cached first page, else the curated static list
    const hit = popularCache.get(popularKey(tab, filters));
    if (hit) return { items: hit.page.items, total: hit.page.total, hasMore: hit.page.hasMore, loading, loadingMore, popular: true, failed, facets: hit.page.facets, loadMore };
    const all = staticPopular(tab);
    const base = tab === "future" && filters.asset ? all.filter((i) => i.fgroup === filters.asset) : all;
    const rows = applyFilters(all, tab, filters);
    return { items: rows.slice(0, PAGE_SIZE), total: rows.length, hasMore: false, loading, loadingMore, popular: true, failed, facets: computeFacets(base, tab), loadMore };
  }
  // a typed query is loading: the previous typed rows of this chip stay on screen
  const stale = loaded && !loaded.popular && loaded.tab === tab ? loaded : null;
  return { items: stale?.items ?? [], total: stale?.total ?? 0, hasMore: false, loading, loadingMore, popular: false, failed, facets: stale?.facets ?? { countries: [], venues: [] }, loadMore };
}
