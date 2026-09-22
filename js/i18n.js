/* ═══════════════════════════════════════════════════════════════
   i18n.js — Motor de traducció (Català · Castellà · Anglès)

   CÒPIA CANÒNICA: recursos-comuns/i18n.js. Totes les webs en porten una
   còpia idèntica byte a byte; si el millores, millora aquest i torna'l
   a copiar a totes (recursos-comuns/comprova-i18n.mjs --motor ho comprova).

   COM FUNCIONA, EN QUATRE LÍNIES

   1. La pàgina està escrita en l'IDIOMA DEL NEGOCI —l'IDIOMA BASE— i
      aquest és el que hi ha a l'HTML: el declara el `lang` de l'etiqueta
      <html>. Si aquest fitxer no s'executa, la web es veu sencera i en
      l'idioma base: no hi ha cap text que depengui del JS per existir.
   2. La clau del diccionari és el MATEIX TEXT DE L'IDIOMA BASE. No hi ha
      claus inventades (`hero.titol`) escampades per l'HTML: es recorren
      els nodes de text i es busca el que hi diu.
   3. Per això falla bé: si algun dia es canvia una frase de l'idioma base
      i ningú toca el diccionari, allò es queda en l'idioma base. Mai surt
      un text antic o equivocat en un altre idioma.
   4. Les traduccions són a js/traduccions.js, que es carrega al final
      del <body> i crida I18N.inicia(). El diccionari hi té una entrada
      per a cada idioma que NO sigui el base: una web en castellà hi porta
      `TRAD.ca` i `TRAD.en`; una web en català, `TRAD.es` i `TRAD.en`.

   ON VA CADA COSA
   - Aquest fitxer va al <head>, abans que es pinti res: així la barra
     de dalt ja neix amb el desplegable si hi ha JS, i sense JS el
     desplegable no arriba a existir (regla de la §4 del playbook:
     res que no funcioni no s'ensenya).
   - js/traduccions.js va al final del <body>, abans dels altres
     scripts, perquè main.js i companyia ja trobin window.I18N llest.

   QUÈ HI HA PER A QUI ESCRIU UNA PÀGINA
   - `data-sense-traduir` en un element: ni ell ni el que porti a dins
     es tradueixen (noms propis, el mateix desplegable d'idiomes).
   - `data-nomes-idioma="es en"`: l'element només es veu en aquests
     idiomes. S'usa per a la nota «traducció de l'original», quan cal
     avisar que una citació no és de l'idioma base — una citació no es
     toca sense dir-ho.
   - `I18N.t('Text de l'idioma base amb {n}', { n: 5 })` des de qualsevol
     script.
   - `document.addEventListener('idioma-canviat', …)` per a tot el que
     es pinta des del JS i s'ha de repintar.

   PER REVISAR-HO: obriu qualsevol pàgina amb ?lang=en&i18n=debug i la
   consola us dirà quines frases encara no tenen traducció.

   SEO: qui indexa Google és la versió en l'idioma base, que és la que
   hi ha a l'HTML. Els altres idiomes són per a qui visita la web, no
   per a posicionar. Si algun dia es vol posicionar en un altre idioma,
   això demana pàgines separades (/es/…), no aquest sistema.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var IDIOMES = [
    { codi: 'ca', curt: 'CA', nom: 'Català',     og: 'ca_ES', bcp: 'ca-ES' },
    { codi: 'es', curt: 'ES', nom: 'Castellano', og: 'es_ES', bcp: 'es-ES' },
    { codi: 'en', curt: 'EN', nom: 'English',    og: 'en_GB', bcp: 'en-GB' }
  ];

  var arrel = document.documentElement;
  var CLAU  = 'idioma';       /* on es desa la tria del visitant    */

  function fitxa(codi) {
    for (var i = 0; i < IDIOMES.length; i++) {
      if (IDIOMES[i].codi === codi) return IDIOMES[i];
    }
    return null;
  }

  /* BASE es llegeix del `lang` que ja porta l'HTML, ABANS que aquest
     script el toqui: és l'idioma en què està escrit el negoci, no un
     valor fix. Si l'HTML no en declara cap que coneguem, es cau a 'ca'. */
  var baseDeclarada = (arrel.getAttribute('lang') || 'ca').toLowerCase().slice(0, 2);
  var BASE = fitxa(baseDeclarada) ? baseDeclarada : 'ca';

  function normalitza(s) {
    /* \s de JavaScript ja inclou l'espai dur i els espais fins */
    return String(s).replace(/\s+/g, ' ').trim();
  }

  /* ── Quin idioma toca ────────────────────────────────────────
     Ordre: el que digui l'URL, després el que el visitant va triar
     l'última vegada, i si no, l'idioma base.

     NO es mira l'idioma del navegador a posta. Molta gent té el
     navegador en un idioma diferent del d'aquest negoci i hi entra
     igualment sense cap problema; canviar-los-el sols seria decidir
     per ells i deixar la casa parlant en un idioma que no és el seu.
     Per defecte, doncs, es queda a l'idioma base.                */

  function desitjat() {
    var m = /[?&](?:lang|idioma)=([a-zA-Z-]+)/.exec(window.location.search);
    if (m) {
      var demanat = m[1].toLowerCase().slice(0, 2);
      if (fitxa(demanat)) return demanat;
    }
    try {
      var desat = window.localStorage.getItem(CLAU);
      if (desat && fitxa(desat)) return desat;
    } catch (e) { /* navegació privada: no es pot desar res */ }
    return BASE;
  }

  var idioma = desitjat();

  /* Marques primerenques, abans que es pinti res:
     - `te-js`   → el CSS ja pot ensenyar el desplegable d'idiomes.
     - `lang`    → lectors de pantalla i corrector del navegador.
     - `i18n-pendent` → tapa el mig segon en què la pàgina encara és en
       l'idioma base i el diccionari no ha arribat. Només si NO estem en
       l'idioma base, que és el cas normal. Amb xarxa de seguretat: si
       traduccions.js no carregués, al segon i mig es destapa igualment. */

  arrel.classList.add('te-js');
  arrel.lang = idioma;
  arrel.setAttribute('data-idioma', idioma);

  if (idioma !== BASE) {
    arrel.classList.add('i18n-pendent');
    window.setTimeout(function () { arrel.classList.remove('i18n-pendent'); }, 1500);
  }

  /* ── Registre del que es pot traduir ─────────────────────────
     Es recull UNA vegada, amb l'original desat a part. Així canviar
     d'idioma tres cops seguits no degrada res: sempre es tradueix des
     de l'idioma base, mai d'una traducció.                       */

  /* `data-alt` hi és perquè els espais de fotografia hi guarden el text
     alternatiu fins que la fotografia de debò arriba. */
  var ATRIBUTS = ['alt', 'title', 'aria-label', 'placeholder',
                  'data-alt', 'data-mapa-titol'];

  var textos   = [];   /* { node, pre, post, original } */
  var atributs = [];   /* { el, atribut, original }     */
  var metes    = [];   /* { el, original }              */
  var enllacos = [];   /* { el, href }                  */
  var cites    = [];   /* { el, original, font }        */
  var condicionals = [];
  var elTitol  = null;
  var titolOriginal = '';
  var recollit = false;

  function tePart(el) {
    /* Puja fins a dalt buscant motius per no tocar aquest text */
    while (el && el.nodeType === 1) {
      var etiqueta = el.tagName;
      if (etiqueta === 'SCRIPT' || etiqueta === 'STYLE' || etiqueta === 'TEXTAREA') return false;
      if (el.hasAttribute('data-sense-traduir')) return false;
      if (el.getAttribute('translate') === 'no') return false;
      el = el.parentNode;
    }
    return true;
  }

  /* Un text sense cap lletra no és una frase: és un telèfon, una xifra,
     un «·», un «★★★★★» o un «→». No es busca al diccionari i no surt a
     la llista de coses per traduir. */
  function teLletres(s) { return /[a-zA-ZÀ-ÿ]/.test(s); }

  function recull() {
    if (recollit) return;
    recollit = true;

    var passeig = document.createTreeWalker(
      document.body, NodeFilter.SHOW_TEXT, null, false);
    var node;

    while ((node = passeig.nextNode())) {
      var brut = node.nodeValue;
      if (!brut || !/\S/.test(brut)) continue;
      if (!tePart(node.parentNode)) continue;

      var net = normalitza(brut);
      if (!net || !teLletres(net)) continue;

      textos.push({
        node: node,
        pre:  brut.match(/^\s*/)[0],
        post: brut.match(/\s*$/)[0],
        original: net
      });
    }

    var ambAtribut = document.querySelectorAll(
      '[' + ATRIBUTS.join('],[') + ']');

    Array.prototype.forEach.call(ambAtribut, function (el) {
      if (!tePart(el)) return;
      ATRIBUTS.forEach(function (a) {
        var v = el.getAttribute(a);
        if (!v || !teLletres(v)) return;
        atributs.push({ el: el, atribut: a, original: normalitza(v) });
      });
    });

    elTitol = document.querySelector('title');
    if (elTitol) titolOriginal = normalitza(elTitol.textContent);

    Array.prototype.forEach.call(
      document.querySelectorAll('meta[name="description"], ' +
        'meta[property="og:title"], meta[property="og:description"]'),
      function (el) { metes.push({ el: el, original: normalitza(el.content) }); });

    Array.prototype.forEach.call(
      document.querySelectorAll('a[href]'),
      function (el) { enllacos.push({ el: el, href: el.getAttribute('href') }); });

    condicionals = Array.prototype.slice.call(
      document.querySelectorAll('[data-nomes-idioma]'));

    Array.prototype.forEach.call(
      document.querySelectorAll('[data-idioma-original]'),
      function (el) {
        cites.push({
          el: el,
          original: el.getAttribute('data-idioma-original'),
          font: normalitza(el.textContent)
        });
      });
  }

  /* ── Aplicar ─────────────────────────────────────────────────── */

  var faltenles = [];

  function diccionari() {
    return (window.TRAD && window.TRAD[idioma]) || null;
  }

  function tradueix(original, dic) {
    if (!dic) return original;
    var v = dic[original];
    if (v) return v;
    if (idioma !== BASE && faltenles.indexOf(original) === -1 &&
        !(window.TRAD && window.TRAD.igual &&
          window.TRAD.igual.indexOf(original) !== -1)) {
      faltenles.push(original);
    }
    return original;
  }

  function aplica() {
    var dic = diccionari();
    faltenles = [];

    textos.forEach(function (t) {
      t.node.nodeValue = t.pre + tradueix(t.original, dic) + t.post;
    });

    atributs.forEach(function (a) {
      a.el.setAttribute(a.atribut, tradueix(a.original, dic));
    });

    if (elTitol && titolOriginal) {
      document.title = tradueix(titolOriginal, dic);
    }

    metes.forEach(function (m) {
      m.el.setAttribute('content', tradueix(m.original, dic));
    });

    var locale = document.querySelector('meta[property="og:locale"]');
    if (locale) locale.setAttribute('content', fitxa(idioma).og);

    /* Blocs que només tenen sentit en algun idioma (la nota de
       «traducció de l'original», per exemple) */
    condicionals.forEach(function (el) {
      var quins = el.getAttribute('data-nomes-idioma').split(/\s+/);
      el.hidden = quins.indexOf(idioma) === -1;
    });

    posaLangALesCites();
    arrel.lang = idioma;
    arrel.setAttribute('data-idioma', idioma);
    arrel.classList.remove('i18n-pendent');

    if (/[?&]i18n=debug/.test(window.location.search)) informe();
  }

  /* Una citació traduïda ja no és en l'idioma en què es va escriure: si
     no s'hi toca el `lang`, un lector de pantalla la llegeix amb la
     fonètica que no toca i no s'entén res.

     `data-idioma-original` diu en quina llengua la va escriure qui la va
     escriure. Aquí es mira si el text que es veu ARA és encara aquell
     —perquè no hi havia traducció, o perquè l'idioma actiu ja és el seu—
     i es posa el `lang` que toqui de debò. Hi pot haver una citació en
     un idioma dins d'una web escrita en un altre: no n'hi ha prou de
     posar-hi l'idioma de la pàgina. */
  function posaLangALesCites() {
    cites.forEach(function (c) {
      var canviada = normalitza(c.el.textContent) !== c.font;
      c.el.lang = canviada ? idioma : c.original;
    });
  }

  function informe() {
    if (!window.console) return;
    if (!faltenles.length) {
      window.console.info('[i18n] ' + idioma + ': tot traduït.');
      return;
    }
    window.console.warn('[i18n] ' + idioma + ': ' + faltenles.length +
                        ' frases sense traduir en aquesta pàgina.');
    window.console.log(JSON.stringify(faltenles, null, 2));
  }

  /* ── L'URL i els enllaços interns ────────────────────────────
     La tria es desa al navegador, però també viatja a l'URL, per dues
     raons: perquè un enllaç es pugui passar a algú ja en el seu idioma,
     i perquè en navegació privada (on no es pot desar res) l'idioma no
     es perdi en canviar de pàgina.                                  */

  function ambIdioma(href) {
    if (/^(https?:|tel:|mailto:|\/\/|#)/i.test(href)) return href;

    var tros = href.split('#');
    var cami = tros[0];
    var ancora = tros[1] ? '#' + tros[1] : '';
    if (!cami) return href;

    cami = cami.replace(/([?&])(?:lang|idioma)=[^&]*&?/g, '$1')
               .replace(/[?&]$/, '');

    if (idioma !== BASE) {
      cami += (cami.indexOf('?') === -1 ? '?' : '&') + 'lang=' + idioma;
    }
    return cami + ancora;
  }

  function actualitzaEnllacos() {
    enllacos.forEach(function (e) {
      var nou = ambIdioma(e.href);
      if (nou !== e.el.getAttribute('href')) e.el.setAttribute('href', nou);
    });
  }

  function actualitzaURL() {
    if (!window.history || !window.history.replaceState) return;

    var cerca = window.location.search
      .replace(/([?&])(?:lang|idioma)=[^&]*&?/g, '$1')
      .replace(/[?&]$/, '');

    if (idioma !== BASE) {
      cerca += (cerca ? '&' : '?') + 'lang=' + idioma;
    }
    window.history.replaceState(null, '',
      window.location.pathname + cerca + window.location.hash);
  }

  /* ── El desplegable ──────────────────────────────────────────── */

  function muntaTria(caixa) {
    var boto = caixa.querySelector('[data-idioma-boto]');
    var menu = caixa.querySelector('[data-idioma-menu]');

    var opcions = Array.prototype.slice.call(
      caixa.querySelectorAll('[data-idioma-opcio]'));
    if (!opcions.length) return;

    /* Hi ha dues formes del mateix control: el desplegable de la barra
       de dalt (botó + llista) i, al calaix del mòbil, els tres idiomes
       a la vista sense desplegar res. La segona no té botó ni menú:
       només les tres opcions. */
    if (!boto || !menu) {
      opcions.forEach(function (op) {
        op.addEventListener('click', function () {
          canvia(op.getAttribute('data-idioma-opcio'));
        });
      });
      caixa.pinta = function () { marcaActiu(opcions); };
      caixa.pinta();
      return;
    }

    function obre(cert) {
      boto.setAttribute('aria-expanded', String(cert));
      menu.hidden = !cert;
      if (cert) {
        var actiu = menu.querySelector('[aria-current="true"]') || opcions[0];
        if (actiu) actiu.focus();
      }
    }

    boto.addEventListener('click', function () {
      obre(boto.getAttribute('aria-expanded') !== 'true');
    });

    opcions.forEach(function (op, i) {
      op.addEventListener('click', function () {
        canvia(op.getAttribute('data-idioma-opcio'));
        obre(false);
        boto.focus();
      });

      /* Fletxes amunt i avall dins del menú, com qualsevol desplegable */
      op.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          var seguent = (i + (e.key === 'ArrowDown' ? 1 : -1) + opcions.length) %
                        opcions.length;
          opcions[seguent].focus();
        }
      });
    });

    caixa.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (boto.getAttribute('aria-expanded') !== 'true') return;
      obre(false);
      boto.focus();
    });

    document.addEventListener('click', function (e) {
      if (boto.getAttribute('aria-expanded') !== 'true') return;
      if (!caixa.contains(e.target)) obre(false);
    });

    caixa.pinta = function () {
      var etiqueta = boto.querySelector('[data-idioma-actual]');
      if (etiqueta) etiqueta.textContent = fitxa(idioma).curt;
      marcaActiu(opcions);
    };
    caixa.pinta();
  }

  function marcaActiu(opcions) {
    opcions.forEach(function (op) {
      if (op.getAttribute('data-idioma-opcio') === idioma) {
        op.setAttribute('aria-current', 'true');
      } else {
        op.removeAttribute('aria-current');
      }
    });
  }

  var caixes = [];

  function pintaTries() {
    caixes.forEach(function (c) { if (c.pinta) c.pinta(); });
  }

  /* ── API pública ─────────────────────────────────────────────── */

  function t(text, valors) {
    var dic = diccionari();
    var clau = normalitza(text);
    var sortida = (dic && dic[clau]) || clau;

    if (!dic || !dic[clau]) {
      if (idioma !== BASE && faltenles.indexOf(clau) === -1) faltenles.push(clau);
    }
    if (valors) {
      sortida = sortida.replace(/\{(\w+)\}/g, function (tot, nom) {
        return valors[nom] != null ? valors[nom] : tot;
      });
    }
    return sortida;
  }

  function canvia(codi) {
    if (!fitxa(codi)) return;
    idioma = codi;
    window.I18N.idioma = codi;
    window.I18N.bcp = fitxa(codi).bcp;

    try { window.localStorage.setItem(CLAU, codi); } catch (e) { /* privada */ }

    aplica();
    actualitzaURL();
    actualitzaEnllacos();
    pintaTries();

    document.dispatchEvent(new CustomEvent('idioma-canviat',
      { detail: { idioma: codi } }));
  }

  function inicia() {
    recull();
    caixes = Array.prototype.slice.call(
      document.querySelectorAll('[data-idioma-tria]'));
    caixes.forEach(muntaTria);
    aplica();
    actualitzaEnllacos();
    pintaTries();
  }

  window.I18N = {
    idioma: idioma,
    bcp: fitxa(idioma).bcp,
    base: BASE,
    idiomes: IDIOMES,
    t: t,
    canvia: canvia,
    inicia: inicia
  };
})();
