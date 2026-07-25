'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { pubIcon } from '@/lib/catalog/icons-public.js';

function Icon({
  name,
  className = ''
}: {
  name: Parameters<typeof pubIcon>[0];
  className?: string;
}) {
  return <span dangerouslySetInnerHTML={{ __html: pubIcon(name, className) }} />;
}

type ShareMenuProps = {
  title: string;
  text: string;
  getUrl: () => string;
  /** Icon-only shelf styles. */
  variant?: 'light' | 'dark';
  /** Full trigger className (publication detail CTAs). Overrides variant styles. */
  triggerClassName?: string;
  label?: string;
  /** Hero CTA: full-width trigger on small screens. */
  stretchOnMobile?: boolean;
};

const VIEWPORT_PAD = 8;

/**
 * Share popover that stays inside the viewport (fixed positioning escapes card overflow).
 */
export function ShareMenu({
  title,
  text,
  getUrl,
  variant = 'light',
  triggerClassName,
  label,
  stretchOnMobile = false
}: ShareMenuProps) {
  const [open, setOpen] = useState(false);
  const [copyLabel, setCopyLabel] = useState('Copy link');
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [deviceAvailable, setDeviceAvailable] = useState(false);

  useEffect(() => {
    let ok = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
    if (ok && typeof navigator.canShare === 'function') {
      try {
        ok = navigator.canShare({ url: getUrl() });
      } catch {
        ok = false;
      }
    }
    setDeviceAvailable(ok);
  }, [getUrl]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;

    const place = () => {
      const trigger = rootRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;

      const tr = trigger.getBoundingClientRect();
      const mw = menu.offsetWidth;
      const mh = menu.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const pad = VIEWPORT_PAD;

      // Prefer above the trigger; flip below if needed.
      let top = tr.top - mh - 4;
      if (top < pad) top = tr.bottom + 4;
      if (top + mh > vh - pad) top = Math.max(pad, vh - pad - mh);

      // Prefer end-aligned (menu right = trigger right); clamp horizontally.
      let left = tr.right - mw;
      if (left < pad) left = pad;
      if (left + mw > vw - pad) left = Math.max(pad, vw - pad - mw);

      menu.style.position = 'fixed';
      menu.style.top = `${Math.round(top)}px`;
      menu.style.left = `${Math.round(left)}px`;
      menu.style.right = 'auto';
      menu.style.bottom = 'auto';
      menu.style.minWidth = '13rem';
      menu.style.zIndex = '80';
    };

    place();
    // Second pass after fonts/icons settle width.
    const raf = requestAnimationFrame(place);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, deviceAvailable, copyLabel]);

  async function handleDeviceShare(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.share({ title, text, url: getUrl() });
      setOpen(false);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'AbortError') {
        return;
      }
    }
  }

  async function handleCopy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(getUrl());
      setCopyLabel('Link copied');
      setTimeout(() => {
        setCopyLabel('Copy link');
        setOpen(false);
      }, 1200);
    } catch {
      setCopyLabel('Copy failed');
      setTimeout(() => setCopyLabel('Copy link'), 2000);
    }
  }

  const resolvedTriggerClass =
    triggerClassName ||
    (variant === 'dark'
      ? 'p-1.5 rounded-lg bg-black/50 text-white hover:bg-black/70 backdrop-blur-sm transition-colors'
      : 'p-2 text-slate-500 hover:text-primary hover:bg-slate-100 rounded-lg transition-colors');
  const iconClass = label
    ? 'mr-2'
    : variant === 'dark'
      ? 'text-base'
      : 'text-xl';

  // Treat empty string as icon-only (publication edition cards).
  const showLabel = Boolean(label);

  const rootClass = stretchOnMobile
    ? 'relative w-full sm:w-auto z-20'
    : 'relative shrink-0 z-20';

  let menu: ReactNode = null;
  if (open) {
    menu = (
      <div
        ref={menuRef}
        className="rounded-xl border border-slate-200 bg-white shadow-xl py-1.5 overflow-hidden"
        role="menu"
        aria-label="Share"
      >
        {deviceAvailable ? (
          <button
            type="button"
            className="w-full text-left px-4 py-3 text-sm text-slate-800 hover:bg-slate-100 flex items-center gap-2 border-b border-slate-100"
            role="menuitem"
            onClick={handleDeviceShare}
          >
            <Icon name="send" className="text-lg text-primary shrink-0" />
            <span>Share via device…</span>
          </button>
        ) : null}
        <button
          type="button"
          className="w-full text-left px-4 py-3 text-sm text-slate-800 hover:bg-slate-100 flex items-center gap-2"
          role="menuitem"
          onClick={handleCopy}
        >
          <Icon name="link" className="text-lg text-slate-500 shrink-0" />
          <span>{copyLabel}</span>
        </button>
      </div>
    );
  }

  return (
    <div className={rootClass} ref={rootRef}>
      <button
        type="button"
        className={resolvedTriggerClass}
        aria-expanded={open}
        aria-haspopup="true"
        title="Share this publication"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <Icon name="share" className={iconClass} />
        {showLabel ? label : null}
      </button>
      {menu}
    </div>
  );
}
