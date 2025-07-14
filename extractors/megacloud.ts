import axios from 'axios';
import * as crypto from 'crypto';

/**
 * Megacloud extractor helper constants & utils
 */
const MAIN_URL = "https://videostr.net";
// JSON with keys is hosted publicly on GitHub (same file used by Android extractor example)
const KEY_URL = "https://raw.githubusercontent.com/yogesh-hacker/MegacloudKeys/refs/heads/main/keys.json";
const USER_AGENT =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36";

/**
 * Replicates OpenSSL EVP_BytesToKey to derive key + iv from password + salt.
 */
function evpBytesToKey(password: string, salt: Buffer, keyLen = 32, ivLen = 16) {
  let data = Buffer.alloc(0);
  let prev = Buffer.alloc(0);
  while (data.length < keyLen + ivLen) {
    const md5 = crypto.createHash('md5');
    md5.update(Buffer.concat([prev, Buffer.from(password), salt]));
    prev = md5.digest();
    data = Buffer.concat([data, prev]);
  }
  return {
    key: data.slice(0, keyLen),
    iv: data.slice(keyLen, keyLen + ivLen)
  };
}

/**
 * Decrypts an OpenSSL-compatible base64 string encrypted with AES-256-CBC.
 */
function decryptOpenSSL(encryptedB64: string, password: string) {
  const encrypted = Buffer.from(encryptedB64, 'base64');
  if (!encrypted.slice(0, 8).equals(Buffer.from('Salted__'))) {
    throw new Error('Invalid OpenSSL format');
  }
  const salt = encrypted.slice(8, 16);
  const { key, iv } = evpBytesToKey(password, salt);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted.slice(16));
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString('utf8');
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
        tracks: result.tracks
      };
    } catch (err: any) {
      console.error("MegaCloud extraction error:", err.message);
      return { sources: [] };
    }
  }

  async extract2(embedIframeURL: URL): Promise<ExtractedData> {
    try {
      const extractedData: ExtractedData = {
        sources: [],
        tracks: [],
        t: 0,
        server: 0,
      };

      const xrax = embedIframeURL.pathname.split("/").pop() || "";

      try {
        // Fetch the embed page to obtain the required 48-character hash that must be sent as _k
let token: string | undefined;
try {
  const { data: html } = await axios.get<string>(embedIframeURL.href, {
    headers: {
      Referer: embedIframeURL.href,
      'User-Agent': USER_AGENT,
    },
  });
  const match = html.match(/\b[a-zA-Z0-9]{48}\b/);
  token = match ? match[0] : undefined;
} catch (htmlErr) {
  console.warn('Failed to fetch embed page for token:', (htmlErr as any).message);
}

// Use v3 endpoint (current as of 2025-07) and include _k if we found the token
const apiUrl = `${MAIN_URL}/embed-1/v3/e-1/getSources?id=${xrax}${token ? `&_k=${token}` : ''}`;

        const headers = {
          Accept: '*/*',
          'X-Requested-With': 'XMLHttpRequest',
          Referer: MAIN_URL,
          'User-Agent': USER_AGENT
        } as Record<string, string>;

        const { data } = await axios.get<extractedSrc>(apiUrl, { headers });
        if (!data) return extractedData;

        if (typeof data.sources === 'string') {
          try {
            const { data: keyData } = await axios.get(KEY_URL);
            // Prefer the "vidstr" key (matches Videostr extractor); fall back to legacy field names if present
const password: string | undefined = keyData?.vidstr ?? keyData?.rabbit ?? keyData?.rabbitstream?.key;
            if (password) {
              const decrypted = decryptOpenSSL(data.sources, password);
              const parsed = JSON.parse(decrypted) as unencryptedSrc[];
              extractedData.sources = parsed.map(src => ({ file: src.file, type: src.type }));
            }
          } catch (deErr: any) {
            console.error('Failed to decrypt/parse sources:', deErr.message);
          }
        } else if (Array.isArray(data.sources)) {
          extractedData.sources = data.sources.map((s) => ({
            file: s.file,
            type: s.type,
          }));
        }

        extractedData.tracks = data.tracks || [];
        extractedData.t = data.t || 0;
        extractedData.server = data.server || 0;

        return extractedData;
      } catch (innerErr: any) {
        console.error(`Error in getSources: ${innerErr.message}`);
        if (innerErr.message.includes('UTF-8')) {
          console.log('Handling UTF-8 error gracefully');
          return extractedData;
        }
        throw innerErr;
      }
    } catch (err: any) {
      console.error(`MegaCloud extraction error: ${err.message}`);
      return {
        sources: [],
        tracks: [],
        t: 0,
        server: 0
      };
    }
  }
}
