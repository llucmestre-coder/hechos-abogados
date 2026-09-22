// GET /admin — llista dels contactes de «¿Tengo caso?» (protegida per _middleware.js).

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const euros = (n) => (n == null ? '' : (Number(n) || 0).toLocaleString('es-ES', { useGrouping: 'always' }) + ' €');
const AREES = { divorcio: 'Divorcio', negligencia: 'Negligencia', clausulas: 'Hipoteca o tarjeta' };
const ORIENT = { bona: 'Buena pinta', estudiar: 'Estudiar', risc: 'Plazo en riesgo' };
const resum = (json) => { try { return Object.entries(JSON.parse(json)).map(([k, v]) => k + ': ' + v).join(' · '); } catch { return json; } };

export async function onRequestGet({ env }) {
  const { results } = await env.LEADS.prepare(
    'SELECT id, creat, correu, idioma, area, respostes, orientacio, hon_min, hon_max, recupera_min, recupera_max, estat FROM leads ORDER BY id DESC LIMIT 500'
  ).all();

  const files = results.map((l) => `<tr>
    <td>${esc(l.creat)}</td><td><a href="mailto:${esc(l.correu)}">${esc(l.correu)}</a></td>
    <td>${esc(AREES[l.area] || l.area)}</td><td>${esc(ORIENT[l.orientacio] || l.orientacio)}</td><td>${esc(resum(l.respostes))}</td>
    <td>${l.hon_min != null ? euros(l.hon_min) + ' – ' + euros(l.hon_max) : ''}</td>
    <td>${l.recupera_min != null ? euros(l.recupera_min) + ' – ' + euros(l.recupera_max) : ''}</td><td>${esc(l.idioma)}</td></tr>`).join('');

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>Contactos · Hechos Abogados</title>
<style>
  body{margin:0;padding:1.5rem;font:15px/1.45 system-ui,sans-serif;background:#F7F7F5;color:#18191D}
  h1{font-size:1.4rem;margin:0 0 .25rem} p{margin:0 0 1rem;color:#53565D}
  a{color:#A3192D} .taula{overflow-x:auto;background:#fff;border-radius:4px}
  table{border-collapse:collapse;width:100%;min-width:1000px} th,td{padding:.55rem .7rem;text-align:left;border-bottom:1px solid #C9CCC6;vertical-align:top}
  th{font-weight:600;background:#E4E6E1;white-space:nowrap}
</style></head><body>
<h1>Contactos de «¿Tengo caso?»</h1>
<p>${results.length} registros (máximo 500 en pantalla) · <a href="/admin/leads.csv">Descargar CSV</a></p>
<div class="taula"><table><thead><tr><th>Fecha (UTC)</th><th>Correo</th><th>Área</th><th>Orientación</th><th>Respuestas</th><th>Honorarios</th><th>Podría recuperar</th><th>Idioma</th></tr></thead>
<tbody>${files || '<tr><td colspan="8">Todavía no hay contactos.</td></tr>'}</tbody></table></div>
</body></html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
