import { Bricolage_Grotesque, Source_Serif_4, IBM_Plex_Mono } from 'next/font/google';

// Tipografia de la landing de marketing (src/app/page.tsx). Variable fonts
// (Bricolage, Source Serif) no necesitan `weight`. Se aplican via `variable`
// a un div especifico, no a <html>/<body>, para no afectar /admin ni /store
// (ver comentario en page.tsx).
export const bricolageGrotesque = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

export const sourceSerif4 = Source_Serif_4({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-body',
  display: 'swap',
});

export const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});
