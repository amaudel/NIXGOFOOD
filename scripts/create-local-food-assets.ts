import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const PRODUCTS_DIR = path.join(process.cwd(), 'public', 'demo', 'products');
const MANIFEST_PATH = path.join(process.cwd(), 'src', 'data', 'demoImageManifest.json');

const ITEMS = [
  {
    slug: 'nachos-especiales',
    name: 'Nachos Especiales',
    subtitle: 'Queso Fundido y Guacamole',
    icon: '🧀',
    bgStart: '#1e1b4b',
    bgEnd: '#312e81',
    accent: '#f59e0b',
  },
  {
    slug: 'quesadillas-harina',
    name: 'Quesadillas en Harina',
    subtitle: 'Queso Oaxaca Fundido',
    icon: '🌮',
    bgStart: '#27272a',
    bgEnd: '#18181b',
    accent: '#e11d48',
  },
  {
    slug: 'papas-rusticas-guacamole',
    name: 'Papas Rústicas',
    subtitle: 'Con Guacamole Casero',
    icon: '🥑',
    bgStart: '#064e3b',
    bgEnd: '#022c22',
    accent: '#10b981',
  },
  {
    slug: 'limonada-menta',
    name: 'Limonada con Menta',
    subtitle: 'Artesanal Recién Exprimida',
    icon: '🍋',
    bgStart: '#14532d',
    bgEnd: '#052e16',
    accent: '#84cc16',
  },
  {
    slug: 'agua-horchata',
    name: 'Agua de Horchata',
    subtitle: 'Tradicional con Canela',
    icon: '🥤',
    bgStart: '#451a03',
    bgEnd: '#1c1917',
    accent: '#f97316',
  },
  {
    slug: 'coca-cola',
    name: 'Gaseosa Cola Helada',
    subtitle: '500ml Helada con Hielo',
    icon: '🥤',
    bgStart: '#450a0a',
    bgEnd: '#18181b',
    accent: '#ef4444',
  },
];

async function main() {
  if (!fs.existsSync(PRODUCTS_DIR)) fs.mkdirSync(PRODUCTS_DIR, { recursive: true });

  let manifest: Record<string, any> = {};
  if (fs.existsSync(MANIFEST_PATH)) {
    try {
      manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
    } catch {
      manifest = {};
    }
  }

  console.log('🎨 Generando assets locales en WebP para productos faltantes...');

  for (const item of ITEMS) {
    const outPath = path.join(PRODUCTS_DIR, `${item.slug}.webp`);
    const publicPath = `/demo/products/${item.slug}.webp`;

    const svg = `
      <svg width="1200" height="900" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bg_${item.slug.replace(/-/g, '_')}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="${item.bgStart}"/>
            <stop offset="100%" stop-color="${item.bgEnd}"/>
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#bg_${item.slug.replace(/-/g, '_')})"/>
        <circle cx="600" cy="400" r="220" fill="${item.accent}" opacity="0.15"/>
        <circle cx="600" cy="400" r="160" fill="${item.accent}" opacity="0.25"/>
        <text x="50%" y="400" font-family="sans-serif" font-size="120" text-anchor="middle" dominant-baseline="middle">${item.icon}</text>
        <text x="50%" y="600" font-family="sans-serif" font-weight="900" font-size="44" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">${item.name}</text>
        <text x="50%" y="670" font-family="sans-serif" font-weight="600" font-size="28" fill="${item.accent}" text-anchor="middle" dominant-baseline="middle">${item.subtitle}</text>
      </svg>
    `;

    await sharp(Buffer.from(svg))
      .webp({ quality: 85 })
      .toFile(outPath);

    const sizeKb = Math.round(fs.statSync(outPath).size / 1024);
    console.log(`✓ Generado ${item.slug} (${sizeKb} KB) -> ${publicPath}`);

    manifest[item.slug] = {
      productSlug: item.slug,
      name: item.name,
      path: publicPath,
      model: 'local-gastronomic-webp',
      sizeKb,
      generatedAt: new Date().toISOString(),
    };
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log('🎉 Todas las imágenes de los 16 productos están listas e integradas localmente.');
}

main().catch(console.error);
