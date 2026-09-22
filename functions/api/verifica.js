// POST /api/verifica — comprova el codi i, només si és correcte, calcula l'orientació
// de «¿Tengo caso?» (PLA.md §«Eina estrella») i retorna el WhatsApp.
// L'orientació, els honoraris i el número no són mai al navegador abans d'aquest pas.
// Secrets: WHATSAPP, BREVO_API_KEY, BREVO_SENDER. Bindings: CODIS (KV), LEADS (D1).

const MAX_INTENTS = 5;

// Preguntes i respostes vàlides per àrea. El servidor refusa qualsevol altra cosa.
const OPCIONS = {
  divorcio: { acuerdo: ['todo', 'parte', 'no'], hijos: ['si', 'no'], bienes: ['si', 'no'], cuando: ['ya', 'meses', 'informando'] },
  negligencia: { donde: ['publica', 'privada'], fecha: ['menos1', '1a5', 'mas5'], secuelas: ['duran', 'temporales', 'fallecimiento'], informes: ['si', 'parte', 'no'] },
  clausulas: { tipo: ['suelo', 'gastos', 'irph', 'revolving'], firma: ['antes2013', '2013a2019', 'despues2019'], reclamado: ['no', 'sinrespuesta', 'denegado'] },
};
// Import (slider): capital de la hipoteca o total gastat amb la targeta.
const ESCALA = { hipoteca: [30000, 400000, 5000], tarjeta: [1000, 40000, 500] };

