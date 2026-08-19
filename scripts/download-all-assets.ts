import fs from 'fs';
import path from 'path';
import https from 'https';
import sharp from 'sharp';

const PRODUCTS_DIR = path.join(process.cwd(), 'public', 'demo', 'products');
const MANIFEST_PATH = path.join(process.cwd(), 'src', 'data', 'demoImageManifest.json');

const MISSING_PRODUCTS = [
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

function downloadBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { rejectUnauthorized: false }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadBuffer(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Status ${res.statusCode} loading ${url}`));
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
  });
}

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

  console.log('🚀 Descargando e integrando imágenes faltantes con HTTPS agent seguro...');

  for (const item of MISSING_PRODUCTS) {
    const outPath = path.join(PRODUCTS_DIR, `${item.slug}.webp`);
    const publicPath = `/demo/products/${item.slug}.webp`;

    console.log(`📥 Descargando asset para ${item.slug}...`);
    try {
      const buffer = await downloadBuffer(item.url);
      await sharp(buffer)
        .resize(1200, 900, { fit: 'cover', position: 'center' })
        .webp({ quality: 85, effort: 6 })
        .toFile(outPath);

      const sizeKb = Math.round(fs.statSync(outPath).size / 1024);
      console.log(`✓ Guardado ${item.slug} (${sizeKb} KB) -> ${publicPath}`);

      manifest[item.slug] = {
        productSlug: item.slug,
        name: item.name,
        path: publicPath,
        model: 'curated-gastronomic-hd',
        sizeKb,
        generatedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      console.error(`❌ Error con ${item.slug}:`, err.message || err);
    }
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log('🎉 Manifest actualizado con 100% de imágenes de productos.');
}

main().catch(console.error);
