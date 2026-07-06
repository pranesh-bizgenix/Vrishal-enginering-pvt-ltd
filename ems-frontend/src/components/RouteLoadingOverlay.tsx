'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { BrandedLoader } from './BrandedLoader';

const ROUTE_LOADING_EVENT = 'ems-route-loading-start';

function isInternalRouteLink(anchor: HTMLAnchorElement) {
  const href = anchor.getAttribute('href');
  if (!href || href.startsWith('#') || anchor.target || anchor.hasAttribute('download')) {
    return false;
  }

  const url = new URL(href, window.location.href);
  return url.origin === window.location.origin && url.pathname !== window.location.pathname;
}

export function startRouteLoading() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(ROUTE_LOADING_EVENT));
  }
}

export function RouteLoadingOverlay() {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const hideTimer = useRef<number | null>(null);
  const safetyTimer = useRef<number | null>(null);
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    function clearTimers() {
      if (hideTimer.current) {
        window.clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      if (safetyTimer.current) {
        window.clearTimeout(safetyTimer.current);
        safetyTimer.current = null;
      }
    }

    function showLoader() {
      clearTimers();
      setLoading(true);
      safetyTimer.current = window.setTimeout(() => setLoading(false), 8000);
    }

    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
        return;
      }

      const target = event.target instanceof Element ? event.target.closest('a') : null;
      if (target instanceof HTMLAnchorElement && isInternalRouteLink(target)) {
        showLoader();
      }
    }

    window.addEventListener(ROUTE_LOADING_EVENT, showLoader);
    document.addEventListener('click', handleClick, true);

    return () => {
      clearTimers();
      window.removeEventListener(ROUTE_LOADING_EVENT, showLoader);
      document.removeEventListener('click', handleClick, true);
    };
  }, []);

  useEffect(() => {
    const previousPathname = pathnameRef.current;
    pathnameRef.current = pathname;

    if (!loading || previousPathname === pathname) {
      return;
    }

    hideTimer.current = window.setTimeout(() => setLoading(false), 280);
    return () => {
      if (hideTimer.current) {
        window.clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
    };
  }, [loading, pathname]);

  return loading ? <BrandedLoader message="Loading workspace..." overlay /> : null;
}
