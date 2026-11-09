(function () {
  'use strict';
  var app = document.getElementById('app'), nav = document.getElementById('nav');
  var state = { me: null, profile: null, meta: { cities: [], categories: [] } };
  var COLORS = ['#ff5a3c', '#2b2a6b', '#17924b', '#c2338a', '#0e7fa6', '#8a5a00'];

  // ---------- helpers ----------
  function h(tag, attrs) {
    var el = document.createElement(tag);
    for (var k in (attrs || {})) {
      var v = attrs[k];
      if (k === 'class') el.className = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
    }
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(function (x) { add(el, x); });
    else el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
  function api(method, url, body) {
    return fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) { var e = new Error(j.error || 'Xatolik'); e.status = r.status; throw e; } return j; }); });
  }
  function toast(t) {
    var el = document.getElementById('toast'); el.textContent = t; el.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }
  function money(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' so’m'; }
  function avatar(name, id) {
    var ini = name.split(/\s+/).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase();
    return h('div', { class: 'avatar', style: 'background:' + COLORS[id % COLORS.length], 'aria-hidden': 'true' }, ini);
  }
  function chips(list) { return h('div', { class: 'chips' }, list.map(function (c) { return h('span', { class: 'chip' }, c); })); }
  function mCard(m) {
    return h('a', { class: 'card', href: '#/m/' + m.id },
      h('div', { class: 'row' }, avatar(m.name, m.id),
        h('div', null, h('h3', null, m.name), h('div', { class: 'mute small' }, m.city))),
      chips(m.categories),
      h('p', { class: 'mute small' }, m.bio.length > 90 ? m.bio.slice(0, 90) + '…' : m.bio),
      h('div', { class: 'row', style: 'justify-content:space-between;margin-top:auto' },
        h('span', { class: 'price' }, money(m.price_from) + ' dan'),
        h('span', { class: 'rating' }, m.rating.toFixed(1) + ' (' + m.reviews + ')')));
  }
  function select(opts, first, value) {
    var s = h('select', null, h('option', { value: '' }, first));
    opts.forEach(function (o) { s.appendChild(h('option', { value: o }, o)); });
    if (value) s.value = value;
    return s;
  }
  function render() { var r = route(); app.replaceChildren(); r(); window.scrollTo(0, 0); }

  // ---------- nav ----------
  function drawNav() {
    nav.replaceChildren(
      h('a', { href: '#/mobilograflar' }, 'Mobilograflar'),
      state.me ? [
        h('a', { href: '#/kabinet' }, state.me.name.split(' ')[0]),
        h('button', { onclick: logout }, 'Chiqish')
      ] : [
        h('a', { href: '#/kirish' }, 'Kirish'),
        h('a', { class: 'cta', href: '#/kirish?signup=1' }, 'Ro’yxatdan o’tish')
      ]);
  }
  function logout() { api('POST', '/api/auth/logout').then(function () { state.me = null; state.profile = null; drawNav(); location.hash = '#/'; toast('Chiqdingiz'); }); }

  // ---------- views ----------
  function home() {
    var city = select(state.meta.cities, 'Barcha shaharlar'), cat = select(state.meta.categories, 'Tadbir turi');
    var search = h('form', { class: 'search', onsubmit: function (e) {
      e.preventDefault();
      var q = []; if (city.value) q.push('city=' + encodeURIComponent(city.value)); if (cat.value) q.push('category=' + encodeURIComponent(cat.value));
      location.hash = '#/mobilograflar' + (q.length ? '?' + q.join('&') : '');
    } }, city, cat, h('button', { class: 'btn', type: 'submit' }, 'Topish'));
    var top = h('div', { class: 'grid' });
    app.append(
      h('section', { class: 'hero' },
        h('div', null,
          h('h1', null, 'To’y yoki tug’ilgan kuningiz uchun mobilograf toping'),
          h('p', { class: 'lead' }, 'Ishonchli suratchi va videograflarni toping, narxni oldindan bilib oling.'),
          search),
        h('div', { class: 'hero-art', 'aria-hidden': 'true' })),
      h('section', null, h('h2', null, 'Mashhur mobilograflar'), top),
      h('section', { class: 'section' }, h('h2', null, 'Qanday ishlaydi'),
        h('div', { class: 'steps' },
          [['Qidiring', 'Shahar va tadbir turi bo’yicha mobilografni tanlang.'], ['So’rov yuboring', 'Sana va tafsilotlarni yozing, narx oldindan ko’rinadi.'], ['Kelishing', 'Mobilograf so’rovni qabul qiladi va siz bilan bog’lanadi.']]
            .map(function (s, i) { return h('div', { class: 'card step' }, h('b', null, i + 1), h('h3', null, s[0]), h('p', { class: 'mute' }, s[1])); }))),
      h('section', { class: 'banner' },
        h('div', null, h('h2', null, 'Mobilografmisiz?'), h('p', null, 'Profil yarating va yangi buyurtmalar oling.')),
        h('a', { class: 'btn', href: '#/kirish?signup=1' }, 'Mobilograf bo’lib ishlash')));
    api('GET', '/api/mobilografs?sort=rating').then(function (d) { d.items.slice(0, 4).forEach(function (m) { top.appendChild(mCard(m)); }); });
  }

  function list(query) {
    var p = new URLSearchParams(query || '');
    var q = h('input', { type: 'search', placeholder: 'Ism yoki kalit so’z', value: p.get('q') || '', 'aria-label': 'Qidirish' });
    var city = select(state.meta.cities, 'Shahar', p.get('city')), cat = select(state.meta.categories, 'Tadbir turi', p.get('category'));
    var max = select(['500000', '1000000', '1500000', '2000000'], 'Narx (gacha)', p.get('max'));
    [].forEach.call(max.options, function (o, i) { if (i) o.textContent = money(o.value) + ' gacha'; });
    var sort = h('select', { 'aria-label': 'Saralash' }, h('option', { value: 'rating' }, 'Reyting bo’yicha'), h('option', { value: 'price' }, 'Arzonroq avval'));
    sort.value = p.get('sort') || 'rating';
    var out = h('div', { class: 'grid' }), t;
    function load() {
      var u = new URLSearchParams();
      if (q.value.trim()) u.set('q', q.value.trim()); if (city.value) u.set('city', city.value); if (cat.value) u.set('category', cat.value);
      if (max.value) u.set('max', max.value); u.set('sort', sort.value);
      api('GET', '/api/mobilografs?' + u).then(function (d) {
        out.replaceChildren();
        if (!d.items.length) out.appendChild(h('div', { class: 'empty', style: 'grid-column:1/-1' }, 'Hech narsa topilmadi. Filtrlarni o’zgartirib ko’ring.'));
        d.items.forEach(function (m) { out.appendChild(mCard(m)); });
      });
    }
    q.addEventListener('input', function () { clearTimeout(t); t = setTimeout(load, 250); });
    [city, cat, max, sort].forEach(function (s) { s.addEventListener('change', load); });
    app.append(h('h2', null, 'Mobilograflar'), h('div', { class: 'filters' }, q, city, cat, max, sort), out);
    load();
  }

  function profile(id) {
    api('GET', '/api/mobilografs/' + id).then(function (m) {
      var type = select(state.meta.categories, 'Tadbir turini tanlang'); type.required = true;
      var today = new Date().toISOString().slice(0, 10);
      var date = h('input', { type: 'date', min: today, required: true });
      var note = h('textarea', { maxlength: '500', placeholder: 'Manzil, vaqt, qanday kadrlar kerak…' });
      var msg = h('div', { class: 'msg' }), btn = h('button', { class: 'btn', type: 'submit' }, 'So’rov yuborish');
      var form;
      if (!state.me) form = h('div', null, h('p', { class: 'mute' }, 'So’rov yuborish uchun tizimga kiring.'), h('a', { class: 'btn', href: '#/kirish' }, 'Kirish'));
      else if (state.me.role !== 'client') form = h('p', { class: 'mute' }, 'So’rov yuborish faqat buyurtmachilar uchun.');
      else form = h('form', { onsubmit: function (e) {
        e.preventDefault(); btn.disabled = true; msg.className = 'msg'; msg.textContent = '';
        api('POST', '/api/requests', { mobilograf_id: m.id, event_type: type.value, event_date: date.value, note: note.value })
          .then(function () { toast('So’rov yuborildi'); location.hash = '#/kabinet'; })
          .catch(function (e) { msg.textContent = e.message; btn.disabled = false; });
      } }, h('label', null, 'Tadbir turi'), type, h('label', null, 'Sana'), date, h('label', null, 'Izoh'), note, h('div', { style: 'margin-top:16px' }, btn), msg);
      app.append(h('a', { class: 'back', href: '#/mobilograflar' }, '← Orqaga'),
        h('div', { class: 'profile' },
          h('div', { class: 'card' },
            h('div', { class: 'row' }, avatar(m.name, m.id), h('div', null, h('h1', { style: 'font-size:32px' }, m.name), h('div', { class: 'mute' }, m.city + ' · ', h('span', { class: 'rating' }, m.rating.toFixed(1) + ' (' + m.reviews + ' sharh)')))),
            chips(m.categories), h('p', null, m.bio), h('div', { class: 'price' }, money(m.price_from) + ' dan')),
          h('div', { class: 'card' }, h('h3', null, 'Buyurtma berish'), form)));
    }).catch(function () { app.append(h('div', { class: 'empty' }, 'Mobilograf topilmadi.'), h('a', { class: 'btn', href: '#/mobilograflar' }, 'Ro’yxatga qaytish')); });
  }

  function login(query) {
    var signup = new URLSearchParams(query || '').get('signup') === '1', role = 'client', step = 1, emailV = '';
    var box = h('div', { class: 'panel' });
    app.append(box);
    function draw() {
      box.replaceChildren();
      var msg = h('div', { class: 'msg' });
      if (step === 1) {
        var tabs = h('div', { class: 'seg' },
          h('button', { class: signup ? '' : 'on', type: 'button', onclick: function () { signup = false; draw(); } }, 'Kirish'),
          h('button', { class: signup ? 'on' : '', type: 'button', onclick: function () { signup = true; draw(); } }, 'Ro’yxatdan o’tish'));
        var email = h('input', { type: 'email', placeholder: 'Pochta manzilingiz', required: true, autocomplete: 'email', value: emailV });
        var name = h('input', { type: 'text', placeholder: 'Ismingiz', maxlength: '60', autocomplete: 'name', value: box.dataset.name || '' });
        var opts = h('div', { class: 'opts' }, [['client', 'Men mobilograf qidiryapman', 'Buyurtmachi profili'], ['mobilograf', 'Men mobilografman', 'Mobilograf profili']].map(function (o) {
          return h('button', { class: 'opt' + (role === o[0] ? ' on' : ''), type: 'button', onclick: function () { role = o[0]; box.dataset.name = name.value; emailV = email.value; draw(); } }, h('b', null, o[1]), h('span', { class: 'mute small' }, o[2]));
        }));
        var btn = h('button', { class: 'btn', type: 'submit', style: 'width:100%;margin-top:18px' }, 'Kod yuborish');
        box.append(h('h2', { style: 'text-align:center' }, signup ? 'Ro’yxatdan o’tish' : 'Kirish'), tabs,
          h('form', { onsubmit: function (e) {
            e.preventDefault(); emailV = email.value.trim(); box.dataset.name = name.value; msg.textContent = ''; btn.disabled = true;
            api('POST', '/api/auth/send-code', { email: emailV }).then(function () { step = 2; draw(); })
              .catch(function (er) { msg.textContent = er.message; btn.disabled = false; });
          } }, signup ? [opts, h('label', null, 'Ism'), name] : null, h('label', null, 'Pochta'), email, btn, msg));
      } else {
        var code = h('input', { class: 'codein', inputmode: 'numeric', maxlength: '6', autocomplete: 'one-time-code', placeholder: '••••••', required: true });
        code.addEventListener('input', function () { code.value = code.value.replace(/\D/g, ''); });
        var go = h('button', { class: 'btn', type: 'submit', style: 'width:100%;margin-top:18px' }, 'Tasdiqlash');
        box.append(h('h2', { style: 'text-align:center' }, 'Kodni kiriting'), h('p', { class: 'mute', style: 'text-align:center;margin:10px 0 18px' }, emailV + ' manziliga 6 xonali kod yubordik'),
          h('form', { onsubmit: function (e) {
            e.preventDefault(); go.disabled = true; msg.className = 'msg'; msg.textContent = '';
            api('POST', '/api/auth/verify', { email: emailV, code: code.value, name: box.dataset.name || '', role: role })
              .then(function () { return load(); }).then(function () { toast('Xush kelibsiz!'); location.hash = '#/kabinet'; })
              .catch(function (er) { msg.textContent = er.message; go.disabled = false; });
          } }, code, go, msg),
          h('p', { style: 'text-align:center;margin-top:14px' },
            h('button', { class: 'btn ghost small', type: 'button', onclick: function () {
              api('POST', '/api/auth/send-code', { email: emailV }).then(function () { msg.className = 'msg ok'; msg.textContent = 'Kod qayta yuborildi'; }).catch(function (er) { msg.className = 'msg'; msg.textContent = er.message; });
            } }, 'Kodni qayta yuborish'), ' ',
            h('button', { class: 'btn ghost small', type: 'button', onclick: function () { step = 1; draw(); } }, 'Pochtani o’zgartirish')));
        code.focus();
      }
    }
    if (state.me) { location.hash = '#/kabinet'; return; }
    draw();
  }

  var STATUS = { new: 'Yangi', accepted: 'Qabul qilindi', declined: 'Rad etildi' };
  function cabinet() {
    if (!state.me) { location.hash = '#/kirish'; return; }
    var isM = state.me.role === 'mobilograf', reqs = h('div', { style: 'display:grid;gap:12px' });
    app.append(h('h2', null, 'Salom, ' + state.me.name), h('div', { class: isM ? 'profile' : '' }, h('div', null, h('h3', { style: 'margin-bottom:12px' }, isM ? 'Kelgan so’rovlar' : 'Yuborgan so’rovlarim'), reqs), isM ? profileForm() : null));
    function loadReqs() {
      api('GET', '/api/requests').then(function (d) {
        reqs.replaceChildren();
        if (!d.items.length) reqs.appendChild(h('div', { class: 'empty card' }, isM ? 'Hozircha so’rovlar yo’q.' : 'Hali so’rov yubormadingiz.'), isM ? null : h('a', { class: 'btn', href: '#/mobilograflar' }, 'Mobilograf topish'));
        d.items.forEach(function (r) {
          reqs.appendChild(h('div', { class: 'card' },
            h('div', { class: 'row', style: 'justify-content:space-between' }, h('b', null, (isM ? '' : '') + r.other_name + ' · ' + r.event_type), h('span', { class: 'status ' + r.status }, STATUS[r.status])),
            h('div', { class: 'mute small' }, 'Sana: ' + r.event_date + (isM ? ' · ' + r.other_email : '')),
            r.note ? h('p', null, r.note) : null,
            isM && r.status === 'new' ? h('div', { class: 'row' },
              h('button', { class: 'btn small', onclick: function () { setStatus(r.id, 'accepted'); } }, 'Qabul qilish'),
              h('button', { class: 'btn ghost small', onclick: function () { setStatus(r.id, 'declined'); } }, 'Rad etish')) : null));
        });
      });
    }
    function setStatus(id, s) { api('PATCH', '/api/requests/' + id, { status: s }).then(function () { toast('Saqlandi'); loadReqs(); }).catch(function (e) { toast(e.message); }); }
    loadReqs();
  }

  function profileForm() {
    var p = state.profile || { city: 'Toshkent', bio: '', price_from: 0, categories: [] };
    var name = h('input', { value: state.me.name, maxlength: '60' }), city = select(state.meta.cities, 'Shahar', p.city); city.firstChild.disabled = true;
    var price = h('input', { type: 'number', min: '0', step: '50000', value: p.price_from || '', placeholder: 'Masalan, 800000' });
    var bio = h('textarea', { maxlength: '600', placeholder: 'O’zingiz va tajribangiz haqida (kamida 10 belgi)' }); bio.value = p.bio;
    var sel = new Set(p.categories), msg = h('div', { class: 'msg' });
    var cc = h('div', { class: 'chips' }, state.meta.categories.map(function (c) {
      var b = h('button', { type: 'button', class: 'chip btnlike' + (sel.has(c) ? ' on' : ''), 'aria-pressed': sel.has(c), onclick: function () {
        if (sel.has(c)) sel.delete(c); else sel.add(c); b.classList.toggle('on', sel.has(c)); b.setAttribute('aria-pressed', sel.has(c));
      } }, c); return b;
    }));
    return h('form', { class: 'panel wide', onsubmit: function (e) {
      e.preventDefault(); msg.className = 'msg'; msg.textContent = '';
      api('PUT', '/api/me/profile', { name: name.value, city: city.value, price_from: price.value, bio: bio.value, categories: Array.from(sel) })
        .then(function (r) { return load().then(function () { toast(r.published ? 'Profil e’lon qilindi' : 'Saqlandi'); render(); }); })
        .catch(function (er) { msg.textContent = er.message; });
    } }, h('h3', null, 'Mening profilim'),
      h('p', { class: 'small ' + (p.published ? 'mute' : ''), style: p.published ? '' : 'color:#8a5a00;margin-top:6px' }, p.published ? 'Profilingiz saytda ko’rinadi.' : 'Profilni to’ldiring: shahar, narx, tadbir turlari va tavsif — shundan keyin saytda ko’rinadi.'),
      h('label', null, 'Ism'), name, h('label', null, 'Shahar'), city, h('label', null, 'Narx (dan, so’m)'), price,
      h('label', null, 'Tadbir turlari'), cc, h('label', null, 'Tavsif'), bio,
      h('div', { style: 'margin-top:16px' }, h('button', { class: 'btn', type: 'submit' }, 'Saqlash')), msg);
  }

  // ---------- router ----------
  function route() {
    var raw = location.hash.slice(1) || '/', i = raw.indexOf('?'), path = i < 0 ? raw : raw.slice(0, i), qs = i < 0 ? '' : raw.slice(i + 1), m;
    if (path === '/') return home;
    if (path === '/mobilograflar') return function () { list(qs); };
    if ((m = /^\/m\/(\d+)$/.exec(path))) return function () { profile(m[1]); };
    if (path === '/kirish') return function () { login(qs); };
    if (path === '/kabinet') return cabinet;
    return function () { app.append(h('div', { class: 'empty' }, 'Sahifa topilmadi.'), h('a', { class: 'btn', href: '#/' }, 'Bosh sahifa')); };
  }

  function load() {
    return api('GET', '/api/me').then(function (d) { state.me = d.user; state.profile = d.profile; drawNav(); });
  }
  window.addEventListener('hashchange', render);
  Promise.all([api('GET', '/api/meta'), load()]).then(function (r) { state.meta = r[0]; render(); })
    .catch(function () { app.append(h('div', { class: 'empty' }, 'Serverga ulanib bo’lmadi. "node server.js" ni ishga tushiring va http://localhost:3000 orqali oching.')); });
})();
