import sharp from 'sharp';

let cached;
export async function signaturePayload() {
  if (!cached) {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="420" height="150"><path d="M25 105 C70 25 95 135 145 70 S220 120 275 55 S330 115 395 45" fill="none" stroke="#35262f" stroke-width="8" stroke-linecap="round"/></svg>');
    const png = await sharp({ create: { width: 420, height: 150, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: svg }]).png().toBuffer();
    cached = { signaturePng: `data:image/png;base64,${png.toString('base64')}`, signatureStrokes: [[
      { x: .06, y: .7, time: 1, pressure: .5 }, { x: .2, y: .25, time: 2, pressure: .6 }, { x: .35, y: .55, time: 3, pressure: .55 },
      { x: .5, y: .35, time: 4, pressure: .7 }, { x: .68, y: .6, time: 5, pressure: .5 }, { x: .9, y: .3, time: 6, pressure: .65 }
    ]] };
  }
  return structuredClone(cached);
}
