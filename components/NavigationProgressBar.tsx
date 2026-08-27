'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';

function NavigationProgressBarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isRouting, setIsRouting] = useState(false);

  useEffect(() => {
    setIsRouting(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    const handleAnchorClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('a');
      // Ignore new tabs, external links, or modified clicks
      if (!target || target.target === '_blank' || e.ctrlKey || e.metaKey || e.shiftKey) return;
      
      const href = target.getAttribute('href');
      // Ignore empty hrefs, external URLs, and anchors
      if (!href || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#')) return;
      
      // If the link points to the same page, do not trigger loading
      const currentUrl = window.location.pathname + window.location.search;
      if (href === currentUrl) return;

      setIsRouting(true);
    };

    document.addEventListener('click', handleAnchorClick);
    return () => document.removeEventListener('click', handleAnchorClick);
  }, []);

  if (!isRouting) return null;

  return (
    <div className="fixed top-0 left-0 right-0 h-[2.5px] bg-primary/20 z-[9999] pointer-events-none overflow-hidden">
      <style>{`
        @keyframes navigation-progress {
          0% { transform: translateX(-100%); width: 20%; }
          50% { transform: translateX(100vw); width: 60%; }
          100% { transform: translateX(300vw); width: 20%; }
        }
      `}</style>
      <div 
        className="absolute top-0 left-0 h-full bg-primary"
        style={{
          width: '40%',
          animation: 'navigation-progress 1.5s ease-in-out infinite'
        }}
      />
    </div>
  );
}

export function NavigationProgressBar() {
  return (
    <Suspense fallback={null}>
      <NavigationProgressBarInner />
    </Suspense>
  );
}
