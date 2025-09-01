import axios from 'axios';
import * as crypto from 'crypto';

/**
 * Megacloud extractor helper constants & utils
 */
const MAIN_URL = "https://videostr.net";
const KEY_URL = "https://raw.githubusercontent.com/yogesh-hacker/MegacloudKeys/refs/heads/main/keys.json";
const USER_AGENT =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36";

// --- Local crypto helpers (OpenSSL-compatible) ---
function evpBytesToKey(password: string, salt: Buffer, keyLen = 32, ivLen = 16) {
  let data = Buffer.alloc(0);
  let prev = Buffer.alloc(0);
  while (data.length < keyLen + ivLen) {
    const md5 = crypto.createHash('md5');
    md5.update(Buffer.concat([prev, Buffer.from(password), salt]));
    prev = md5.digest();
    data = Buffer.concat([data, prev]);
  }
  return { key: data.slice(0, keyLen), iv: data.slice(keyLen, keyLen + ivLen) };
}

function decryptOpenSSL(encryptedB64: string, password: string): string {
  const buf = Buffer.from(encryptedB64, 'base64');
  if (!buf.slice(0, 8).equals(Buffer.from('Salted__'))) {
    throw new Error('Invalid OpenSSL format');
  }
  const salt = buf.slice(8, 16);
  const { key, iv } = evpBytesToKey(password, salt);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let out = decipher.update(buf.slice(16));
  out = Buffer.concat([out, decipher.final()]);
  return out.toString('utf8');
}

function decryptLocally(encryptedData: string, nonce: string, secret: string): string {
  // 1) Try OpenSSL salted payload first
  try {
    return decryptOpenSSL(encryptedData, secret);
  } catch {}

  // 2) Fallback: AES-256-CBC with key=sha256(secret) and iv=first 16 bytes of nonce
  try {
    const key = crypto.createHash('sha256').update(String(secret)).digest();
    const iv = Buffer.from(String(nonce)).slice(0, 16);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    const enc = Buffer.from(encryptedData, 'base64');
    let out = decipher.update(enc);
    out = Buffer.concat([out, decipher.final()]);
    return out.toString('utf8');
  } catch {}

  throw new Error('Local decryption failed');
}

/**
 * Extract nonce from HTML response using multiple regex patterns
 */
function extractNonce(html: string): string | null {
  // Try 48-character nonce first
  const match1 = html.match(/\b[a-zA-Z0-9]{48}\b/);
  if (match1) {
    return match1[0];
  }

  // Try three 16-character segments
  const match2 = html.match(/\b([a-zA-Z0-9]{16})\b.*?\b([a-zA-Z0-9]{16})\b.*?\b([a-zA-Z0-9]{16})\b/);
  if (match2) {
    return match2[1] + match2[2] + match2[3];
  }

  return null;
}

export type track = {
  file: string;
  label?: string;
  kind: string;
  default?: boolean;
};

export type unencryptedSrc = {
  file: string;
  type: string;
};

export type extractedSrc = {
  sources: string | unencryptedSrc[];
  tracks: track[];
  t: number;
  server: number;
  encrypted?: boolean;
};

type ExtractedData = Pick<extractedSrc, "tracks" | "t" | "server"> & {
  sources: { file: string; type: string }[];
};

export class MegaCloud {
  static async extract(url: string, referer: string = ''): Promise<{ sources: any[], tracks?: track[] }> {
    try {
      const embedUrl = new URL(url);
      const instance = new MegaCloud();
      const result = await instance.extract2(embedUrl);
      return {
        sources: result.sources,
        tracks: result.tracks,
      };
    } catch (err: any) {
      console.error("MegaCloud extraction error:", err.message);
      return { sources: [] };
    }
  }

  async extract2(embedIframeURL: URL): Promise<ExtractedData> {
    const extractedData: ExtractedData = {
      sources: [],
      tracks: [],
      t: 0,
      server: 0,
    };

    try {
      // 1. Fetch the embed page to get fileId and nonce
      const { data: html } = await axios.get<string>(embedIframeURL.href, {
        headers: {
          'User-Agent': USER_AGENT,
          Referer: embedIframeURL.href,
        },
      });
      
      // Extract fileId from HTML (data-id attribute)
      const fileIdMatch = html.match(/data-id="([^"]+)"/);
      const fileId = fileIdMatch?.[1];
      if (!fileId) {
        throw new Error('Could not find file ID in embed page');
      }

      // Extract nonce from HTML
      const nonce = extractNonce(html);
      if (!nonce) {
        throw new Error('Could not extract nonce from embed page');
      }

      // 2. Get the encrypted sources from the API
      const apiUrl = `${MAIN_URL}/embed-1/v3/e-1/getSources?id=${fileId}&_k=${nonce}`;
      const headers: Record<string, string> = {
        Accept: '*/*',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: embedIframeURL.href,
        'User-Agent': USER_AGENT,
      };

      const { data } = await axios.get<extractedSrc>(apiUrl, { headers });
      if (!data) return extractedData;

      // 3. Check if sources are encrypted and handle accordingly
      const isEncrypted = data.encrypted;
      
      if (isEncrypted && data.sources) {
        try {
          // Get decryption key
          const { data: keyData } = await axios.get(KEY_URL);
          const secret = keyData?.vidstr;
          
          if (!secret) {
            throw new Error('No decryption key found');
          }

          const decryptedText = decryptLocally(data.sources as string, nonce, secret);
          let fileUrl: string | null = null;
          try {
            const obj = JSON.parse(decryptedText);
            fileUrl = obj?.file || obj?.url || null;
          } catch {
            fileUrl = decryptedText;
          }
          if (!fileUrl) throw new Error('Video URL not found in decrypted text');

          extractedData.sources = [{ file: fileUrl, type: 'hls' }];
        } catch (err: any) {
          console.error('MegaCloud decrypt error:', err.message);
        }
      } else if (Array.isArray(data.sources)) {
        // Non-encrypted sources array
        extractedData.sources = data.sources.map(src => ({
          file: src.file,
          type: src.type || 'hls',
        }));
      } else if (typeof data.sources === 'string') {
        // Non-encrypted single source
        extractedData.sources = [{
          file: data.sources,
          type: 'hls'
        }];
      }

      // Process tracks (subtitles/captions)
      extractedData.tracks = (data.tracks || []).filter(
        track => track.kind === 'captions' || track.kind === 'subtitles'
      );
      extractedData.t = data.t || 0;
      extractedData.server = data.server || 0;

      return extractedData;
    } catch (err: any) {
      console.error("Extraction error in extract2:", err.message);
      return extractedData;
    }
  }
}
