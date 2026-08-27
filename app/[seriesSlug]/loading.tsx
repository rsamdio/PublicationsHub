import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';

export default function SeriesLoading() {
  return (
    <>
      <SiteNav />
      <div className="flex flex-col flex-1 min-h-0 w-full animate-pulse">
        {/* Hero Skeleton */}
        <div className="relative bg-white border-b border-slate-200 overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
            <div className="lg:grid lg:grid-cols-12 lg:gap-12 items-center">
              <div className="lg:col-span-4 flex justify-center lg:justify-start mb-8 lg:mb-0">
                <div className="relative w-64 max-w-full aspect-[3/4] bg-slate-200 rounded-lg shadow-lg"></div>
              </div>
              <div className="lg:col-span-8 text-center lg:text-left">
                <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 mb-4">
                  <div className="h-6 w-24 bg-slate-200 rounded-full"></div>
                  <div className="h-6 w-20 bg-slate-200 rounded-full"></div>
                  <div className="h-6 w-32 bg-slate-200 rounded-full"></div>
                </div>
                <div className="h-12 sm:h-14 bg-slate-200 rounded-lg w-3/4 mx-auto lg:mx-0 mb-4"></div>
                <div className="h-6 bg-slate-200 rounded-lg w-full max-w-2xl mx-auto lg:mx-0 mb-2"></div>
                <div className="h-6 bg-slate-200 rounded-lg w-5/6 max-w-2xl mx-auto lg:mx-0 mb-8"></div>
                <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
                  <div className="h-12 sm:h-14 w-full sm:w-48 bg-slate-200 rounded-lg"></div>
                  <div className="h-12 sm:h-14 w-full sm:w-32 bg-slate-200 rounded-lg"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Grid Skeleton */}
        <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full min-h-0">
          <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4 border-b border-slate-200 pb-6">
            <div className="h-8 w-40 bg-slate-200 rounded-lg"></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 lg:gap-8">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex flex-col bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="relative aspect-[3/4] bg-slate-200"></div>
                <div className="p-5 flex-1 flex flex-col">
                  <div className="h-4 w-24 bg-slate-200 rounded mb-2"></div>
                  <div className="h-6 w-full bg-slate-200 rounded mb-1"></div>
                  <div className="h-6 w-4/5 bg-slate-200 rounded mb-4"></div>
                  <div className="h-4 w-full bg-slate-200 rounded mb-1"></div>
                  <div className="h-4 w-3/4 bg-slate-200 rounded mb-4 mt-auto"></div>
                  <div className="flex items-center gap-2 mt-auto">
                    <div className="flex-1 h-10 bg-slate-200 rounded-lg"></div>
                    <div className="h-10 w-10 bg-slate-200 rounded-lg"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
      <SiteFooter />
    </>
  );
}
