// api/_utils.js
export function parseOpenAIKeys() {
  const raw = process.env.OPENAI_API_KEYS || process.env.OPENAI_API_KEY || '';
  // Permitimos coma o saltos de línea
  const keys = raw
    .split(/[\n,]/)
    .map(s => s.trim())
    .filter(Boolean);
  if (keys.length === 0) {
    throw new Error('No OpenAI API keys found. Set OPENAI_API_KEYS in Vercel.');
  }
  return keys.slice(0, 8); // hasta 8
}

export async function tryProvidersSequentially(doRequest) {
  const keys = parseOpenAIKeys();
  // Empezamos en índice pseudo-aleatorio para repartir carga
  const start = Math.floor(Math.random() * keys.length);
  let lastErr;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[(start + i) % keys.length];
    try {
      const res = await doRequest(key);
      // Si OpenAI devolvió error HTTP, dejamos que el caller lo trate
      return res;
    } catch (e) {
      lastErr = e;
      // Si el error está marcado como "retryable", probamos siguiente
      if (e && e.retryable) continue;
      // Si no es reintetable, cortamos
      break;
    }
  }
  // Si llegamos aquí, no hubo éxito con ninguna clave
  throw lastErr || new Error('All OpenAI keys failed');
}

// Simple helper para marcar errores reintetables
export function retryableError(message) {
  const err = new Error(message);
  err.retryable = true;
  return err;
}
