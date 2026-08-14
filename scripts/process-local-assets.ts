import fs from 'fs';
import path from 'path';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import sharp from 'sharp';

const PRODUCTS_DIR = path.join(process.cwd(), 'public', 'demo', 'products');
const HERO_DIR = path.join(process.cwd(), 'public', 'demo', 'hero');
const MANIFEST_PATH = path.join(process.cwd(), 'src', 'data', 'demoImageManifest.json');
const BRAIN_DIR = 'C:\\Users\\andres.delgado\\.gemini\\antigravity\\brain\\c4f7559b-2cf6-4b29-b4c2-5b99fec05bed';

async function ensureDirs() {
  if (!fs.existsSync(PRODUCTS_DIR)) fs.mkdirSync(PRODUCTS_DIR, { recursive: true });
  if (!fs.existsSync(HERO_DIR)) fs.mkdirSync(HERO_DIR, { recursive: true });
}

const IMAGE_MAPPINGS: Array<{ slug: string; srcJpg: string; width: number; height: number; outPath: string; publicPath: string }> = [
  {
    slug: 'hero-main',
    srcJpg: path.join(BRAIN_DIR, 'hero_main_1786726399131.jpg'),
    width: 1920,
    height: 1080,
    outPath: path.join(HERO_DIR, 'hero-main.webp'),
    publicPath: '/demo/hero/hero-main.webp',
  },
  {
    slug: 'taco-birria',
    srcJpg: path.join(BRAIN_DIR, 'taco_birria_1786726416694.jpg'),
    width: 1200,
    height: 900,
    outPath: path.join(PRODUCTS_DIR, 'taco-birria.webp'),
    publicPath: '/demo/products/taco-birria.webp',
  },
  {
    slug: 'taco-pastor',
    srcJpg: path.join(BRAIN_DIR, 'taco_pastor_1786726430443.jpg'),
    width: 1200,
    height: 900,
    outPath: path.join(PRODUCTS_DIR, 'taco-pastor.webp'),
    publicPath: '/demo/products/taco-pastor.webp',
  },
  {
    slug: 'taco-cochinita',
    srcJpg: path.join(BRAIN_DIR, 'taco_cochinita_1786726450167.jpg'),
    width: 1200,
    height: 900,
    outPath: path.join(PRODUCTS_DIR, 'taco-cochinita.webp'),
    publicPath: '/demo/products/taco-cochinita.webp',
  },
  {
    slug: 'taco-suadero',
    srcJpg: path.join(BRAIN_DIR, 'taco_suadero_1786726462686.jpg'),
    width: 1200,
    height: 900,
    outPath: path.join(PRODUCTS_DIR, 'taco-suadero.webp'),
    publicPath: '/demo/products/taco-suadero.webp',
  },
  {
    slug: 'hamburguesa-tacanijo',
    srcJpg: path.join(BRAIN_DIR, 'hamburguesa_tacanijo_1786726478057.jpg'),
    width: 1200,
    height: 900,
    outPath: path.join(PRODUCTS_DIR, 'hamburguesa-tacanijo.webp'),
    publicPath: '/demo/products/hamburguesa-tacanijo.webp',
  },
  {
    slug: 'burger-crispy',
    srcJpg: path.join(BRAIN_DIR, 'burger_crispy_1786726493486.jpg'),
    width: 1200,
    height: 900,
    outPath: path.join(PRODUCTS_DIR, 'burger-crispy.webp'),
    publicPath: '/demo/products/burger-crispy.webp',
  },
  {
    slug: 'smash-burger-mexicana',
    srcJpg: path.join(BRAIN_DIR, 'smash_burger_mexicana_1786726671632.jpg'),
    width: 1200,
    height: 900,
    outPath: path.join(PRODUCTS_DIR, 'smash-burger-mexicana.webp'),
    publicPath: '/demo/products/smash-burger-mexicana.webp',
  },
  {
    slug: 'combo-taca-fiesta',
    srcJpg: path.join(BRAIN_DIR, 'combo_taca_fiesta_1786726689581.jpg'),
    width: 1200,
    height: 900,
    outPath: path.join(PRODUCTS_DIR, 'combo-taca-fiesta.webp'),
    publicPath: '/demo/products/combo-taca-fiesta.webp',
  },
  {
    slug: 'combo-duo-burgers',
    srcJpg: path.join(BRAIN_DIR, 'combo_duo_burgers_1786726702479.jpg'),
    width: 1200,
    height: 900,
    outPath: path.join(PRODUCTS_DIR, 'combo-duo-burgers.webp'),
    publicPath: '/demo/products/combo-duo-burgers.webp',
  },
  {
    slug: 'pack-10-tacos',
    srcJpg: path.join(BRAIN_DIR, 'pack_10_tacos_1786726719275.jpg'),
    width: 1200,
    height: 900,
    outPath: path.join(PRODUCTS_DIR, 'pack-10-tacos.webp'),
    publicPath: '/demo/products/pack-10-tacos.webp',
  },
];

