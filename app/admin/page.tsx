import type { Metadata } from 'next';
import { AdminApp } from '@/components/AdminApp';

export const metadata: Metadata = {
  title: 'Platform Admin',
  robots: { index: false, follow: false }
};

export default function AdminPage() {
  return <AdminApp />;
}
