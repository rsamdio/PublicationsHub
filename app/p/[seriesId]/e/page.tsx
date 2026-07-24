import { permanentRedirect } from 'next/navigation';
import { publicationPath } from '@/lib/urls';

type Props = { params: Promise<{ seriesId: string }> };

/** Missing edition segment → publication shell. */
export default async function MissingEditionPage({ params }: Props) {
  const { seriesId: raw } = await params;
  permanentRedirect(publicationPath(decodeURIComponent(raw)));
}
