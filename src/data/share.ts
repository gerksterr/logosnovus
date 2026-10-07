// Share links: a backup bundle, deflated and base64url-encoded into the URL
// fragment (#share=…). The fragment never reaches any server.

import { isBackup, makeBackup, type Backup, type Bundle } from './merge';

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function encodeShare(records: Bundle): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(makeBackup(records)));
  return toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
}

export async function decodeShare(payload: string): Promise<Backup> {
  const bytes = await pipe(fromBase64Url(payload), new DecompressionStream('deflate-raw'));
  const data = JSON.parse(new TextDecoder().decode(bytes));
  if (!isBackup(data)) throw new Error('Not a Logos Novus share link');
  return data;
}

export function shareUrl(payload: string): string {
  return `${location.origin}${location.pathname}#share=${payload}`;
}
