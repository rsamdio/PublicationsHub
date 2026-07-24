import type { Metadata } from 'next';
import { StudioApp } from '@/components/StudioApp';

export const metadata: Metadata = {
  title: 'Publisher Studio',
  robots: { index: false, follow: false }
};

export default function StudioPage() {
  return <StudioApp />;
}
