import sharp from 'sharp';

export const MAX_SIGNATURE_BYTES = 300 * 1024;
export type SignaturePoint = { x: number; y: number; time: number; pressure: number };
export type SignatureStroke = SignaturePoint[];

function decodedBase64(value: string) {
  const match = value.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('La firma debe ser una imagen PNG válida');
  const body = Buffer.from(match[1], 'base64');
  if (!body.length || body.byteLength > MAX_SIGNATURE_BYTES) throw new Error('La firma debe pesar como máximo 300 KB');
  return body;
}

function strokeEvidence(strokes: unknown) {
  if (strokes == null) return null;
  if (!Array.isArray(strokes) || strokes.length > 80) throw new Error('Los trazos de la firma no son válidos');
  let points = 0; let length = 0;
  for (const rawStroke of strokes) {
    if (!Array.isArray(rawStroke) || rawStroke.length > 4000) throw new Error('Los trazos de la firma no son válidos');
    let previous: SignaturePoint | null = null;
    for (const rawPoint of rawStroke) {
      const point = rawPoint as SignaturePoint;
      if (![point?.x, point?.y, point?.time, point?.pressure].every(Number.isFinite)) throw new Error('Los trazos de la firma no son válidos');
      if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1 || point.pressure < 0 || point.pressure > 1) throw new Error('Los trazos de la firma no son válidos');
      if (previous) length += Math.hypot(point.x - previous.x, point.y - previous.y);
      previous = point; points += 1;
    }
  }
  if (points < 5 || length < 0.08) throw new Error('La firma está vacía o es solo un punto');
  return strokes as SignatureStroke[];
}

export async function validateSignaturePng(imageData: string, strokes?: unknown, requireStrokes = false) {
  const body = decodedBase64(imageData);
  const metadata = await sharp(body).metadata().catch(() => null);
  if (!metadata || metadata.format !== 'png' || !metadata.width || !metadata.height) throw new Error('La firma debe ser una imagen PNG válida');
  if (metadata.width < 80 || metadata.height < 40 || metadata.width > 2400 || metadata.height > 1600) throw new Error('Las dimensiones de la firma no son válidas');
  const validatedStrokes = strokeEvidence(strokes);
  if (requireStrokes && !validatedStrokes) throw new Error('Dibuja la firma antes de continuar');
  const { data, info } = await sharp(body).ensureAlpha().resize({ width: Math.min(metadata.width, 720), withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true });
  let ink = 0; let minX = info.width; let minY = info.height; let maxX = -1; let maxY = -1;
  for (let y = 0; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) {
    const offset = (y * info.width + x) * 4; const alpha = data[offset + 3]; const light = (data[offset] + data[offset + 1] + data[offset + 2]) / 3;
    if (alpha > 24 && light < 238) { ink += 1; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  }
  if (ink < 80 || maxX - minX < 18 || maxY - minY < 3) throw new Error('La firma está vacía o es solo un punto');
  return { body, strokes: validatedStrokes, width: metadata.width, height: metadata.height };
}
