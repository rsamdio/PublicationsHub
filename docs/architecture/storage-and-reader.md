# Architecture: Storage & Reader Engine

This document outlines the Cloudflare R2 storage architecture, upload pipeline, and the zero-cost client-side flipbook reader engine.

## 1. Storage Architecture

All PDF files and WebP cover images are stored in Cloudflare R2 (S3-compatible object storage).
- **Public access origin**: Configured via `R2_PUBLIC_BASE_URL` (e.g. `https://pub-xxx.r2.dev` or custom domain).
- **Security**: The client browser never receives R2 credentials. Uploads are handled via Cloud Functions or temporary Firebase Storage signed PUT URLs.

### Storage Object Key Convention
- Editions PDF: `publications/publishers/{publisherId}/series/{seriesId}/{timestamp}-{filename}.pdf`
- Edition Cover: `publications/publishers/{publisherId}/series/{seriesId}/{timestamp}-{filename}-cover.webp`
- Edition Thumbnail: `publications/publishers/{publisherId}/series/{seriesId}/{timestamp}-{filename}-cover-thumb.webp`
- Series Cover: `publications/publishers/{publisherId}/series/{seriesId}/series-cover.webp`
- Series Thumbnail: `publications/publishers/{publisherId}/series/{seriesId}/series-cover-thumb.webp`

## 2. Upload Pipeline

```
[Small PDFs (<= 28MB)]
Client (Studio) ────Multipart POST────► Cloud Function (uploadPublicationPdf) ────PutObject────► Cloudflare R2

[Large PDFs (28MB to 65MB)]
1. Client ────prepareEditionPdfUpload────► Cloud Function (generates signed Firebase Storage PUT URL)
2. Client ────Signed PUT────► Firebase Storage bucket (staging)
3. Client ────finalizeEditionPdfUpload────► Cloud Function (streams to R2 and deletes staging file)
```

## 3. Reader Engine Architecture

The reader runs entirely client-side without costly rasterization pipelines or third-party paid reader APIs:
- **Core Libraries**: Same-origin vendored PDF.js 3.11.174 (`public/vendor/pdfjs/`) and StPageFlip 2.0.7 (`public/vendor/page-flip/`).
- **Progressive Warm-up**: Hovering over a read link or visiting a publication detail triggers `warmReaderForEdition`, executing a Range HTTP request to prefetch initial PDF bytes.
- **First Spread Priority**: The first spread renders immediately while subsequent spreads render asynchronously in an idle queue.
- **Reactive Spread Layout**: Dynamically chooses single-page vs two-page spread:
  - Two-page spread: `(windowWidth >= 768) || (isLandscape && windowWidth >= 560)`
  - Single-page spread: Mobile viewports or narrow windows.
- **Theme**: Light reader theme by default, with instant dark mode toggle stored in `localStorage` (`pubhub-reader-theme`).
- **Iframe Embed Containment**: If loaded inside an iframe on an external site, deep links to editions break out into a new tab (`noopener`) to prevent layout clipping and preserve reader performance.
