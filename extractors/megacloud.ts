import axios from "axios";

const MAIN_URL = "https://videostr.net";
const USER_AGENT =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36";

function extractNonce(html: string): string | null {
  const match1 = html.match(/\b[a-zA-Z0-9]{48}\b/);
  if (match1) return match1[0];
  const match2 = html.match(
    /\b([a-zA-Z0-9]{16})\b.*?\b([a-zA-Z0-9]{16})\b.*?\b([a-zA-Z0-9]{16})\b/
  );
  if (match2) return match2[1] + match2[2] + match2[3];

  return null;
}

export type track = {
  file: string;
  label?: string;
  kind: string;
  default?: boolean;
};

export type extractedSrc = {
  sources: { file: string; type?: string }[] | string;
  tracks: track[];
  t: number;
  server: number;
  encrypted?: boolean;
};

export class MegaCloud {
  static async extract(
    url: string
  ): Promise<{ sources: any[]; tracks?: track[] }> {
    const embedUrl = new URL(url);
    const instance = new MegaCloud();
    const result = await instance.extract2(embedUrl);
    return {
      sources: result.sources,
      tracks: result.tracks,
    };
  }

  async extract2(embedIframeURL: URL) {
    const { data: html } = await axios.get<string>(embedIframeURL.href, {
      headers: {
        "User-Agent": USER_AGENT,
        Referer: embedIframeURL.href,
      },
    });

    // Extract fileId
    const fileIdMatch = html.match(/data-id="([^"]+)"/);
    const fileId = fileIdMatch?.[1];
    if (!fileId) throw new Error("Could not find file ID in embed page");

    // Extract nonce
    const nonce = extractNonce(html);
    if (!nonce) throw new Error("Could not extract nonce from embed page");

    // Call getSources endpoint
    const apiUrl = `${MAIN_URL}/embed-1/v3/e-1/getSources?id=${fileId}&_k=${nonce}`;
    const { data } = await axios.get<extractedSrc>(apiUrl, {
      headers: {
        Accept: "*/*",
        "X-Requested-With": "XMLHttpRequest",
        Referer: embedIframeURL.href,
        "User-Agent": USER_AGENT,
      },
    });

    let sources: any[] = [];
    if (Array.isArray(data.sources)) {
      sources = data.sources.map((src) => ({
        file: src.file,
        type: src.type || "hls",
      }));
    } else if (typeof data.sources === "string") {
      sources = [{ file: data.sources, type: "hls" }];
    }

    const tracks = (data.tracks || []).filter(
      (track) => track.kind === "captions" || track.kind === "subtitles"
    );

    return {
      sources,
      tracks,
      t: data.t || 0,
      server: data.server || 0,
    };
  }
}