// Curated high quality food photography fallback URLs for remaining products
const REMAINING_ITEMS: Array<{ slug: string; name: string; url: string }> = [
  {
    slug: 'nachos-especiales',
    name: 'Nachos Especiales El Taca',
    url: 'https://images.unsplash.com/photo-1513456852971-30c0b8199d4d?auto=format&fit=crop&w=1200&q=80',
  },
  {
    slug: 'quesadillas-harina',
    name: 'Quesadillas en Harina (3 ud)',
    url: 'https://images.unsplash.com/photo-1618040996337-56904b7850b9?auto=format&fit=crop&w=1200&q=80',
  },
  {
    slug: 'papas-rusticas-guacamole',
    name: 'Papas Rústicas con Guacamole',
    url: 'https://images.unsplash.com/photo-1576107232684-1279f390859f?auto=format&fit=crop&w=1200&q=80',
  },
  {
    slug: 'limonada-menta',
    name: 'Limonada Casera con Menta',
    url: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=1200&q=80',
  },
  {
    slug: 'agua-horchata',
    name: 'Agua de Horchata Mexicana',
    url: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=1200&q=80',
  },
  {
    slug: 'coca-cola',
    name: 'Gaseosa Cola Helada (500ml)',
    url: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&w=1200&q=80',
  },
];

async function main() {
  await ensureDirs();
  const manifest: Record<string, any> = {};

  console.log('🖼️ Procesando imágenes generadas localmente...');

  for (const item of IMAGE_MAPPINGS) {
    if (fs.existsSync(item.srcJpg)) {
      await sharp(item.srcJpg)
        .resize(item.width, item.height, { fit: 'cover', position: 'center' })
        .webp({ quality: 85, effort: 6 })
        .toFile(item.outPath);

      const sizeKb = Math.round(fs.statSync(item.outPath).size / 1024);
      console.log(`✓ Procesado ${item.slug} (${sizeKb} KB) -> ${item.publicPath}`);

      manifest[item.slug] = {
        productSlug: item.slug,
        path: item.publicPath,
        model: 'ai-gastronomic-flux',
        sizeKb,
        generatedAt: new Date().toISOString(),
      };
    }
  }

  for (const item of REMAINING_ITEMS) {
    const outPath = path.join(PRODUCTS_DIR, `${item.slug}.webp`);
    const publicPath = `/demo/products/${item.slug}.webp`;

    console.log(`🌐 Descargando y optimizando asset para ${item.slug}...`);
    try {
      const res = await fetch(item.url);
      if (res.ok) {
        const buffer = Buffer.from(await res.arrayBuffer());
        await sharp(buffer)
          .resize(1200, 900, { fit: 'cover', position: 'center' })
          .webp({ quality: 85, effort: 6 })
          .toFile(outPath);

        const sizeKb = Math.round(fs.statSync(outPath).size / 1024);
        console.log(`✓ Procesado ${item.slug} (${sizeKb} KB) -> ${publicPath}`);

        manifest[item.slug] = {
          productSlug: item.slug,
          name: item.name,
          path: publicPath,
          model: 'curated-gastronomic-hd',
          sizeKb,
          generatedAt: new Date().toISOString(),
        };
      }
    } catch (e) {
      console.error(`Error procesando ${item.slug}:`, e);
    }
  }

  // Placeholder
  const placeholderPath = path.join(PRODUCTS_DIR, 'placeholder.webp');
  if (!fs.existsSync(placeholderPath)) {
    const svg = `
      <svg width="1200" height="900" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#18181b"/>
        <circle cx="600" cy="450" r="180" fill="#27272a"/>
        <text x="50%" y="450" font-family="sans-serif" font-weight="900" font-size="48" fill="#f59e0b" text-anchor="middle" dominant-baseline="middle">🌮 EL TACA NIJO</text>
        <text x="50%" y="520" font-family="sans-serif" font-weight="700" font-size="24" fill="#a1a1aa" text-anchor="middle" dominant-baseline="middle">Fotografía del Platillo</text>
      </svg>
    `;
    await sharp(Buffer.from(svg)).webp({ quality: 85 }).toFile(placeholderPath);
    console.log('✓ Placeholder guardado');
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`🎉 Proceso completado. Manifest escrito en ${MANIFEST_PATH}`);
}

main().catch(console.error);
