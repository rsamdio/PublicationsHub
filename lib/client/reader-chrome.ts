/** Full-viewport reader shell for the standalone edition page (`/p/.../e/...`). */
export const readerChromeHtml = `<div id="reader-view" data-reader-mode="page" class="reader-page flex flex-col touch-manipulation bg-reader-bg">
    <div id="flipbook-wrapper" class="flex-1 flex items-center justify-center w-full min-h-0 overflow-hidden overscroll-none p-2 sm:p-4 pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))] sm:pb-4" style="min-width: 0;">
      <div id="flipbook-pan" class="relative transition-transform duration-300 ease-out will-change-transform">
        <div id="flipbook-container" class="relative"></div>
      </div>
    </div>
    <audio id="page-flip-sound" preload="none" aria-hidden="true">
      <source src="/images/pageturn.mp3" type="audio/mpeg" />
    </audio>
    <div class="absolute top-2 left-2 right-2 sm:top-4 sm:left-4 sm:right-4 z-20 flex flex-row items-start justify-between gap-2 pointer-events-none">
      <div class="pointer-events-auto flex flex-col gap-2 min-w-0 max-w-[min(18rem,calc(100vw-5.5rem))]">
        <button type="button" id="reader-close" class="inline-flex items-center gap-2 text-gray-200 hover:text-white bg-black/60 hover:bg-black/80 backdrop-blur-sm px-3 py-2.5 sm:py-2 rounded-lg border border-white/10 shadow-lg transition-all group w-fit min-h-[44px]">
          <span data-pub-icon="chevron_left" class="text-xl group-hover:-translate-x-0.5 transition-transform"></span>
          <span class="text-sm font-semibold tracking-wide">Back</span>
        </button>
        <div id="reader-name-card" class="bg-black/60 backdrop-blur-sm rounded-lg border border-white/10 shadow-lg px-4 py-3 w-fit max-w-full">
          <h1 id="reader-title" class="text-white text-sm font-bold leading-tight">Publication</h1>
          <span id="reader-edition" class="text-gray-400 text-xs font-medium"></span>
        </div>
      </div>
      <a id="reader-download-link" href="#" class="pointer-events-auto inline-flex items-center justify-center min-h-11 min-w-11 rounded-lg bg-black/60 hover:bg-black/80 backdrop-blur-sm border border-white/10 text-gray-200 hover:text-white shadow-lg transition-all shrink-0" title="Download PDF">
        <span data-pub-icon="download" class="text-[22px]"></span>
      </a>
    </div>
    <footer class="fixed sm:absolute inset-x-0 bottom-0 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:bottom-4 z-30 flex justify-center px-2 sm:px-4 pointer-events-none pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:pb-0">
      <div class="pointer-events-auto w-full max-w-[min(100vw-0.5rem,28rem)] sm:max-w-none sm:w-auto bg-black/80 backdrop-blur-md rounded-t-2xl sm:rounded-2xl shadow-2xl border border-white/10 border-b-0 sm:border-b">
        <div class="flex flex-col sm:flex-row sm:flex-nowrap sm:items-stretch divide-y sm:divide-y-0 sm:divide-x divide-white/10">
          <div class="flex items-center justify-center gap-0.5 px-2 py-1.5 sm:px-3 sm:py-2.5 shrink-0 flex-nowrap">
            <button type="button" id="reader-first" class="text-gray-100 hover:text-white min-h-10 min-w-10 sm:min-h-9 sm:min-w-9 inline-flex items-center justify-center rounded-md hover:bg-white/15 p-0.5 transition-colors shrink-0" title="First page (Home)"><span data-pub-icon="first_page" class="text-lg sm:text-xl"></span></button>
            <button type="button" id="reader-prev" class="text-gray-100 hover:text-white min-h-10 min-w-10 sm:min-h-9 sm:min-w-9 inline-flex items-center justify-center rounded-md hover:bg-white/15 p-0.5 transition-colors shrink-0" title="Previous (←)"><span data-pub-icon="chevron_left" class="text-lg sm:text-xl"></span></button>
            <span id="reader-page-info" class="text-xs font-bold text-white min-w-[3.5rem] max-w-[5.5rem] text-center tabular-nums px-0.5 shrink-0 truncate">1 / 1</span>
            <button type="button" id="reader-next" class="text-gray-100 hover:text-white min-h-10 min-w-10 sm:min-h-9 sm:min-w-9 inline-flex items-center justify-center rounded-md hover:bg-white/15 p-0.5 transition-colors shrink-0" title="Next (→)"><span data-pub-icon="chevron_right" class="text-lg sm:text-xl"></span></button>
            <button type="button" id="reader-last" class="text-gray-100 hover:text-white min-h-10 min-w-10 sm:min-h-9 sm:min-w-9 inline-flex items-center justify-center rounded-md hover:bg-white/15 p-0.5 transition-colors shrink-0" title="Last page (End)"><span data-pub-icon="last_page" class="text-lg sm:text-xl"></span></button>
          </div>
          <div class="flex items-center justify-center gap-1.5 px-2 py-1.5 sm:px-3 sm:py-2.5">
            <label for="reader-page-jump" class="sr-only">Go to page</label>
            <span class="text-[10px] uppercase tracking-wide text-gray-500 hidden sm:inline shrink-0">Page</span>
            <input type="number" id="reader-page-jump" min="1" value="1" class="w-10 sm:w-11 min-h-8 rounded-md bg-white/10 border border-white/15 text-white text-xs py-1 px-1 text-center tabular-nums focus:ring-1 focus:ring-primary focus:border-primary" title="Page number, then Enter"/>
            <button type="button" id="reader-page-jump-go" class="text-gray-300 hover:text-white text-xs font-medium min-h-8 px-2 py-1 rounded-md hover:bg-white/10 inline-flex items-center justify-center shrink-0" title="Go to page">Go</button>
          </div>
          <div class="flex items-center justify-center gap-0.5 sm:gap-1 px-2 py-1.5 sm:px-3 sm:py-2.5">
            <button type="button" id="reader-zoom-out" class="text-gray-100 hover:text-white min-h-10 min-w-10 sm:min-h-9 sm:min-w-9 inline-flex items-center justify-center rounded-md hover:bg-white/15 p-0.5 transition-colors shrink-0" title="Zoom out"><span data-pub-icon="remove" class="text-lg"></span></button>
            <div class="flex items-center gap-0.5">
              <label for="reader-zoom-input" class="sr-only">Zoom percent (50–250, Enter to apply)</label>
              <input type="number" id="reader-zoom-input" min="50" max="250" step="1" value="100" inputmode="numeric" autocomplete="off" class="w-[3rem] sm:w-[3.25rem] min-h-8 rounded-md bg-white/10 border border-white/15 text-white text-xs py-1 px-0.5 text-center tabular-nums focus:ring-1 focus:ring-primary focus:border-primary" title="Zoom % (Enter or blur to apply)"/>
              <span class="text-[10px] text-gray-400 font-medium tabular-nums select-none" aria-hidden="true">%</span>
            </div>
            <button type="button" id="reader-zoom-in" class="text-gray-100 hover:text-white min-h-10 min-w-10 sm:min-h-9 sm:min-w-9 inline-flex items-center justify-center rounded-md hover:bg-white/15 p-0.5 transition-colors shrink-0" title="Zoom in"><span data-pub-icon="add" class="text-lg"></span></button>
            <button type="button" id="reader-fit-reset" class="text-gray-400 hover:text-white min-h-9 min-w-9 sm:min-h-8 sm:min-w-8 inline-flex items-center justify-center rounded-md hover:bg-white/10 sm:border-l border-white/10 sm:pl-2 sm:ml-1 p-0.5 transition-colors" title="Reset zoom to 100%"><span data-pub-icon="fit_screen" class="text-lg"></span></button>
            <button type="button" id="reader-fullscreen" class="text-gray-100 hover:text-white min-h-10 min-w-10 sm:min-h-9 sm:min-w-9 inline-flex items-center justify-center rounded-md hover:bg-white/15 p-0.5 transition-colors shrink-0" title="Fullscreen"><span data-pub-icon="fullscreen" class="text-lg"></span></button>
          </div>
        </div>
      </div>
      <span class="sr-only">Keyboard: arrows or PgUp/PgDn turn pages; Home, End; Escape closes. Touch: pinch to zoom; drag to pan when zoomed. Ctrl-scroll to zoom on desktop.</span>
    </footer>
    <div id="reader-loading" class="absolute inset-0 z-10 hidden flex-col items-center justify-center bg-reader-bg/95">
      <p class="text-gray-200 mb-2 text-sm font-medium">Loading publication…</p>
      <p id="reader-loading-detail" class="text-gray-500 text-xs mb-4 min-h-[1rem]"></p>
      <div class="w-52 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div id="reader-progress" class="h-full bg-primary rounded-full transition-all duration-300" style="width: 0%"></div>
      </div>
    </div>
    <p id="reader-error" class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-red-400 hidden z-20 text-center px-4"></p>
  </div>`;
