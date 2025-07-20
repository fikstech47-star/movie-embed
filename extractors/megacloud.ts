import axios from 'axios';
import * as crypto from 'crypto';

/**
 * Megacloud extractor helper constants & utils
 */
const MAIN_URL = "https://videostr.net";
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
    iv: data.slice(keyLen, keyLen + ivLen),
  };
}

/**
 * Decrypts an OpenSSL-compatible base64 string encrypted with AES-256-CBC.
 */
function decryptOpenSSL(encryptedB64: string, password: string): string {
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
      const id = embedIframeURL.pathname.split("/").pop() || "";
      let token: string | undefined;

      // Fetch token from embed page
      try {
        const { data: html } = await axios.get<string>(embedIframeURL.href, {
          headers: {
            Referer: embedIframeURL.href,
            'User-Agent': USER_AGENT,
          },
        });
        const match = html.match(/\b[a-zA-Z0-9]{48}\b/);
        token = match?.[0];
      } catch (err) {
        console.warn("Failed to fetch token from embed page:", (err as any).message);
      }

      const apiUrl = `${MAIN_URL}/embed-1/v3/e-1/getSources?id=${id}${token ? `&_k=${token}` : ''}`;

      const headers: Record<string, string> = {
        Accept: '*/*',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: MAIN_URL,
        'User-Agent': USER_AGENT,
      };

      const { data } = await axios.get<extractedSrc>(apiUrl, { headers });
      if (!data) return extractedData;

      if (typeof data.sources === 'string') {
        try {
          const { data: keyData } = await axios.get(KEY_URL);
          const password: string | undefined =
            keyData?.vidstr ?? keyData?.rabbit ?? keyData?.rabbitstream?.key;

          if (password) {
            const decrypted = decryptOpenSSL(data.sources, password);
            const parsed = JSON.parse(decrypted) as unencryptedSrc[];
            extractedData.sources = parsed.map(src => ({
              file: src.file,
              type: src.type,
            }));
          }
        } catch (err: any) {
          console.error("Failed to decrypt or parse video sources:", err.message);
        }
      } else if (Array.isArray(data.sources)) {
        extractedData.sources = data.sources.map(src => ({
          file: src.file,
          type: src.type,
        }));
      }

      extractedData.tracks = data.tracks || [];
      extractedData.t = data.t || 0;
      extractedData.server = data.server || 0;

      return extractedData;
    } catch (err: any) {
      console.error("Extraction error in extract2:", err.message);
      return extractedData;
    }
  }
}
