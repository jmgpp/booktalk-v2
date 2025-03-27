'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LibraryPage() {
  const router = useRouter();
  
  useEffect(() => {
    router.push('/');
  }, [router]);
  
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        <p>Redirecting to homepage...</p>
      </div>
    </div>
  );
}
