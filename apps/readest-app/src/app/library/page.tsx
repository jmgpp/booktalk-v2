'use client';

import dynamic from 'next/dynamic';
import Spinner from '@/components/Spinner';

// Dynamically import the actual library page with no SSR
const LibraryPageContent = dynamic(() => import('./components/LibraryContent'), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-full items-center justify-center">
      <Spinner />
    </div>
  ),
});

export default function LibraryPage() {
  return <LibraryPageContent />;
}
