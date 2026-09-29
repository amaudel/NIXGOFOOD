import fs from 'fs';
import path from 'path';

// Disable TLS verification for dev/script usage behind SSL proxies
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import fetch from 'node-fetch';
import { fal } from '@fal-ai/client';
import sharp from 'sharp';
import { demoProducts } from '../src/data/demoSeed';

// Polyfill global fetch with node-fetch for Node runtime stability
if (!globalThis.fetch || (globalThis as any).__use_node_fetch__) {
  (globalThis as any).fetch = fetch as any;
}

// Load .env.local manually if FAL_KEY is not already in process.env
function loadEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach((line) => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
        if (!process.env[key]) {
          process.env[key] = value.trim();
        }
      }
    });
  }
}

loadEnvLocal();

// 1. Centralized Model & Style Constants
const VERIFIED_DEFAULT_MODEL = 'fal-ai/flux/schnell';
const IMAGE_MODEL = process.env.FAL_IMAGE_MODEL || VERIFIED_DEFAULT_MODEL;

const DEMO_PHOTO_STYLE =
  'premium commercial food photography, gourmet burger restaurant, realistic food, high-end restaurant menu photography, warm cinematic directional lighting, rich natural textures, appetizing, realistic ingredients, subtle shadows, dark neutral stone or rustic contemporary table, restaurant editorial photography, high detail, natural food styling, professional plating.';

const NEGATIVE_PROMPT =
  'no text, no words, no logos, no watermark, no menu typography, no hands, no people, no deformed food, no duplicate ingredients, no artificial plastic texture, no floating ingredients, no cutlery deformities.';

// Output directories
const PRODUCTS_DIR = path.join(process.cwd(), 'public', 'demo', 'products');
const HERO_DIR = path.join(process.cwd(), 'public', 'demo', 'hero');
const MANIFEST_PATH = path.join(process.cwd(), 'src', 'data', 'demoImageManifest.json');

// CLI Arguments
const args = process.argv.slice(2);
const forceRegenerate = args.includes('--force');
const targetProductArg = args.find((a) => a.startsWith('--product='))?.split('=')[1];

// Hero configuration
const HERO_CONFIG = {
  id: 'hero-main',
  slug: 'hero-main',
  name: 'Fotografía Principal Hero Banner',
  aspectRatio: '16:9',
  width: 1920,
  height: 1080,
  outputDir: HERO_DIR,
  outputPath: path.join(HERO_DIR, 'hero-main.webp'),
  publicPath: '/demo/hero/hero-main.webp',
  prompt:
    'Premium gourmet burger restaurant hero photograph. A dramatic smash burger with melted cheese, crispy bacon and golden fries, beautiful contemporary burger restaurant presentation, warm cinematic side lighting, dark sophisticated background, steam and subtle food freshness, high-end commercial food photography, realistic ingredients, generous negative space for website headline.',
};

async function ensureDirectories() {
  if (!fs.existsSync(PRODUCTS_DIR)) fs.mkdirSync(PRODUCTS_DIR, { recursive: true });
  if (!fs.existsSync(HERO_DIR)) fs.mkdirSync(HERO_DIR, { recursive: true });
  const manifestDir = path.dirname(MANIFEST_PATH);
  if (!fs.existsSync(manifestDir)) fs.mkdirSync(manifestDir, { recursive: true });
}

async function createPlaceholderImage() {
  const placeholderPath = path.join(PRODUCTS_DIR, 'placeholder.webp');
  if (!fs.existsSync(placeholderPath) || forceRegenerate) {
    const svg = `
      <svg width="1200" height="900" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#18181b"/>
        <circle cx="600" cy="450" r="180" fill="#27272a"/>
        <text x="50%" y="450" font-family="sans-serif" font-weight="900" font-size="48" fill="#f59e0b" text-anchor="middle" dominant-baseline="middle">🍔 404</text>
        <text x="50%" y="520" font-family="sans-serif" font-weight="700" font-size="24" fill="#a1a1aa" text-anchor="middle" dominant-baseline="middle">Fotografía del Platillo</text>
      </svg>
    `;
    await sharp(Buffer.from(svg))
      .webp({ quality: 85 })
      .toFile(placeholderPath);
    console.log('✓ Placeholder guardado en /public/demo/products/placeholder.webp');
  }
}

async function downloadAndOptimize(imageUrl: string, outputPath: string, width: number, height: number): Promise<number> {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`HTTP error ${res.status} al descargar imagen.`);
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  await sharp(buffer)
    .resize(width, height, { fit: 'cover', position: 'center' })
    .webp({ quality: 85, effort: 6 })
    .toFile(outputPath);

  const stats = fs.statSync(outputPath);
  return stats.size;
}