// Honoraris orientatius inventats per a la demo (+ IVA), ordres de magnitud del sector (2026).
const DIVORCI = { todo_no: [450, 700], todo_si: [700, 1100], parte: [900, 1600], no: [1800, 3500] };
const PLUS_CONTENCIOS = { hijos: 400, bienes: 300 };
const NEGLIGENCIA = { provisio: 450, pct: [12, 18], pericial: [900, 2500] };
const CLAUSULES = { pct: [10, 15] };
// Recuperable: [a, b, c, d] → mín = a + b·X, màx = c + d·X (X = capital o total gastat).
const RECUPERA = {
  gastos: [500, 0.004, 1000, 0.009],
  suelo: [0, 0.025, 0, 0.06],
  suelo_tard: [0, 0.01, 0, 0.03],
  irph: [0, 0.015, 0, 0.05],
  revolving: [0, 0.15, 0, 0.45],
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

const te = (obj, clau) => Object.prototype.hasOwnProperty.call(obj, clau);
const a100 = (x) => Math.round(x / 100) * 100;

export function valides(r) {
  if (!r || !te(OPCIONS, r.area)) return false;
  const op = OPCIONS[r.area];
  for (const clau of Object.keys(op)) if (!op[clau].includes(r[clau])) return false;
  if (r.area === 'clausulas') {
    const [min, max, pas] = ESCALA[r.tipo === 'revolving' ? 'tarjeta' : 'hipoteca'];
    const x = Number(r.importe);
    if (!Number.isFinite(x) || x < min || x > max || (x - min) % pas !== 0) return false;
  }
  return true;
}

// Exportada per provar-la sense servidor (node) i per treure'n els «desde» de les pàgines.
// orientacio: 'bona' (tiene buena pinta) · 'estudiar' (hay que estudiarlo) · 'risc' (plazo en riesgo)
export function calcula(r) {
  const avisos = [];
  if (r.area === 'divorcio') {
    let hon;
    if (r.acuerdo === 'todo') hon = DIVORCI[r.hijos === 'si' ? 'todo_si' : 'todo_no'].slice();
    else if (r.acuerdo === 'parte') hon = DIVORCI.parte.slice();
    else {
      const plus = (r.hijos === 'si' ? PLUS_CONTENCIOS.hijos : 0) + (r.bienes === 'si' ? PLUS_CONTENCIOS.bienes : 0);
      hon = [DIVORCI.no[0] + plus, DIVORCI.no[1] + plus];
    }
    const senzill = r.acuerdo === 'todo' && r.hijos === 'no' && r.bienes === 'no';
    if (r.hijos === 'si') avisos.push('alimentos');
    if (r.acuerdo === 'todo' && r.hijos === 'no') avisos.push('notaria');
    return { area: 'divorcio', orientacio: senzill ? 'bona' : 'estudiar', honoraris: { tipus: 'tancat', min: hon[0], max: hon[1] }, recupera: null, avisos };
  }

  if (r.area === 'negligencia') {
    let orientacio;
    if ((r.donde === 'publica' && r.fecha !== 'menos1') || (r.donde === 'privada' && r.fecha === 'mas5')) orientacio = 'risc';
    else if (r.donde === 'privada' && r.fecha === '1a5') orientacio = 'estudiar';
    else if (r.secuelas === 'temporales' || r.informes === 'no') orientacio = 'estudiar';
    else orientacio = 'bona';
    if (r.informes !== 'si') avisos.push('historia');
    return {
      area: 'negligencia', orientacio,
      honoraris: { tipus: 'litis', provisio: NEGLIGENCIA.provisio, pctMin: NEGLIGENCIA.pct[0], pctMax: NEGLIGENCIA.pct[1], pericialMin: NEGLIGENCIA.pericial[0], pericialMax: NEGLIGENCIA.pericial[1] },
      recupera: null, avisos,
    };
  }

  // clausulas
  const x = Number(r.importe);
  let clau = r.tipo;
  let orientacio = 'bona';
  if (r.tipo === 'suelo' && r.firma !== 'antes2013') { clau = r.firma === '2013a2019' ? 'suelo_tard' : null; orientacio = 'estudiar'; }
  if (r.tipo === 'gastos' && r.firma === 'despues2019') { clau = null; orientacio = 'estudiar'; avisos.push('ley2019'); }
  if (r.tipo === 'irph') orientacio = 'estudiar';
  if (r.reclamado === 'denegado') avisos.push('denegado');
  let recupera = null;
  if (clau) {
    const f = RECUPERA[clau];
    recupera = { min: a100(f[0] + f[1] * x), max: a100(f[2] + f[3] * x) };
  }
  return { area: 'clausulas', orientacio, honoraris: { tipus: 'exit', pctMin: CLAUSULES.pct[0], pctMax: CLAUSULES.pct[1] }, recupera, avisos };
}

export async function onRequestPost({ request, env, waitUntil }) {
  let dades;
  try { dades = await request.json(); } catch { return json({ ok: false, error: 'dades' }, 400); }

  const correu = String(dades.correu || '').trim().toLowerCase();
  const codi = String(dades.codi || '');
  const r = dades.respostes || {};
  if (!correu || !/^\d{6}$/.test(codi)) return json({ ok: false, error: 'codi' }, 400);

  const clau = 'codi:' + (await sha256(correu));
  const desat = await env.CODIS.get(clau, 'json');
  if (!desat || desat.caduca < Date.now()) return json({ ok: false, error: 'caducat' }, 400);
  if (desat.intents >= MAX_INTENTS) {
    await env.CODIS.delete(clau);
    return json({ ok: false, error: 'intents' }, 429);
  }

  if ((await sha256(codi + ':' + correu)) !== desat.hash) {
    desat.intents += 1;
    const queda = Math.max(60, Math.ceil((desat.caduca - Date.now()) / 1000));
    await env.CODIS.put(clau, JSON.stringify(desat), { expirationTtl: queda });
    return json({ ok: false, error: 'codi' }, 400);
  }

  // Res fora de les llistes, i res es desa sense el consentiment explícit
  // (a negligències les respostes són dades de salut, art. 9 RGPD).
  if (!valides(r) || dades.consentiment !== true) return json({ ok: false, error: 'respostes' }, 400);

  await env.CODIS.delete(clau); // un codi, una orientació

  const e = calcula(r);
  const idioma = ['es', 'ca', 'en'].includes(dades.idioma) ? dades.idioma : 'es';
  const respostes = {};
  Object.keys(OPCIONS[r.area]).forEach((k) => { respostes[k] = r[k]; });
  if (r.area === 'clausulas') respostes.importe = Number(r.importe);

  // Contacte per al seguiment (D1). Si la base de dades falla, l'usuari veu igualment el resultat.
  try {
    await env.LEADS.prepare(
      'INSERT INTO leads (correu, idioma, area, respostes, orientacio, hon_min, hon_max, recupera_min, recupera_max) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(correu, idioma, r.area, JSON.stringify(respostes), e.orientacio,
      e.honoraris.min ?? null, e.honoraris.max ?? null, e.recupera ? e.recupera.min : null, e.recupera ? e.recupera.max : null).run();
  } catch (err) {
    console.error('D1 leads:', err && err.message);
  }

  const t = RESUM[idioma];
  const n = (x) => x.toLocaleString(t.locale, { useGrouping: 'always' });
  const fets = Object.keys(respostes).map((k) => (k === 'importe' ? t.importe + ': ' + n(respostes.importe) + ' €' : t.fets[r.area][k][respostes[k]]));
  const honoraris = e.area === 'divorcio'
    ? t.honTancat.replace('{min}', n(e.honoraris.min)).replace('{max}', n(e.honoraris.max))
    : e.area === 'negligencia' ? t.honLitis : t.honExit;
  const recupera = e.recupera ? n(e.recupera.min) + ' € – ' + n(e.recupera.max) + ' €' : '';

  // Avís al despatx per correu (no bloqueja la resposta).
  const avis = [
    'Nuevo caso desde «¿Tengo caso?» de Hechos Abogados',
    '',
    'Correo: ' + correu,
    'Área: ' + RESUM.es.arees[r.area],
    'Hechos: ' + fets.map((f, i) => RESUM.es.ordinals[i] + ') ' + f).join(' '),
    'Orientación mostrada: ' + RESUM.es.orientacions[e.orientacio],
    'Honorarios mostrados: ' + honoraris,
    recupera ? 'Podría recuperar: ' + recupera : '',
    'Idioma de la web: ' + idioma,
  ].filter(Boolean).join('\n');
  waitUntil(fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: '¿Tengo caso? · Hechos Abogados', email: env.BREVO_SENDER },
      to: [{ email: env.BREVO_SENDER }],
      replyTo: { email: correu },
      subject: 'Nuevo caso: ' + RESUM.es.arees[r.area] + ' · ' + RESUM.es.orientacions[e.orientacio],
      textContent: avis,
    }),
  }).catch(() => {}));

  // Resum per a l'usuari, en l'idioma de la web: el mateix «escrit» que veu a la pantalla.
  const missatgeWa = encodeURIComponent(t.wa
    .replace('{area}', t.arees[r.area]).replace('{resum}', fets.join('; '))
    .replace('{orientacio}', t.orientacions[e.orientacio]));
  const enllacWa = 'https://wa.me/' + String(env.WHATSAPP || '').replace(/\D/g, '') + '?text=' + missatgeWa;
  const apartat = (titol, cos) => `<p style="font:600 13px Arial,sans-serif;color:#A3192D;margin:22px 0 6px">${titol}</p>${cos}`;
  const html = `<div style="font-family:Georgia,serif;color:#18191D;max-width:540px;line-height:1.55;border-top:4px solid #A3192D;padding-top:18px">
  <p style="font:16px Arial,sans-serif">${t.hola}</p>
  ${apartat(t.hechos, '<ol style="margin:0;padding-left:20px">' + fets.map((f) => `<li style="margin:4px 0">${f}</li>`).join('') + '</ol>')}
  ${apartat(t.loQueVemos, `<p style="font-size:20px;font-weight:700;margin:0">${t.orientacions[e.orientacio]}</p><p style="margin:4px 0 0">${t.explica[r.area][e.orientacio]}</p>`)}
  ${recupera ? apartat(t.podriasRecuperar, `<p style="font-size:22px;font-weight:700;margin:0">${recupera}</p>`) : ''}
  ${apartat(t.plazo, `<p style="margin:0">${t.plazos[r.area]}</p>`)}
  ${apartat(t.honorarios, `<p style="margin:0">${honoraris}</p>`)}
  <p style="font:13px Arial,sans-serif;color:#53565D;margin:22px 0">${t.nota}</p>
  <p style="margin:0 0 22px"><a href="${enllacWa}" style="font:700 15px Arial,sans-serif;background:#1A7A43;color:#fff;text-decoration:none;padding:12px 20px;border-radius:4px;display:inline-block">${t.botoWa}</a></p>
  <p style="font:14px Arial,sans-serif;color:#53565D">Hechos Abogados · 600 000 000</p></div>`;
  waitUntil(fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Hechos Abogados', email: env.BREVO_SENDER },
      to: [{ email: correu }],
      subject: t.assumpte + ' · ' + t.arees[r.area],
      textContent: `${t.hola}\n\n${t.hechos}\n${fets.map((f, i) => (i + 1) + '. ' + f).join('\n')}\n\n${t.loQueVemos}: ${t.orientacions[e.orientacio]}. ${t.explica[r.area][e.orientacio]}\n${recupera ? t.podriasRecuperar + ': ' + recupera + '\n' : ''}${t.plazo}: ${t.plazos[r.area]}\n${t.honorarios}: ${honoraris}\n\n${t.nota}\n\n${t.botoWa}: ${enllacWa}\n\nHechos Abogados · 600 000 000`,
      htmlContent: html,
    }),
  }).catch(() => {}));

  return json({ ok: true, ...e, whatsapp: env.WHATSAPP });
}

