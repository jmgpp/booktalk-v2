'use client';

import { useEffect } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import Reader from './components/Reader';

export default function Page() {
  const { settings } = useSettingsStore();

  useEffect(() => {
    // We could add any initialization here if needed in the future
  }, []);

  return <Reader />;
}