// Direct REST API call to fal.ai endpoint (handles all environments reliably)
async function generateImageViaFalApi(prompt: string, aspectRatio: string = '4:3', falKey: string): Promise<string> {
  const fullPrompt = `${prompt}. ${DEMO_PHOTO_STYLE} ${NEGATIVE_PROMPT}`;
  const endpoint = `https://fal.run/${IMAGE_MODEL}`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${falKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: fullPrompt,
      image_size: aspectRatio === '16:9' ? 'landscape_16_9' : 'landscape_4_3',
      num_inference_steps: 4,
      enable_safety_checker: true,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API fal.ai respondió ${res.status}: ${errText}`);
  }

  const data: any = await res.json();
  if (data.images && data.images[0] && data.images[0].url) {
    return data.images[0].url;
  }

  throw new Error(`Formato inesperado de respuesta de fal.ai: ${JSON.stringify(data)}`);
}

async function generateImageWithRetry(prompt: string, aspectRatio: string = '4:3', falKey: string, maxRetries = 3): Promise<string> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await generateImageViaFalApi(prompt, aspectRatio, falKey);
    } catch (err: any) {
      console.warn(`   ⚠️ Intento ${attempt}/${maxRetries} falló: ${err.message || err}`);
      if (attempt === maxRetries) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
  throw new Error('Reintentos agotados al conectar con fal.ai');
}

async function main() {
  console.log('====================================================');
  console.log('📸 NIXGO FOOD - Generador de Imágenes Gastronómicas (fal.ai)');
  console.log(`🤖 Modelo Utilizado: ${IMAGE_MODEL}`);
  console.log('====================================================\n');

  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    console.error('❌ ERROR: FAL_KEY no encontrada en las variables de entorno ni en .env.local.');
    process.exit(1);
  }

  await ensureDirectories();
  await createPlaceholderImage();

  let manifest: Record<string, any> = {};
  if (fs.existsSync(MANIFEST_PATH)) {
    try {
      manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
    } catch {
      manifest = {};
    }
  }

  let generatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  // 1. Process Hero Image
  const shouldProcessHero = !targetProductArg || targetProductArg === 'hero-main';
  if (shouldProcessHero) {
    if (fs.existsSync(HERO_CONFIG.outputPath) && !forceRegenerate) {
      console.log(`⏭️ SKIP Hero: ${HERO_CONFIG.publicPath} ya existe.`);
      skippedCount++;
    } else {
      console.log(`🚀 Generando Fotografía Hero...`);
      try {
        const url = await generateImageWithRetry(HERO_CONFIG.prompt, '16:9', falKey);
        const size = await downloadAndOptimize(url, HERO_CONFIG.outputPath, 1920, 1080);
        console.log(`✓ Hero guardado (${(size / 1024).toFixed(1)} KB): ${HERO_CONFIG.publicPath}`);
        manifest['hero-main'] = {
          slug: 'hero-main',
          path: HERO_CONFIG.publicPath,
          model: IMAGE_MODEL,
          sizeKb: Math.round(size / 1024),
          generatedAt: new Date().toISOString(),
        };
        generatedCount++;
      } catch (err: any) {
        console.error(`✗ Error generando Hero: ${err.message || err}`);
        errorCount++;
      }
    }
  }

  // 2. Process Products
  const productsToProcess = targetProductArg
    ? demoProducts.filter((p) => p.slug === targetProductArg)
    : demoProducts;

  const total = productsToProcess.length;

  for (let i = 0; i < total; i++) {
    const p = productsToProcess[i];
    const slug = p.slug || p.id;
    const fileName = `${slug}.webp`;
    const outputPath = path.join(PRODUCTS_DIR, fileName);
    const publicPath = `/demo/products/${fileName}`;

    if (fs.existsSync(outputPath) && !forceRegenerate) {
      console.log(`[${i + 1}/${total}] ⏭️ SKIP ${p.name}: ${publicPath} ya existe.`);
      skippedCount++;
      manifest[slug] = {
        productSlug: slug,
        name: p.name,
        path: publicPath,
        model: IMAGE_MODEL,
        sizeKb: Math.round(fs.statSync(outputPath).size / 1024),
        generatedAt: manifest[slug]?.generatedAt || new Date().toISOString(),
      };
      continue;
    }

    console.log(`[${i + 1}/${total}] 🎨 Generando con IA: ${p.name}...`);
    const prompt = p.imagePrompt || `${p.name}. ${p.description}`;

    try {
      const url = await generateImageWithRetry(prompt, '4:3', falKey);
      const size = await downloadAndOptimize(url, outputPath, 1200, 900);
      console.log(`   ✓ Guardado (${(size / 1024).toFixed(1)} KB): ${publicPath}`);

      manifest[slug] = {
        productSlug: slug,
        name: p.name,
        path: publicPath,
        model: IMAGE_MODEL,
        sizeKb: Math.round(size / 1024),
        generatedAt: new Date().toISOString(),
      };
      generatedCount++;
    } catch (err: any) {
      console.error(`   ✗ Error generando ${p.name}: ${err.message || err}`);
      errorCount++;
    }
  }

  // Save Manifest
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  console.log('\n====================================================');
  console.log(`📊 RESUMEN FINAL DE GENERACIÓN`);
  console.log(`  ✓ Generadas con fal.ai: ${generatedCount}`);
  console.log(`  ⏭️ Existentes omitidas: ${skippedCount}`);
  console.log(`  ✗ Errores:               ${errorCount}`);
  console.log(`📁 Manifest actualizado: ${MANIFEST_PATH}`);
  console.log('====================================================\n');

  if (errorCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error in generate-demo-images script:', err);
  process.exit(1);
});
