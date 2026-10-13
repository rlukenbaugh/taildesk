import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
await mkdir('build', { recursive: true });
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" rx="62" fill="#176c5c"/><path d="M67 84h122M128 84v89M67 173h122" stroke="#9cd7bb" stroke-width="17" stroke-linecap="round"/><circle cx="67" cy="84" r="22" fill="#fff"/><circle cx="189" cy="84" r="22" fill="#fff"/><circle cx="67" cy="173" r="22" fill="#fff"/><circle cx="189" cy="173" r="22" fill="#fff"/></svg>`;
await sharp(Buffer.from(svg)).png().toFile('build/icon.png');
await writeFile('build/icon.ico', await pngToIco('build/icon.png'));
console.log('Built original Taildesk icons. Renderer and main process are native JavaScript; no transpilation required.');
