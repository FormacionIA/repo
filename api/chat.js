// api/chat.js
import { tryProvidersSequentially, retryableError } from './_utils';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    // CORS básico opcional (por si abres desde otro dominio)
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { messages, max_tokens = 120, temperature = 1.0 } = req.body || {};
    if (!Array.isArray(messages)) return res.status(400).json({ error: 'Invalid body: messages[] required' });

    const r = await tryProvidersSequentially(async (apiKey) => {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages,
          stream: false,
          max_tokens,
          temperature,
          presence_penalty: 0.2,
          frequency_penalty: 0.1
        })
      });

      if (r.status === 401 || r.status === 429) {
        // clave inválida o rate limit → intenta con la siguiente
        throw retryableError(`OpenAI ${r.status}`);
      }

      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        // Error no reintetable (p.ej. 400 por body inválido)
        const err = new Error(`OpenAI ${r.status} ${txt}`);
        err.retryable = false;
        throw err;
      }

      return r;
    });

    const data = await r.json();
    const text = data.choices?.[0]?.message?.content || '';
    // CORS opcional
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: 'Proxy error', details: String(e?.message || e) });
  }
}
