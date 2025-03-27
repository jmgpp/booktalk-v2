import * as React from 'react';
import Providers from '@/components/Providers';

import '../styles/globals.css';
import '../styles/fonts.css';

const title = 'BookTalk — Social Reading Experience';
const description =
  'BookTalk is a social application for book readers, focused on providing a great ' +
  'e-book reading experience with social features for chatting, reviewing, and sharing with friends.';

export const metadata = {
  title,
  description,
  generator: 'Next.js',
  manifest: '/manifest.json',
  keywords: ['epub', 'ebook', 'reader', 'booktalk', 'social', 'reading'],
  authors: [
    {
      name: 'booktalk',
      url: 'https://github.com/jmgpp/booktalk-v2',
    },
  ],
  icons: [
    { rel: 'apple-touch-icon', url: '/apple-touch-icon.png' },
    { rel: 'icon', url: '/icon.png' },
  ],
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: 'white',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <head>
        <title>{title}</title>
        <meta
          name='viewport'
          content='minimum-scale=1, initial-scale=1, width=device-width, shrink-to-fit=no, user-scalable=no, viewport-fit=cover'
        />
        <meta name='mobile-web-app-capable' content='yes' />
        <meta name='apple-mobile-web-app-capable' content='yes' />
        <meta name='apple-mobile-web-app-status-bar-style' content='default' />
        <meta name='apple-mobile-web-app-title' content='BookTalk' />
        <link rel='apple-touch-icon' sizes='180x180' href='/apple-touch-icon.png' />
        <link rel='icon' href='/favicon.ico' />
        <link rel='manifest' href='/manifest.json' />
        <meta name='description' content={description} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
