import type { Metadata } from 'next';
import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import { termsMainHtml } from '@/lib/client/terms-main';
import { buildShareMetadata } from '@/lib/seo/metadata';

const description = 'Terms of use for Publications Hub (PubHub).';

export const metadata: Metadata = buildShareMetadata({
  title: 'Terms of use',
  description,
  path: '/terms'
});

export default function TermsPage() {
  return (
    <>
      <SiteNav />
      <div className="flex-1 w-full" dangerouslySetInnerHTML={{ __html: termsMainHtml }} />
      <SiteFooter />
    </>
  );
}
