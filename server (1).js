import http from 'node:http';

const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.CLAUDE_MODEL || 'claude-3-5-haiku-latest';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, {
    'content-type': `${type}; charset=utf-8`,
    'access-control-allow-origin': ALLOWED_ORIGIN,
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'cache-control': 'no-store'
  });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1_000_000) { req.destroy(); reject(new Error('İstek çok büyük.')); }
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { reject(new Error('Geçersiz JSON.')); }
    });
    req.on('error', reject);
  });
}

async function claudeChat(input) {
  if (!API_KEY) throw new Error('ANTHROPIC_API_KEY Railway Variables bölümünde ayarlanmamış.');
  const message = typeof input.message === 'string' ? input.message.trim() : '';
  if (!message) throw new Error('Mesaj boş olamaz.');
  if (message.length > 8000) throw new Error('Mesaj 8000 karakterden kısa olmalı.');

  const history = Array.isArray(input.history) ? input.history
    .filter(x => x && (x.role === 'user' || x.role === 'assistant') && typeof x.content === 'string')
    .slice(-8)
    .map(x => ({ role: x.role, content: x.content.slice(0, 2500) })) : [];
  history.push({ role: 'user', content: message });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system: 'Sen Türkçe konuşan, profesyonel, açık ve güvenilir bir yapay zekâ asistanısın. Bilmediğin bilgileri uydurma; gerektiğinde kullanıcıdan açıklama iste.',
      messages: history
    })
  });

  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; } catch { throw new Error('Claude geçersiz yanıt verdi.'); }
  if (!response.ok) throw new Error(data?.error?.message || `Claude API hatası (${response.status}).`);
  const content = Array.isArray(data.content) ? data.content.filter(x => x.type === 'text').map(x => x.text).join('\n') : '';
  if (!content) throw new Error('Claude boş yanıt verdi.');
  return content;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, '');
  if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true, service: 'hsngbt-claude-backend' });
  if (req.method === 'GET' && req.url === '/api/models') return send(res, 200, { models: [{ id: '', label: 'Claude Otomatik', detail: MODEL }] });
  if (req.method === 'POST' && req.url === '/api/chat') {
    try { return send(res, 200, { content: await claudeChat(await readBody(req)) }); }
    catch (error) { return send(res, 400, { error: error.message || 'İşlem başarısız.' }); }
  }
  return send(res, 404, { error: 'Adres bulunamadı.' });
});

server.listen(PORT, '0.0.0.0', () => console.log(`hsngbt backend listening on ${PORT}`));
