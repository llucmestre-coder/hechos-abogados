// GET /admin/leads.csv — exportació completa (protegida per _middleware.js).

const camp = (v) => {
  const s = String(v == null ? '' : v);
  // Evita que un full de càlcul interpreti fórmules injectades (=, +, -, @).
  const segur = /^[=+\-@]/.test(s) ? "'" + s : s;
  return /[",\n;]/.test(segur) ? '"' + segur.replace(/"/g, '""') + '"' : segur;
};

export async function onRequestGet({ env }) {
  const { results } = await env.LEADS.prepare(
    'SELECT id, creat, correu, idioma, area, respostes, orientacio, hon_min, hon_max, recupera_min, recupera_max, estat FROM leads ORDER BY id DESC'
  ).all();
  const capcalera = ['id', 'creat', 'correu', 'idioma', 'area', 'respostes', 'orientacio', 'hon_min', 'hon_max', 'recupera_min', 'recupera_max', 'estat'];
  const linies = [capcalera.join(',')].concat(results.map((l) => capcalera.map((c) => camp(l[c])).join(',')));
  return new Response('﻿' + linies.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="hechos-leads.csv"',
    },
  });
}