const RESUM = {
  es: {
    locale: 'es-ES',
    assumpte: 'Tu resultado de «¿Tengo caso?»',
    hola: 'Hola, este es el resultado del test que has hecho en nuestra web.',
    hechos: 'Hechos', loQueVemos: 'Lo que vemos', podriasRecuperar: 'Lo que podrías recuperar', plazo: 'Plazo', honorarios: 'Honorarios orientativos',
    ordinals: ['Primero', 'Segundo', 'Tercero', 'Cuarto', 'Quinto'],
    importe: 'Importe aproximado',
    arees: { divorcio: 'Divorcio o separación', negligencia: 'Negligencia médica', clausulas: 'Hipoteca o tarjeta' },
    orientacions: { bona: 'Tiene buena pinta', estudiar: 'Hay que estudiarlo', risc: 'El plazo puede estar en riesgo: llámanos hoy' },
    explica: {
      divorcio: { bona: 'Estáis de acuerdo en todo y no hay hijos ni bienes que compliquen el reparto: normalmente es el proceso más corto.', estudiar: 'Hay hijos, vivienda o bienes en común, o solo estáis de acuerdo en parte: antes de darte un precio cerrado hay que mirarlo con calma.' },
      negligencia: { bona: 'Todavía estás dentro del plazo y tienes informes o parte de la historia clínica: hay con qué empezar a mirarlo.', estudiar: 'Falta documentación o las consecuencias no están claras todavía: hace falta un estudio de viabilidad antes de decir nada.', risc: 'Por las fechas, el plazo general para reclamar puede haber pasado o estar a punto de cerrarse. A veces se interrumpe o empieza a contar más tarde: llámanos hoy y lo miramos.' },
      clausulas: { bona: 'Es de las cláusulas que los jueces han anulado muchas veces: hay margen para reclamar.', estudiar: 'Tu caso es de los que hay que analizar papel a papel antes de decir nada.' },
    },
    plazos: {
      divorcio: 'No hay un plazo legal para divorciarte. Si hay hijos, la pensión de alimentos se debe desde que se presenta la demanda.',
      negligencia: 'En sanidad pública, en general 1 año desde que te curas o se fijan las secuelas. En sanidad privada, 5 años si había contrato con la clínica o la mutua; si no, 1. Siempre depende del caso.',
      clausulas: 'No hay un plazo único: depende del tipo de cláusula, de las fechas y de si ya reclamaste antes.',
    },
    honTancat: 'Precio cerrado orientativo de {min} € a {max} € + IVA. Procurador y notaría, aparte.',
    honLitis: 'Estudio de viabilidad gratis. Si seguimos: provisión de 450 € y un 12–18 % de lo que se cobre, + IVA. Informe pericial aparte (900–2.500 €).',
    honExit: '0 € por adelantado. Cobramos de las costas del banco o, si no las paga, un 10–15 % de lo recuperado, + IVA.',
    nota: 'Es una orientación, no un consejo legal: lo confirma un abogado leyendo tus papeles.',
    botoWa: 'Hablar por WhatsApp',
    wa: 'Hola, he hecho el test de Hechos Abogados. Área: {area}. Resumen: {resum}. Orientación: {orientacio}. ¿Podemos hablar?',
    fets: {
      divorcio: {
        acuerdo: { todo: 'Estáis de acuerdo en todo.', parte: 'Estáis de acuerdo en parte.', no: 'No estáis de acuerdo.' },
        hijos: { si: 'Hay hijos menores.', no: 'No hay hijos menores.' },
        bienes: { si: 'Hay vivienda o bienes en común.', no: 'No hay vivienda ni bienes en común.' },
        cuando: { ya: 'Quieres empezar lo antes posible.', meses: 'Quieres empezar en los próximos meses.', informando: 'De momento solo te estás informando.' },
      },
      negligencia: {
        donde: { publica: 'Te atendieron en la sanidad pública.', privada: 'Te atendieron en la sanidad privada o en una mutua.' },
        fecha: { menos1: 'Pasó hace menos de 1 año.', '1a5': 'Pasó hace entre 1 y 5 años.', mas5: 'Pasó hace más de 5 años.' },
        secuelas: { duran: 'Te han quedado secuelas que duran.', temporales: 'Las consecuencias fueron temporales y ya te has recuperado.', fallecimiento: 'Falleció un familiar.' },
        informes: { si: 'Tienes los informes o la historia clínica.', parte: 'Tienes parte de los informes.', no: 'Todavía no tienes los informes.' },
      },
      clausulas: {
        tipo: { suelo: 'Te preocupa la cláusula suelo.', gastos: 'Te preocupan los gastos de la hipoteca.', irph: 'Tu hipoteca va referenciada al IRPH.', revolving: 'Tienes una tarjeta revolving.' },
        firma: { antes2013: 'La firmaste antes de 2013.', '2013a2019': 'La firmaste entre 2013 y 2019.', despues2019: 'La firmaste después de 2019.' },
        reclamado: { no: 'Todavía no has reclamado al banco.', sinrespuesta: 'Reclamaste al banco y no te contestó.', denegado: 'Reclamaste al banco y te dijo que no.' },
      },
    },
  },
  ca: {
    locale: 'ca-ES',
    assumpte: 'El teu resultat de «Tinc cas?»',
    hola: 'Hola, aquest és el resultat del test que has fet a la nostra web.',
    hechos: 'Fets', loQueVemos: 'El que veiem', podriasRecuperar: 'El que podries recuperar', plazo: 'Termini', honorarios: 'Honoraris orientatius',
    ordinals: ['Primer', 'Segon', 'Tercer', 'Quart', 'Cinquè'],
    importe: 'Import aproximat',
    arees: { divorcio: 'Divorci o separació', negligencia: 'Negligència mèdica', clausulas: 'Hipoteca o targeta' },
    orientacions: { bona: 'Té bona pinta', estudiar: 'Cal estudiar-ho', risc: 'El termini pot estar en risc: truca\'ns avui' },
    explica: {
      divorcio: { bona: 'Esteu d\'acord en tot i no hi ha fills ni béns que compliquin el repartiment: normalment és el procés més curt.', estudiar: 'Hi ha fills, habitatge o béns en comú, o només esteu d\'acord en part: abans de donar-te un preu tancat cal mirar-ho amb calma.' },
      negligencia: { bona: 'Encara ets dins del termini i tens informes o part de la història clínica: hi ha amb què començar a mirar-ho.', estudiar: 'Falta documentació o les conseqüències encara no són clares: cal un estudi de viabilitat abans de dir res.', risc: 'Per les dates, el termini general per reclamar pot haver passat o estar a punt de tancar-se. De vegades s\'interromp o comença a comptar més tard: truca\'ns avui i ho mirem.' },
      clausulas: { bona: 'És de les clàusules que els jutges han anul·lat moltes vegades: hi ha marge per reclamar.', estudiar: 'El teu cas és dels que cal analitzar paper a paper abans de dir res.' },
    },
    plazos: {
      divorcio: 'No hi ha un termini legal per divorciar-te. Si hi ha fills, la pensió d\'aliments es deu des que es presenta la demanda.',
      negligencia: 'A la sanitat pública, en general 1 any des que et cures o es fixen les seqüeles. A la privada, 5 anys si hi havia contracte amb la clínica o la mútua; si no, 1. Sempre depèn del cas.',
      clausulas: 'No hi ha un termini únic: depèn del tipus de clàusula, de les dates i de si ja vas reclamar abans.',
    },
    honTancat: 'Preu tancat orientatiu de {min} € a {max} € + IVA. Procurador i notaria, a banda.',
    honLitis: 'Estudi de viabilitat gratuït. Si seguim: provisió de 450 € i un 12–18 % del que es cobri, + IVA. Informe pericial a banda (900–2.500 €).',
    honExit: '0 € per avançat. Cobrem de les costes del banc o, si no les paga, un 10–15 % del que es recuperi, + IVA.',
    nota: 'És una orientació, no un consell legal: ho confirma un advocat llegint els teus papers.',
    botoWa: 'Parlar per WhatsApp',
    wa: 'Hola, he fet el test d\'Hechos Abogados. Àrea: {area}. Resum: {resum}. Orientació: {orientacio}. Podem parlar?',
    fets: {
      divorcio: {
        acuerdo: { todo: 'Esteu d\'acord en tot.', parte: 'Esteu d\'acord en part.', no: 'No esteu d\'acord.' },
        hijos: { si: 'Hi ha fills menors.', no: 'No hi ha fills menors.' },
        bienes: { si: 'Hi ha habitatge o béns en comú.', no: 'No hi ha habitatge ni béns en comú.' },
        cuando: { ya: 'Vols començar com més aviat millor.', meses: 'Vols començar els pròxims mesos.', informando: 'De moment només t\'estàs informant.' },
      },
      negligencia: {
        donde: { publica: 'Et van atendre a la sanitat pública.', privada: 'Et van atendre a la sanitat privada o en una mútua.' },
        fecha: { menos1: 'Va passar fa menys d\'1 any.', '1a5': 'Va passar fa entre 1 i 5 anys.', mas5: 'Va passar fa més de 5 anys.' },
        secuelas: { duran: 'T\'han quedat seqüeles que duren.', temporales: 'Les conseqüències van ser temporals i ja t\'has recuperat.', fallecimiento: 'Va morir un familiar.' },
        informes: { si: 'Tens els informes o la història clínica.', parte: 'Tens part dels informes.', no: 'Encara no tens els informes.' },
      },
      clausulas: {
        tipo: { suelo: 'Et preocupa la clàusula sòl.', gastos: 'Et preocupen les despeses de la hipoteca.', irph: 'La teva hipoteca va referenciada a l\'IRPH.', revolving: 'Tens una targeta revolving.' },
        firma: { antes2013: 'La vas signar abans del 2013.', '2013a2019': 'La vas signar entre el 2013 i el 2019.', despues2019: 'La vas signar després del 2019.' },
        reclamado: { no: 'Encara no has reclamat al banc.', sinrespuesta: 'Vas reclamar al banc i no et va contestar.', denegado: 'Vas reclamar al banc i et va dir que no.' },
      },
    },
  },
  en: {
    locale: 'en-GB',
    assumpte: 'Your «Do I have a case?» result',
    hola: 'Hi, here is the result of the test you took on our website.',
    hechos: 'Facts', loQueVemos: 'What we see', podriasRecuperar: 'What you could recover', plazo: 'Time limit', honorarios: 'Estimated fees',
    ordinals: ['First', 'Second', 'Third', 'Fourth', 'Fifth'],
    importe: 'Approximate amount',
    arees: { divorcio: 'Divorce or separation', negligencia: 'Medical negligence', clausulas: 'Mortgage or card' },
    orientacions: { bona: 'Looks promising', estudiar: 'Needs a closer look', risc: 'The time limit may be at risk: call us today' },
    explica: {
      divorcio: { bona: 'You agree on everything and there are no children or shared assets to complicate things: this is usually the quickest process.', estudiar: 'There are children, a home or shared assets, or you only partly agree: we need to look at it calmly before giving you a fixed price.' },
      negligencia: { bona: 'You are still within the time limit and you have reports or part of your medical records: there is enough to start looking at it.', estudiar: 'Some documents are missing or the consequences are not clear yet: a feasibility study is needed before we can say anything.', risc: 'Given the dates, the general time limit to claim may have passed or be about to close. Sometimes it is interrupted or starts counting later: call us today and we will check.' },
      clausulas: { bona: 'Judges have struck down this kind of clause many times: there is room to claim.', estudiar: 'Your case is one we need to go through document by document before saying anything.' },
    },
    plazos: {
      divorcio: 'There is no legal time limit to divorce. If there are children, child support is owed from the day the claim is filed.',
      negligencia: 'In public healthcare, generally 1 year from when you recover or the after-effects are set. In private healthcare, 5 years if you had a contract with the clinic or insurer; otherwise 1. It always depends on the case.',
      clausulas: 'There is no single time limit: it depends on the type of clause, the dates and whether you have already claimed.',
    },
    honTancat: 'Estimated fixed price from €{min} to €{max} + VAT. Court representative and notary are extra.',
    honLitis: 'Free feasibility study. If we go ahead: a €450 retainer and 12–18% of what is recovered, + VAT. Expert report extra (€900–2,500).',
    honExit: '€0 upfront. We are paid from the costs the bank is ordered to pay or, if it does not pay them, 10–15% of what is recovered, + VAT.',
    nota: 'This is guidance, not legal advice: a lawyer confirms it after reading your documents.',
    botoWa: 'Chat on WhatsApp',
    wa: 'Hi, I took the Hechos Abogados test. Area: {area}. Summary: {resum}. Guidance: {orientacio}. Can we talk?',
    fets: {
      divorcio: {
        acuerdo: { todo: 'You agree on everything.', parte: 'You partly agree.', no: 'You do not agree.' },
        hijos: { si: 'There are children under 18.', no: 'There are no children under 18.' },
        bienes: { si: 'You share a home or assets.', no: 'You do not share a home or assets.' },
        cuando: { ya: 'You want to start as soon as possible.', meses: 'You want to start in the coming months.', informando: 'For now you are just finding out.' },
      },
      negligencia: {
        donde: { publica: 'You were treated in public healthcare.', privada: 'You were treated in private healthcare or by an insurer.' },
        fecha: { menos1: 'It happened less than 1 year ago.', '1a5': 'It happened between 1 and 5 years ago.', mas5: 'It happened more than 5 years ago.' },
        secuelas: { duran: 'You have lasting after-effects.', temporales: 'The consequences were temporary and you have recovered.', fallecimiento: 'A family member died.' },
        informes: { si: 'You have the reports or medical records.', parte: 'You have some of the reports.', no: 'You do not have the reports yet.' },
      },
      clausulas: {
        tipo: { suelo: 'You are worried about a floor clause.', gastos: 'You are worried about the mortgage set-up costs.', irph: 'Your mortgage is linked to the IRPH index.', revolving: 'You have a revolving credit card.' },
        firma: { antes2013: 'You signed it before 2013.', '2013a2019': 'You signed it between 2013 and 2019.', despues2019: 'You signed it after 2019.' },
        reclamado: { no: 'You have not claimed from the bank yet.', sinrespuesta: 'You claimed and the bank did not reply.', denegado: 'You claimed and the bank said no.' },
      },
    },
  },
};

export function onRequest() {
  return json({ ok: false, error: 'metode' }, 405);
}
