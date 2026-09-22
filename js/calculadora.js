/* =========================================================================
   HECHOS ABOGADOS — «¿Tengo caso?» (PLA.md §«Eina estrella»)
   Adaptat de la calculadora de referència de la skill web-demo.
   - Una pregunta per pantalla; en tocar una opció avança sola.
   - Les preguntes es ramifiquen per àrea: sempre són 5 (àrea + 4).
   - L'orientació, els honoraris i el WhatsApp NO són al client: els retorna
     /api/verifica després de validar el codi que /api/codi envia al correu.
   - Textos escrits des del JS: sempre passen per I18N.t amb la frase dins.
   ========================================================================= */
(function () {
  'use strict';

  if (!window.I18N) window.I18N = { t: function (s) { return s; } };
  var arrel = document.getElementById('calc');
  if (!arrel) return;

  /* Clau pública del widget Turnstile (hechos-abogados.pages.dev i localhost).
     La secreta és un secret de Pages. */
  var TURNSTILE_SITEKEY = '0x4AAAAAAFAAoy9uYVqOIkGj';

  var BRANQUES = {
    divorcio: ['acuerdo', 'hijos', 'bienes', 'cuando'],
    negligencia: ['donde', 'fecha', 'secuelas', 'informes'],
    clausulas: ['tipo', 'importe', 'firma', 'reclamado']
  };
  var TOTAL = 5;
  var DESAT = 'hechos-tengo-caso';
  // Import: capital de la hipoteca o total gastat amb la targeta [mín, màx, pas, inici].
  var ESCALA = { hipoteca: [30000, 400000, 5000, 150000], tarjeta: [1000, 40000, 500, 6000] };
  var redueix = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var $ = function (sel, dins) { return (dins || arrel).querySelector(sel); };
  var $$ = function (sel, dins) { return Array.prototype.slice.call((dins || arrel).querySelectorAll(sel)); };

  var estat = llegeix() || { pas: 0, respostes: {}, correu: '', resultat: null };

  /* Només es recupera on s'havia quedat si es recarrega la pàgina. Arribant-hi
     des de qualsevol botó o enllaç, el test comença de zero. */
  function llegeix() {
    var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    if (!nav || nav.type !== 'reload') {
      try { sessionStorage.removeItem(DESAT); } catch (e) { /* res */ }
      return null;
    }
    try { return JSON.parse(sessionStorage.getItem(DESAT)); } catch (e) { return null; }
  }
  function desa() {
    try { sessionStorage.setItem(DESAT, JSON.stringify(estat)); } catch (e) { /* sense emmagatzematge: continua igual */ }
  }

  /* Accessos directes: tengo-caso.html?area=divorcio|negligencia|clausulas salta la 1a. */
  var areaUrl = new URLSearchParams(location.search).get('area');
  if (!estat.respostes.area && areaUrl && BRANQUES[areaUrl]) {
    estat.respostes.area = { valor: areaUrl };
    estat.pas = 1;
  }

  function preguntes() {
    var a = estat.respostes.area;
    return ['area'].concat(a ? BRANQUES[a.valor] : []);
  }
  function passos() { return preguntes().concat(['correu', 'codi', 'resultat']); }
  function escala() { return ESCALA[estat.respostes.tipo && estat.respostes.tipo.valor === 'revolving' ? 'tarjeta' : 'hipoteca']; }

  /* ── Pintar un pas ─────────────────────────────────────────────────── */
  function pantalla(nom) { return $('.calc-pas[data-pas="' + nom + '"]'); }

  function mostra(index, enrere) {
    var P = preguntes();
    var S = passos();
    // Sense àrea encara, el pas 1 és per força l'àrea.
    if (P.length === 1) index = 0;
    index = Math.max(0, Math.min(index, S.length - 1));
    if (S[index] === 'resultat' && !estat.resultat) index = S.indexOf('correu');
    for (var i = 0; i < P.length && i < index; i++) {
      if (!estat.respostes[P[i]]) { index = i; break; }
    }
    estat.pas = index;
    desa();

    var nom = S[index];
    $$('.calc-pas').forEach(function (s) { s.hidden = s.getAttribute('data-pas') !== nom; });
    var actual = pantalla(nom);
    actual.classList.remove('entra', 'entra-enrere');
    if (!redueix) { void actual.offsetWidth; actual.classList.add(enrere ? 'entra-enrere' : 'entra'); }

    if (nom === 'importe') preparaImport();
    marcaEscollides(actual);

    var fetes = Math.min(index, TOTAL);
    $('.calc-progres i').style.transform = 'scaleX(' + (fetes / TOTAL) + ')';
    $('.calc-progres').setAttribute('aria-valuenow', String(fetes));
    $('[data-calc-num]').textContent = String(Math.min(index + 1, TOTAL));
    $('.calc-comptador').hidden = index >= TOTAL;
    $('[data-calc-enrere]').hidden = index === 0 || nom === 'resultat';
    $('.calc-cap').hidden = nom === 'resultat';
    $('[data-calc-resum]').hidden = nom === 'resultat';

    pintaResum();
    if (nom === 'correu') { preparaConsentiment(); preparaCaptcha(); }
    if (nom === 'codi') { $('[data-calc-correu]').textContent = estat.correu; $('.calc-codi input').focus(); }
    if (nom === 'resultat') pintaResultat();

    var titol = actual.querySelector('[tabindex="-1"]');
    if (titol && nom !== 'codi') titol.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: redueix ? 'auto' : 'smooth' });
  }

  function euros(n) {
    return n.toLocaleString((window.I18N && window.I18N.bcp) || 'es-ES', { maximumFractionDigits: 0, useGrouping: 'always' }) + ' €';
  }

  function etiqueta(pregunta) {
    var r = estat.respostes[pregunta];
    if (!r) return '';
    if (pregunta === 'importe') return euros(Number(r.valor));
    var op = pantalla(pregunta).querySelector('.calc-op[data-valor="' + r.valor + '"] .calc-op-nom');
    return op ? op.textContent.trim() : r.valor;
  }

  function marcaEscollides(seccio) {
    var pregunta = seccio.getAttribute('data-pas');
    var r = estat.respostes[pregunta];
    $$('.calc-op', seccio).forEach(function (b) {
      b.setAttribute('aria-pressed', r && b.getAttribute('data-valor') === r.valor ? 'true' : 'false');
    });
  }

  function pintaResum() {
    var llista = $('[data-calc-resum]');
    llista.innerHTML = '';
    preguntes().forEach(function (p, i) {
      if (!estat.respostes[p] || i >= estat.pas) return;
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = etiqueta(p);
      b.setAttribute('aria-label', I18N.t('Cambiar esta respuesta') + ': ' + etiqueta(p));
      b.addEventListener('click', function () { mostra(i, true); });
      li.appendChild(b);
      llista.appendChild(li);
    });
  }

  /* ── Respondre: un clic i avança ───────────────────────────────────── */
  $$('.calc-pas[data-pas]').forEach(function (seccio) {
    var pregunta = seccio.getAttribute('data-pas');
    seccio.addEventListener('click', function (e) {
      var b = e.target.closest('.calc-op');
      if (!b) return;
      var valor = b.getAttribute('data-valor');
      var abans = estat.respostes[pregunta] && estat.respostes[pregunta].valor;
      estat.respostes[pregunta] = { valor: valor };
      // Canviar d'àrea esborra les respostes de l'altra branca.
      if (pregunta === 'area' && abans !== valor) {
        estat.respostes = { area: { valor: valor } };
      }
      // Passar de targeta a hipoteca (o al revés) canvia l'escala de l'import.
      if (pregunta === 'tipo' && abans && (abans === 'revolving') !== (valor === 'revolving')) {
        delete estat.respostes.importe;
      }
      estat.resultat = null;
      marcaEscollides(seccio);
      var i = preguntes().indexOf(pregunta);
      setTimeout(function () { mostra(i + 1); }, redueix ? 0 : 220);
    });
  });

  /* Teclat: 1–4 trien opció a les preguntes. */
  document.addEventListener('keydown', function (e) {
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    var nom = passos()[estat.pas];
    if (preguntes().indexOf(nom) < 0 || !/^[1-4]$/.test(e.key)) return;
    var b = $$('.calc-op', pantalla(nom))[Number(e.key) - 1];
    if (b) b.click();
  });

  $('[data-calc-enrere]').addEventListener('click', function () { mostra(estat.pas - 1, true); });

  /* ── Import: slider amb l'escala de la hipoteca o de la targeta ─────── */
  var slider = $('#calc-importe');
  function pintaImport() {
    var e = escala();
    var v = Number(slider.value);
    $('[data-calc-importe-num]').textContent = euros(v);
    slider.setAttribute('aria-valuetext', euros(v));
    slider.style.setProperty('--pct', ((v - e[0]) / (e[1] - e[0]) * 100) + '%');
  }
  function preparaImport() {
    var e = escala();
    var targeta = e === ESCALA.tarjeta;
    $$('[data-escala]', pantalla('importe')).forEach(function (n) {
      n.hidden = n.getAttribute('data-escala') !== (targeta ? 'tarjeta' : 'hipoteca');
    });
    slider.min = String(e[0]);
    slider.max = String(e[1]);
    slider.step = String(e[2]);
    var desat = estat.respostes.importe ? Number(estat.respostes.importe.valor) : NaN;
    slider.value = String(desat >= e[0] && desat <= e[1] ? desat : e[3]);
    slider.setAttribute('aria-label', targeta ? I18N.t('Total gastado con la tarjeta') : I18N.t('Capital de la hipoteca'));
    $('[data-calc-min]').textContent = euros(e[0]);
    $('[data-calc-max]').textContent = euros(e[1]);
    pintaImport();
  }
  function confirmaImport() {
    estat.respostes.importe = { valor: String(slider.value) };
    estat.resultat = null;
    mostra(preguntes().indexOf('importe') + 1);
  }
  slider.addEventListener('input', pintaImport);
  slider.addEventListener('keydown', function (e) { if (e.key === 'Enter') confirmaImport(); });
  $('[data-calc-continua]').addEventListener('click', confirmaImport);

  /* ── Correu + consentiment + captcha ───────────────────────────────── */
  var formCorreu = $('[data-calc-form-correu]');

  /* A negligències el que s'ha contestat és una dada de salut: el text del
     consentiment ho diu (art. 9 RGPD). La casella és la mateixa. */
  function preparaConsentiment() {
    var salut = estat.respostes.area && estat.respostes.area.valor === 'negligencia';
    $$('[data-consentiment]', formCorreu).forEach(function (n) {
      n.hidden = n.getAttribute('data-consentiment') !== (salut ? 'salud' : 'general');
    });
  }

  var widget = null;
  function preparaCaptcha() {
    if (widget !== null) return;
    var render = function () {
      if (!window.turnstile || widget !== null) return;
      widget = window.turnstile.render('#calc-turnstile', {
        sitekey: TURNSTILE_SITEKEY,
        language: document.documentElement.lang || 'es',
        appearance: 'interaction-only'
      });
    };
    if (window.turnstile) return render();
    window.hechosTurnstile = render;
    var s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=hechosTurnstile';
    s.async = true;
    document.head.appendChild(s);
  }

  function error(seccio, text) {
    $('[data-calc-error]', pantalla(seccio)).textContent = text || '';
  }

  function envia(url, dades) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(dades)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { j.status = r.status; j.ok = r.ok && j.ok !== false; return j; });
    });
  }

  function respostesPerEnviar() {
    var out = {};
    preguntes().forEach(function (p) { out[p] = estat.respostes[p].valor; });
    if (out.importe) out.importe = Number(out.importe);
    return out;
  }

  formCorreu.addEventListener('submit', function (e) {
    e.preventDefault();
    var camp = formCorreu.elements.email;
    var correu = camp.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correu)) {
      camp.setAttribute('aria-invalid', 'true');
      camp.focus();
      return error('correu', I18N.t('Escribe un correo válido, por ejemplo nombre@gmail.com.'));
    }
    camp.setAttribute('aria-invalid', 'false');
    var permis = formCorreu.elements.consentimiento;
    if (!permis.checked) {
      permis.focus();
      return error('correu', I18N.t('Sin marcar la casilla no podemos guardar tu caso ni enseñarte el resultado.'));
    }
    var token = window.turnstile && widget !== null ? window.turnstile.getResponse(widget) : '';
    if (!token) return error('correu', I18N.t('Espera un momento a que termine la comprobación de seguridad y vuelve a pulsar.'));

    var boto = formCorreu.querySelector('button[type="submit"]');
    var text = boto.textContent;
    boto.disabled = true;
    boto.textContent = I18N.t('Enviando…');
    error('correu', '');
    envia('/api/codi', { correu: correu, token: token, idioma: document.documentElement.lang || 'es' })
      .then(function (j) {
        if (j.ok) {
          estat.correu = correu;
          mostra(passos().indexOf('codi'));
          compteEnrere();
        } else if (j.status === 429) {
          error('correu', I18N.t('Has pedido demasiados códigos. Espera unos minutos y vuelve a intentarlo.'));
        } else if (j.error === 'captcha') {
          error('correu', I18N.t('No hemos podido confirmar que no eres un robot. Vuelve a intentarlo.'));
        } else {
          error('correu', I18N.t('No hemos podido enviar el código. Inténtalo de nuevo en unos minutos.'));
        }
      })
      .catch(function () { error('correu', I18N.t('No hemos podido enviar el código. Inténtalo de nuevo en unos minutos.')); })
      .finally(function () {
        boto.disabled = false;
        boto.textContent = text;
        if (window.turnstile && widget !== null) window.turnstile.reset(widget);
      });
  });

  /* ── Codi de 6 xifres ─────────────────────────────────────────────── */
  var caselles = $$('.calc-codi input');
  function codi() { return caselles.map(function (c) { return c.value; }).join(''); }
  function omple(xifres) {
    xifres = xifres.replace(/\D/g, '').slice(0, 6);
    caselles.forEach(function (c, i) { c.value = xifres[i] || ''; });
    var seguent = caselles[Math.min(xifres.length, 5)];
    if (seguent) seguent.focus();
    if (xifres.length === 6) verifica();
  }
  caselles.forEach(function (c, i) {
    c.addEventListener('input', function () {
      if (c.value.length > 1) return omple(c.value);  // enganxat o autocompletat del mòbil
      c.value = c.value.replace(/\D/g, '');
      if (c.value && caselles[i + 1]) caselles[i + 1].focus();
      if (codi().length === 6) verifica();
    });
    c.addEventListener('keydown', function (e) {
      if (e.key === 'Backspace' && !c.value && caselles[i - 1]) caselles[i - 1].focus();
    });
    c.addEventListener('paste', function (e) {
      e.preventDefault();
      omple((e.clipboardData || window.clipboardData).getData('text'));
    });
  });

  var verificant = false;
  function verifica() {
    if (verificant) return;
    verificant = true;
    error('codi', '');
    envia('/api/verifica', { correu: estat.correu, codi: codi(), respostes: respostesPerEnviar(), consentiment: formCorreu.elements.consentimiento.checked, idioma: document.documentElement.lang || 'es' })
      .then(function (j) {
        if (j.ok && j.honoraris && /^(bona|estudiar|risc)$/.test(j.orientacio)) {
          estat.resultat = {
            orientacio: j.orientacio, honoraris: j.honoraris,
            recupera: j.recupera && typeof j.recupera.min === 'number' ? j.recupera : null,
            avisos: Array.isArray(j.avisos) ? j.avisos : [],
            wa: String(j.whatsapp || '').replace(/\D/g, '')
          };
          mostra(passos().indexOf('resultat'));
        } else {
          omple('');
          if (j.error === 'caducat') error('codi', I18N.t('El código ha caducado. Pide uno nuevo.'));
          else if (j.status === 429) error('codi', I18N.t('Demasiados intentos. Pide un código nuevo.'));
          else error('codi', I18N.t('El código no es correcto. Revísalo y vuelve a escribirlo.'));
        }
      })
      .catch(function () { error('codi', I18N.t('No hemos podido comprobar el código. Inténtalo de nuevo.')); })
      .finally(function () { verificant = false; });
  }

  var reenvia = $('[data-calc-reenvia]');
  var rellotge = null;
  function compteEnrere() {
    var s = 30;
    reenvia.disabled = true;
    clearInterval(rellotge);
    rellotge = setInterval(function () {
      s--;
      if (s <= 0) { clearInterval(rellotge); reenvia.disabled = false; }
    }, 1000);
  }
  reenvia.addEventListener('click', function () { mostra(passos().indexOf('correu'), true); });
  $('[data-calc-canvia-correu]').addEventListener('click', function () { mostra(passos().indexOf('correu'), true); });

  /* ── Resultat: l'escrit ───────────────────────────────────────────── */
  /* Funcions i no constants: així cada text passa per I18N.t en l'idioma
     del moment, i l'extractor d'idiomes troba les frases literals. */
  var ORDINALS = function () { return [I18N.t('Primero'), I18N.t('Segundo'), I18N.t('Tercero'), I18N.t('Cuarto'), I18N.t('Quinto')]; };
  var AREES = function () { return { divorcio: I18N.t('Divorcio o separación'), negligencia: I18N.t('Negligencia médica'), clausulas: I18N.t('Hipoteca o tarjeta') }; };
  var FETS = function () { return {
    acuerdo: { todo: I18N.t('Estáis de acuerdo en todo.'), parte: I18N.t('Estáis de acuerdo en parte.'), no: I18N.t('No estáis de acuerdo.') },
    hijos: { si: I18N.t('Hay hijos menores.'), no: I18N.t('No hay hijos menores.') },
    bienes: { si: I18N.t('Hay vivienda o bienes en común.'), no: I18N.t('No hay vivienda ni bienes en común.') },
    cuando: { ya: I18N.t('Quieres empezar lo antes posible.'), meses: I18N.t('Quieres empezar en los próximos meses.'), informando: I18N.t('De momento solo te estás informando.') },
    donde: { publica: I18N.t('Te atendieron en la sanidad pública.'), privada: I18N.t('Te atendieron en la sanidad privada o en una mutua.') },
    fecha: { menos1: I18N.t('Pasó hace menos de 1 año.'), '1a5': I18N.t('Pasó hace entre 1 y 5 años.'), mas5: I18N.t('Pasó hace más de 5 años.') },
    secuelas: { duran: I18N.t('Te han quedado secuelas que duran.'), temporales: I18N.t('Las consecuencias fueron temporales y ya te has recuperado.'), fallecimiento: I18N.t('Falleció un familiar.') },
    informes: { si: I18N.t('Tienes los informes o la historia clínica.'), parte: I18N.t('Tienes parte de los informes.'), no: I18N.t('Todavía no tienes los informes.') },
    tipo: { suelo: I18N.t('Te preocupa la cláusula suelo.'), gastos: I18N.t('Te preocupan los gastos de la hipoteca.'), irph: I18N.t('Tu hipoteca va referenciada al IRPH.'), revolving: I18N.t('Tienes una tarjeta revolving.') },
    firma: { antes2013: I18N.t('La firmaste antes de 2013.'), '2013a2019': I18N.t('La firmaste entre 2013 y 2019.'), despues2019: I18N.t('La firmaste después de 2019.') },
    reclamado: { no: I18N.t('Todavía no has reclamado al banco.'), sinrespuesta: I18N.t('Reclamaste al banco y no te contestó.'), denegado: I18N.t('Reclamaste al banco y te dijo que no.') }
  }; };
  var ORIENTACIONS = function () { return { bona: I18N.t('Tiene buena pinta'), estudiar: I18N.t('Hay que estudiarlo'), risc: I18N.t('El plazo puede estar en riesgo: llámanos hoy') }; };
  var EXPLICA = function () { return {
    divorcio: {
      bona: I18N.t('Estáis de acuerdo en todo y no hay hijos ni bienes que compliquen el reparto: normalmente es el proceso más corto.'),
      estudiar: I18N.t('Hay hijos, vivienda o bienes en común, o solo estáis de acuerdo en parte: antes de darte un precio cerrado hay que mirarlo con calma.')
    },
    negligencia: {
      bona: I18N.t('Todavía estás dentro del plazo y tienes informes o parte de la historia clínica: hay con qué empezar a mirarlo.'),
      estudiar: I18N.t('Falta documentación o las consecuencias no están claras todavía: hace falta un estudio de viabilidad antes de decir nada.'),
      risc: I18N.t('Por las fechas, el plazo general para reclamar puede haber pasado o estar a punto de cerrarse. A veces se interrumpe o empieza a contar más tarde: llámanos hoy y lo miramos.')
    },
    clausulas: {
      bona: I18N.t('Es de las cláusulas que los jueces han anulado muchas veces: hay margen para reclamar.'),
      estudiar: I18N.t('Tu caso es de los que hay que analizar papel a papel antes de decir nada.')
    }
  }; };
  var PLAZOS = function () { return {
    divorcio: I18N.t('No hay un plazo legal para divorciarte. Si hay hijos, la pensión de alimentos se debe desde que se presenta la demanda.'),
    negligencia: I18N.t('En sanidad pública, en general 1 año desde que te curas o se fijan las secuelas. En sanidad privada, 5 años si había contrato con la clínica o la mutua; si no, 1. Siempre depende del caso.'),
    clausulas: I18N.t('No hay un plazo único: depende del tipo de cláusula, de las fechas y de si ya reclamaste antes.')
  }; };
  var AVISOS = function () { return {
    alimentos: I18N.t('Con hijos, conviene no esperar: la pensión de alimentos cuenta desde la demanda, no desde la separación.'),
    notaria: I18N.t('Sin hijos menores y de acuerdo en todo, también se puede firmar ante notario, sin pasar por el juzgado.'),
    historia: I18N.t('Pedir tu historia clínica es un derecho y no cuesta nada. Te decimos cómo pedirla.'),
    ley2019: I18N.t('Desde 2019 la ley ya pone la mayoría de estos gastos a cargo del banco: hay que ver qué te cobraron.'),
    denegado: I18N.t('Que el banco te haya dicho que no es lo habitual y no cierra nada: el paso siguiente es el juzgado.')
  }; };

  function textHonoraris(h) {
    if (h.tipus === 'tancat') {
      return I18N.t('Precio cerrado orientativo de {min} a {max} + IVA. Procurador y notaría, aparte.')
        .replace('{min}', euros(h.min)).replace('{max}', euros(h.max));
    }
    if (h.tipus === 'litis') return I18N.t('Estudio de viabilidad gratis. Si seguimos: provisión de 450 € y un 12–18 % de lo que se cobre, + IVA. Informe pericial aparte (900–2.500 €).');
    return I18N.t('0 € por adelantado. Cobramos de las costas del banco o, si no las paga, un 10–15 % de lo recuperado, + IVA.');
  }

  function pintaResultat() {
    var r = estat.resultat;
    var area = estat.respostes.area.valor;
    var P = BRANQUES[area];

    $('[data-calc-area]').textContent = AREES()[area];
    var ol = $('[data-calc-fets]');
    ol.innerHTML = '';
    var fets = P.map(function (p) {
      return p === 'importe'
        ? (estat.respostes.tipo.valor === 'revolving' ? I18N.t('Llevas gastado con la tarjeta unos {x}.') : I18N.t('El capital de tu hipoteca es de unos {x}.')).replace('{x}', euros(Number(estat.respostes.importe.valor)))
        : FETS()[p][estat.respostes[p].valor];
    });
    fets.forEach(function (f, i) {
      var li = document.createElement('li');
      var b = document.createElement('strong');
      b.textContent = ORDINALS()[i] + '. ';
      li.appendChild(b);
      li.appendChild(document.createTextNode(f));
      ol.appendChild(li);
    });

    var veredicte = $('[data-calc-orientacio]');
    veredicte.textContent = ORIENTACIONS()[r.orientacio];
    veredicte.setAttribute('data-orientacio', r.orientacio);
    $('[data-calc-explica]').textContent = EXPLICA()[area][r.orientacio];

    var bloc = $('[data-calc-recupera-bloc]');
    bloc.hidden = !r.recupera;
    if (r.recupera) $('[data-calc-recupera]').textContent = euros(r.recupera.min) + ' – ' + euros(r.recupera.max);

    $('[data-calc-plazo]').textContent = PLAZOS()[area];
    $('[data-calc-honoraris]').textContent = textHonoraris(r.honoraris);

    var avisos = $('[data-calc-avisos]');
    avisos.innerHTML = '';
    r.avisos.forEach(function (clau) {
      var textos = AVISOS();
      if (!textos[clau]) return;
      var p = document.createElement('p');
      p.textContent = textos[clau];
      avisos.appendChild(p);
    });
    avisos.hidden = !avisos.children.length;

    var missatge = I18N.t('Hola, he hecho el test de Hechos Abogados. Área: {area}. Resumen: {resumen} Orientación: {orientacion}. ¿Podemos hablar?')
      .replace('{area}', AREES()[area])
      .replace('{resumen}', fets.join(' '))
      .replace('{orientacion}', ORIENTACIONS()[r.orientacio]);
    var wa = $('[data-calc-wa]');
    wa.hidden = !r.wa;
    wa.href = 'https://wa.me/' + r.wa + '?text=' + encodeURIComponent(missatge);
  }

  $('[data-calc-reinicia]').addEventListener('click', function () {
    estat = { pas: 0, respostes: {}, correu: estat.correu, resultat: null };
    mostra(0, true);
  });

  /* Canvi d'idioma sense recarregar: repinta el que surt del JS. */
  document.addEventListener('idioma-canviat', function () {
    pintaResum();
    var nom = passos()[estat.pas];
    if (nom === 'importe') preparaImport();
    if (nom === 'resultat' && estat.resultat) pintaResultat();
  });

  mostra(estat.pas);
})();
