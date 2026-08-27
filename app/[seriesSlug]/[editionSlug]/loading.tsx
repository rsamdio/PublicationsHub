export default function EditionLoading() {
  return (
    <div className="reader-route-shell" data-reader-theme="light">
      <div className="fixed inset-0 z-40 flex flex-col w-full h-full max-h-[100dvh] overflow-hidden" style={{ backgroundColor: '#f6f3ed' }}>
        <header className="flex items-center justify-between px-2 sm:px-4 h-14 bg-white/90 border-b border-slate-300">
          <div className="flex items-center">
            <div className="w-10 h-10 rounded bg-slate-200 animate-pulse"></div>
            <div className="ml-3 hidden sm:block">
              <div className="w-32 h-4 bg-slate-200 rounded animate-pulse mb-1"></div>
              <div className="w-20 h-3 bg-slate-200 rounded animate-pulse"></div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded bg-slate-200 animate-pulse"></div>
            <div className="w-10 h-10 rounded bg-slate-200 animate-pulse"></div>
          </div>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center relative">
          <div className="w-16 h-16 border-4 border-slate-200 border-t-primary rounded-full animate-spin"></div>
          <p className="mt-4 text-slate-500 font-medium animate-pulse">Preparing flipbook...</p>
        </div>

        <footer className="h-12 sm:h-14 w-full flex-shrink-0 flex items-center justify-center pb-safe">
          <div className="flex items-center bg-white/90 border border-slate-300 rounded-full px-2 h-10 w-64 animate-pulse">
            <div className="w-full h-full bg-slate-200/50 rounded-full"></div>
          </div>
        </footer>
      </div>
    </div>
  );
}
