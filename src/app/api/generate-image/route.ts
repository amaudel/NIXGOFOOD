import { NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt, image_size = 'square_hd' } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Debes proporcionar un prompt descriptivo para generar la imagen.' },
        { status: 400 }
      );
    }

    const falKey = process.env.FAL_KEY;
    if (!falKey) {
      return NextResponse.json(
        { error: 'La API Key de fal.ai (FAL_KEY) no está configurada en las variables de entorno.' },
        { status: 500 }
      );
    }

    // Configure fal client with server key
    fal.config({
      credentials: falKey,
    });

    // Run fal-ai/flux/schnell model for fast ultra-realistic food/product photography
    const result: any = await fal.subscribe('fal-ai/flux/schnell', {
      input: {
        prompt: `Professional high-end food photography, appetizing food styling, studio lighting, highly detailed restaurant dish: ${prompt}`,
        image_size: image_size,
        num_inference_steps: 4,
        enable_safety_checker: true,
      },
      logs: false,
    });

    if (result && result.images && result.images.length > 0) {
      const generatedImageUrl = result.images[0].url;
      return NextResponse.json({
        url: generatedImageUrl,
        prompt: prompt,
      });
    }

    return NextResponse.json(
      { error: 'No se pudo generar la imagen desde fal.ai.' },
      { status: 500 }
    );
  } catch (err: any) {
    console.error('Error generating image via fal.ai:', err);
    return NextResponse.json(
      { error: err.message || 'Error interno al comunicarse con fal.ai.' },
      { status: 500 }
    );
  }
}
