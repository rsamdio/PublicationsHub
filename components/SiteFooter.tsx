import Link from 'next/link';

/** Shared site footer — same on home, publication, and legal pages. */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-stone-200/80 bg-[#fffcf8]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between text-sm text-slate-600">
        <p>© Rotaract South Asia MDIO. All rights reserved.</p>
        <div className="flex flex-wrap gap-4">
          <Link href="/privacy" className="hover:text-primary transition-colors">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-primary transition-colors">
            Terms
          </Link>
          <a href="/studio" className="hover:text-primary transition-colors">
            Studio
          </a>
          <a href="/admin" className="hover:text-primary transition-colors">
            Admin
          </a>
        </div>
      </div>
    </footer>
  );
}
