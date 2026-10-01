import type { Metadata } from 'next';
import { Cairo } from 'next/font/google';
import './globals.css';
import { ThemeProvider, themeScript } from '@/components/theme-provider';

const cairo = Cairo({
  variable: '--font-cairo',
  subsets: ['arabic', 'latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900'],
});

export const metadata: Metadata = {
  title: 'منصة القمم للدراسة عن بُعد',
  description: 'منصة تعليمية متكاملة للدروس الداعمة عن بُعد',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    /*
     * `suppressHydrationWarning` is required, not cosmetic. React owns the
     * `className` on <html>, and the no-flash script below deliberately adds
     * `dark` to it before hydration. React then compares its own JSX (no `dark`)
     * with the DOM it finds (`dark`) and logs "A tree hydrated but some
     * attributes of the server rendered HTML didn't match".
     *
     * There is no way to have both: setting the class before paint is the whole
     * point (an effect runs after the browser has already painted light), and
     * React's JSX cannot know the visitor's stored choice. Mutating a different
     * element does not work either — `color-scheme` and the body background both
     * have to respond to the mode, so the class has to live on <html>.
     *
     * This is the documented escape hatch for exactly this case, and what
     * next-themes does. The mismatch is real but harmless: the class is already
     * in the state we want, and React is told not to touch it.
     */
    <html
      lang="ar"
      dir="rtl"
      suppressHydrationWarning
      className={`${cairo.variable} h-full antialiased`}
    >
      <head>
        {/* Applies the saved theme before paint. Without it every reload flashes white. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-gray-50 dark:bg-slate-900/60 dark:bg-slate-950">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
