// /admin/* — accés privat amb contrasenya (HTTP Basic). Usuari: admin.
// Secret de Pages: ADMIN_PASSWORD. Sense secret configurat, l'accés queda tancat.

function igual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function onRequest({ request, env, next }) {
  const denega = () => new Response('Acceso restringido', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Hechos admin", charset="UTF-8"', 'Cache-Control': 'no-store' },
  });
  if (!env.ADMIN_PASSWORD) return denega();
  const cap = request.headers.get('Authorization') || '';
  if (!cap.startsWith('Basic ')) return denega();
  let usuari = '', clau = '';
  try { [usuari, clau] = atob(cap.slice(6)).split(/:(.*)/s); } catch { return denega(); }
  if (usuari !== 'admin' || !igual(clau || '', env.ADMIN_PASSWORD)) return denega();

  const resposta = await next();
  const r = new Response(resposta.body, resposta);
  r.headers.set('Cache-Control', 'no-store');
  r.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return r;
}
