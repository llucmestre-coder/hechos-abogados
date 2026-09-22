/* =========================================================================
   HECHOS ABOGADOS — comportament comú
   - Sense JS o amb prefers-reduced-motion, tot el contingut es veu igual.
   - Textos escrits des del JS: sempre I18N.t amb la frase castellana literal,
     perquè el verificador i l'extractor d'idiomes els trobin.
   ========================================================================= */
(function () {
  'use strict';

  if (!window.I18N) window.I18N = { t: function (s) { return s; } };
  var redueix = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Menú mòbil ─────────────────────────────────────────────────────── */
  var obre = document.querySelector('.nav-obre');
  var nav = document.getElementById('nav');
  if (obre && nav) {
    var tanca = function () {
      obre.setAttribute('aria-expanded', 'false');
      nav.classList.remove('obert');
    };
    obre.addEventListener('click', function () {
      var obert = obre.getAttribute('aria-expanded') === 'true';
      obre.setAttribute('aria-expanded', String(!obert));
      nav.classList.toggle('obert', !obert);
    });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) tanca(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && obre.getAttribute('aria-expanded') === 'true') { tanca(); obre.focus(); }
    });
  }

  /* Pàgina actual al menú */
  var aqui = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav a').forEach(function (a) {
    if (a.getAttribute('href') === aqui) a.setAttribute('aria-current', 'page');
  });

  /* ── Formulari de contacte (Formspree, enviament real) ──────────────── */
  var form = document.getElementById('form-contacto');
  if (form) {
    // contacto.html?area=divorcio|negligencia|clausulas preselecciona l'àrea
    var area = new URLSearchParams(location.search).get('area');
    if (area && form.elements['area'] && /^(divorcio|negligencia|clausulas|otra)$/.test(area)) form.elements['area'].value = area;

    var estat = form.querySelector('.form-estat');
    var boto = form.querySelector('button[type="submit"]');
    var textBoto = boto ? boto.textContent : '';
    var mostra = function (tipus, missatge) {
      estat.hidden = false;
      estat.setAttribute('data-tipus', tipus);
      estat.textContent = missatge;
      estat.focus();
    };
    var marca = function (camp, error) {
      var caixa = camp.closest('.camp');
      var msg = caixa && caixa.querySelector('.camp-error');
      camp.setAttribute('aria-invalid', error ? 'true' : 'false');
      if (msg) msg.textContent = error || '';
    };

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var nom = form.elements['nombre'];
      var correu = form.elements['email'];
      var tel = form.elements['telefono'];
      var privacitat = form.elements['privacidad'];
      var errors = 0;
      marca(nom, nom.value.trim() ? '' : I18N.t('Escribe tu nombre.'));
      if (!nom.value.trim()) errors++;
      var correuOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correu.value.trim());
      marca(correu, correuOk ? '' : I18N.t('Escribe un correo válido, por ejemplo nombre@gmail.com.'));
      if (!correuOk) errors++;
      // El telèfon és opcional; si l'escriuen, que tingui com a mínim 9 xifres.
      var telOk = !tel.value.trim() || tel.value.replace(/\D/g, '').length >= 9;
      marca(tel, telOk ? '' : I18N.t('Escribe un teléfono de al menos 9 cifras.'));
      if (!telOk) errors++;
      marca(privacitat, privacitat.checked ? '' : I18N.t('Marca la casilla para poder enviarnos tu consulta.'));
      if (!privacitat.checked) errors++;
      if (errors) {
        var primer = form.querySelector('[aria-invalid="true"]');
        if (primer) primer.focus();
        return;
      }

      boto.disabled = true;
      boto.textContent = I18N.t('Enviando…');
      fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' }
      }).then(function (r) {
        if (!r.ok) throw new Error(String(r.status));
        form.reset();
        mostra('ok', I18N.t('Recibido. Te llamamos hoy mismo o mañana por la mañana.'));
      }).catch(function () {
        mostra('error', I18N.t('No se ha podido enviar. Llámanos al 600 000 000 y te atendemos directamente.'));
      }).finally(function () {
        boto.disabled = false;
        boto.textContent = textBoto;
      });
    });
  }
})();
