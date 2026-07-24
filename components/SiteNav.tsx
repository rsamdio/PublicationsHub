import Link from 'next/link';
import Image from 'next/image';

type Props = {
  showStudioCta?: boolean;
};

export function SiteNav({ showStudioCta = true }: Props) {
  return (
    <nav
      id="app-nav"
      className="sticky top-0 z-50 w-full border-b border-stone-200/80 bg-[#fffcf8]/90 backdrop-blur-md"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link
            href="/"
            className="flex items-center text-left min-w-0 mr-2"
            aria-label="Publications Hub home"
          >
            <Image
              src="/images/rsamdio.webp"
              alt="Rotaract South Asia MDIO"
              width={432}
              height={180}
              className="h-8 sm:h-9 w-auto max-w-[min(100%,11rem)] sm:max-w-none shrink-0 object-contain object-left"
              priority
            />
          </Link>
          <div className="hidden md:flex items-center space-x-8">
            <Link
              href="/"
              className="text-sm font-medium text-slate-600 hover:text-primary transition-colors"
            >
              Home
            </Link>
            <a
              href="https://rsamdio.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-slate-600 hover:text-primary transition-colors"
            >
              RSAMDIO
            </a>
          </div>
          {showStudioCta ? (
            <div className="flex items-center gap-2 sm:gap-4 shrink-0">
              {/* Plain <a> forces full load so studio/admin DOM boot scripts re-bind cleanly */}
              <a
                href="/studio"
                className="inline-flex items-center justify-center px-3 py-2 sm:px-4 text-xs sm:text-sm font-medium rounded-lg text-white bg-primary hover:bg-primary-dark shadow-sm shadow-primary/25 transition-all whitespace-nowrap"
              >
                Publisher Studio
              </a>
            </div>
          ) : (
            <div className="w-0" aria-hidden="true" />
          )}
        </div>
      </div>
    </nav>
  );
}
