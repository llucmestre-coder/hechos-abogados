// POST /api/codi — envia el codi de verificació de «¿Tengo caso?».
// 1) Turnstile (captcha) validat al servidor · 2) límit per IP i per correu
// 3) codi de 6 xifres: a KV només se'n guarda el hash, 10 minuts · 4) correu amb Brevo.
// Secrets (mai al repo, que és públic): TURNSTILE_SECRET, BREVO_API_KEY, BREVO_SENDER.
// Binding KV: CODIS (wrangler.toml).

const TTL_CODI = 600;          // 10 minuts
const FINESTRA_LIMIT = 3600;   // 1 hora
const MAX_PER_IP = 6;
const MAX_PER_CORREU = 3;

const TEXTOS = {
  es: {
    assumpte: 'Tu código para ver el resultado · Hechos Abogados',
    intro: 'Este es tu código para ver el resultado de «¿Tengo caso?»:',
    caduca: 'Caduca en 10 minutos. Si no lo has pedido tú, ignora este correo.',
  },
  ca: {
    assumpte: 'El teu codi per veure el resultat · Hechos Abogados',
    intro: 'Aquest és el teu codi per veure el resultat de «Tinc cas?»:',
    caduca: 'Caduca d\'aquí a 10 minuts. Si no l\'has demanat tu, ignora aquest correu.',
  },
  en: {
    assumpte: 'Your code to see the result · Hechos Abogados',
    intro: 'This is your code to see your «Do I have a case?» result:',
    caduca: 'It expires in 10 minutes. If you did not request it, ignore this email.',
  },
};

function json(dades, status = 200) {
  return new Response(JSON.stringify(dades), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Comptador aproximat (KV és eventualment consistent: suficient per frenar bots).
async function dinsDelLimit(kv, clau, maxim) {
  const n = Number(await kv.get(clau)) || 0;
  if (n >= maxim) return false;
  await kv.put(clau, String(n + 1), { expirationTtl: FINESTRA_LIMIT });
  return true;
}

export async function onRequestPost({ request, env }) {
  let dades;
  try { dades = await request.json(); } catch { return json({ ok: false, error: 'dades' }, 400); }

  const correu = String(dades.correu || '').trim().toLowerCase();
  const idioma = ['es', 'ca', 'en'].includes(dades.idioma) ? dades.idioma : 'es';
  if (correu.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correu)) {
    return json({ ok: false, error: 'correu' }, 400);
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'desconeguda';

  const verif = new FormData();
  verif.append('secret', env.TURNSTILE_SECRET);
  verif.append('response', String(dades.token || ''));
  verif.append('remoteip', ip);
  const captcha = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: verif })
    .then((r) => r.json())
    .catch(() => ({ success: false }));
  if (!captcha.success) return json({ ok: false, error: 'captcha' }, 400);

  const clauCorreu = await sha256(correu);
  if (!(await dinsDelLimit(env.CODIS, 'limit:ip:' + ip, MAX_PER_IP)) ||
      !(await dinsDelLimit(env.CODIS, 'limit:correu:' + clauCorreu, MAX_PER_CORREU))) {
    return json({ ok: false, error: 'limit' }, 429);
  }

  const codi = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
  await env.CODIS.put('codi:' + clauCorreu, JSON.stringify({
    hash: await sha256(codi + ':' + correu),
    intents: 0,
    caduca: Date.now() + TTL_CODI * 1000,
  }), { expirationTtl: TTL_CODI });

  const t = TEXTOS[idioma];
  const html = `<div style="font-family:Arial,sans-serif;color:#18191D;max-width:480px">
  <p style="font-size:16px">${t.intro}</p>
  <p style="font-size:34px;font-weight:700;letter-spacing:6px;margin:16px 0">${codi}</p>
  <p style="font-size:14px;color:#53565D">${t.caduca}</p>
  <p style="font-size:14px;color:#53565D">Hechos Abogados</p></div>`;

  const enviat = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Hechos Abogados', email: env.BREVO_SENDER },
      to: [{ email: correu }],
      subject: t.assumpte,
      textContent: `${t.intro} ${codi}\n\n${t.caduca}`,
      htmlContent: html,
    }),
  });

  if (!enviat.ok) {
    await env.CODIS.delete('codi:' + clauCorreu);
    return json({ ok: false, error: 'enviament' }, 502);
  }
  return json({ ok: true });
}

export function onRequest() {
  return json({ ok: false, error: 'metode' }, 405);
}
