import axios from 'axios';
import * as crypto from 'crypto';

/**
 * Megacloud extractor helper constants & utils
 */
const MAIN_URL = "https://videostr.net";
const KEY_URL = "https://raw.githubusercontent.com/yogesh-hacker/MegacloudKeys/refs/heads/main/keys.json";
const DECODE_URL = "https://script.google.com/macros/s/AKfycbx-yHTwupis_JD0lNzoOnxYcEYeXmJZrg7JeMxYnEZnLBy5V0--UxEvP-y9txHyy1TX9Q/exec";
const USER_AGENT =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36";

/**
 * Decrypts video sources using Google Apps Script service
 */
async function decryptWithGoogleScript(
  encryptedData: string,
  nonce: string,
  secret: string
): Promise<string> {
  try {
    const params = new URLSearchParams({
      encrypted_data: encryptedData,
      nonce: nonce,
      secret: secret,
    });

    const { data } = await axios.get(`${DECODE_URL}?${params.toString()}`);
    
    // Extract file URL from response
    const fileMatch = data.match(/"file":"(.*?)"/)?.[1];
    if (!fileMatch) {
      throw new Error('Video URL not found in decrypted response');
    }
    
    return fileMatch;
  } catch (error: any) {
    console.error('Google Apps Script decryption failed:', error.message);
    throw error;
  }
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
      const id = embedIframeURL.pathname.split("/").pop()?.split("?")[0] || "";
      let nonce: string | null = null;

      // Fetch nonce from embed page
      try {
        const { data: html } = await axios.get<string>(embedIframeURL.href, {
          headers: {
            Accept: '*/*',
            'X-Requested-With': 'XMLHttpRequest',
            Referer: MAIN_URL,
            'User-Agent': USER_AGENT,
          },
        });
        
        nonce = extractNonce(html);

      } catch (err) {
        console.warn("Failed to fetch nonce from embed page:", (err as any).message);
      }

      if (!nonce) {
        console.error('No nonce found, cannot proceed');
        return extractedData;
      }

      const apiUrl = `${MAIN_URL}/embed-1/v3/e-1/getSources?id=${id}&_k=${nonce}`;

      const headers: Record<string, string> = {
        Accept: '*/*',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: MAIN_URL,
        'User-Agent': USER_AGENT,
      };

      const { data } = await axios.get<extractedSrc>(apiUrl, { headers });
      if (!data) return extractedData;

      // Handle encrypted sources
      if (typeof data.sources === 'string') {
        try {
          // Check if it's already an M3U8 URL
          if (data.sources.includes('.m3u8')) {
            extractedData.sources = [{
              file: data.sources,
              type: 'hls'
            }];
          } else {
            // Decrypt using Google Apps Script
            const { data: keyData } = await axios.get(KEY_URL);
            const secret = keyData?.vidstr;
            
            if (!secret) {
              throw new Error('No decryption key found');
            }

            const decryptedUrl = await decryptWithGoogleScript(
              data.sources,
              nonce,
              secret
            );

            extractedData.sources = [{
              file: decryptedUrl,
              type: 'hls'
            }];
          }
        } catch (err: any) {
          console.error("Failed to decrypt video sources:", err.message);
        }
      } else if (Array.isArray(data.sources)) {
        // Handle unencrypted sources
        extractedData.sources = data.sources.map(src => ({
          file: src.file,
          type: src.type || 'hls',
        }));
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
