import localFont from 'next/font/local';

export const geistSans = localFont({
  src: [
    {
      path: './Geist-Regular.woff2',
      weight: '400',
    },
    {
      path: './Geist-Medium.woff2',
      weight: '500',
    },
    {
      path: './Geist-SemiBold.woff2',
      weight: '600',
    },
    {
      path: './Geist-Bold.woff2',
      weight: '700',
    },
  ],
  display: 'swap',
  preload: true,
  variable: '--font-geist-sans',
});

export const geistMono = localFont({
  src: [
    {
      path: './GeistMono-Regular.woff2',
      weight: '400',
    },
    {
      path: './GeistMono-Medium.woff2',
      weight: '500',
    },
    {
      path: './GeistMono-SemiBold.woff2',
      weight: '600',
    },
    {
      path: './GeistMono-Bold.woff2',
      weight: '700',
    },
  ],
  display: 'swap',
  preload: true,
  variable: '--font-geist-mono',
});
