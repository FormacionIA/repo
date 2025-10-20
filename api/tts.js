// api/tts.js
import { tryProvidersSequentially, retryableError } from './_utils';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { text, voice = 'alloy' } = req.body || {};
    if (!text) return res.status(400).json({ error: 'Missing text' });

    const r = await tryProvidersSequentially(async (apiKey) => {
      const r = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice, input: text })
      });

      if (r.status === 401 || r.status === 429) {
        throw retryableError(`OpenAI ${r.status}`);
      }

      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        const err = new Error(`OpenAI ${r.status} ${txt}`);
        err.retryable = false;
        throw err;
      }
      return r;
    });

    const buf = await r.arrayBuffer();
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(Buffer.from(buf));
  } catch (e) {
    return res.status(500).json({ error: 'Proxy error', details: String(e?.message || e) });
  }
}
