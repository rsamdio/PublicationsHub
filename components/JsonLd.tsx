export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  const payload = Array.isArray(data) ? data : [data];
  // Escape `<` so publisher-controlled strings cannot break out of </script>.
  const json = JSON.stringify(payload.length === 1 ? payload[0] : payload).replace(
    /</g,
    '\\u003c'
  );
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: json
      }}
    />
  );
}
