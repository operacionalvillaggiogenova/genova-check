export class HttpError extends Error {
  constructor(status, message, code = null) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export function json(data, status = 200, extraHeaders = {}) {
  const headers = new Headers(extraHeaders);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(JSON.stringify(data), { status, headers });
}

export async function readJson(request, maxBytes = 128 * 1024) {
  const type = request.headers.get('content-type') || '';
  if (!type.toLowerCase().includes('application/json')) {
    throw new HttpError(415, 'Envie os dados no formato JSON.');
  }
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maxBytes) throw new HttpError(413, 'Dados enviados acima do limite permitido.');
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'JSON inválido.');
  }
}

export function assertSameOrigin(request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  const origin = request.headers.get('origin');
  if (!origin) return;
  const url = new URL(request.url);
  if (origin !== url.origin) throw new HttpError(403, 'Origem da solicitação não autorizada.');
}

export function handleError(error) {
  const status = Number(error?.status);
  if (error instanceof HttpError || (Number.isInteger(status) && status >= 400 && status <= 599)) {
    return json({ error: error.message, code: error.code || undefined }, status || 500);
  }
  console.error('Blexo-Suite Worker:', error);
  return json({ error: 'Não foi possível concluir a operação.' }, 500);
}

export const isoNow = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();

export function cleanText(value, maxLength = 500, required = false) {
  const text = String(value ?? '').trim().slice(0, maxLength);
  if (required && !text) throw new HttpError(400, 'Preencha todos os campos obrigatórios.');
  return text;
}
