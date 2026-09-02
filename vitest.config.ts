import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Entorno 'node' por defecto: los tests de servicios/repositorios no
    // necesitan DOM y arrancan mas rapido sin el. Los tests de componentes
    // piden jsdom por archivo con un docblock `@vitest-environment jsdom`.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environmentOptions: {
      // Origen realista para los tests de componentes: sin esto jsdom deja
      // location en "about:blank" y cualquier fetch a una ruta relativa
      // revienta con "Invalid URL".
      jsdom: { url: 'http://localhost:3000' },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
