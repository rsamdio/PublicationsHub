import type { Metadata } from 'next';
import { SiteNav } from '@/components/SiteNav';
import { SiteFooter } from '@/components/SiteFooter';
import { privacyMainHtml } from '@/lib/client/privacy-main';
import { buildShareMetadata } from '@/lib/seo/metadata';

const description =
  'Privacy policy for Publications Hub (PubHub): what we collect, how we use it, and your choices.';

export const metadata: Metadata = buildShareMetadata({
  title: 'Privacy policy',
  description,
  path: '/privacy'
});

export default function PrivacyPage() {
  return (
    <>
      <SiteNav />
      <div className="flex-1 w-full" dangerouslySetInnerHTML={{ __html: privacyMainHtml }} />
      <SiteFooter />
    </>
  );
}
