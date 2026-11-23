/* Salah-e-Waqt super admin panel.
 * Everything comes from, and every change goes through, the `superAdminApi`
 * Cloud Function, which checks the session on each call. This page holds no
 * secrets. Text from the database is only ever set with textContent. */
(function () {
  'use strict';

  const API = window.ADMIN_CONFIG.apiUrl;
  const KEY = 'swAdminSession';
  const app = document.getElementById('app');
  const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.salah_e_waqt.app';

  const S = {
    session: loadSession(),
    data: null,
    loading: false,
    error: null,
    regFilter: 'pending',
    rejecting: null, // key of the card whose reject box is open
    busy: null, // key of the card whose action is running
    results: {}, // registration id -> {kind, username, phone, message}
    selected: null, // masjid id highlighted on the subscribers page
    promo: newPromo(),
  };
  function newPromo() {
    return { title: '', body: '', link: PLAY_STORE, image: null, chosen: new Set(), sending: false, result: null };
  }
  const audio = new Audio();
  let playingKey = null;
  let map = null;

  // ---------------------------------------------------------------- helpers

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'class') el.className = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  function icon(paths, size) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', size || 18);
    svg.setAttribute('height', size || 18);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = paths; // fixed icon markup only, never data
    return svg;
  }
  const I = {
    shield: '<path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z"></path>',
    music: '<path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle>',
    masjid: '<path d="M3 21h18M5 21V10l7-5 7 5v11M10 21v-5h4v5"></path>',
    people: '<circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.6.8 2.6 2.6 3 5.2"></path>',
    play: '<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"></path>',
    pause: '<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"></rect><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"></rect>',
    check: '<circle cx="12" cy="12" r="9"></circle><path d="M8 12l3 3 5-6"></path>',
    x: '<circle cx="12" cy="12" r="9"></circle><path d="M9 9l6 6M15 9l-6 6"></path>',
    wa: '<path d="M21 12a9 9 0 0 1-13.2 8L3 21l1.1-4.6A9 9 0 1 1 21 12z"></path>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4"></path>',
    megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"></path><path d="M15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12"></path>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"></rect><circle cx="9" cy="10" r="2"></circle><path d="M21 17l-5-5-9 8"></path>',
    send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"></path>',
  };

  function when(ms) {
    if (!ms) return '';
    return new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  }
  function kb(bytes) {
    if (!bytes) return '';
    return bytes > 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.round(bytes / 1024) + ' KB';
  }
  function toast(text) {
    const t = document.getElementById('toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 3200);
  }
  function waLink(phone, message) {
    let digits = String(phone || '').replace(/\D/g, '');
    if (digits.length === 10) digits = '91' + digits;
    return 'https://wa.me/' + digits + '?text=' + encodeURIComponent(message);
  }

  function loadSession() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      return s && s.expiresAt > Date.now() ? s : null;
    } catch (e) { return null; }
  }
  function saveSession(s) {
    try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch (e) { /* private mode */ }
  }

  async function api(action, body) {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ action, token: S.session && S.session.token }, body || {})),
    });
    let out = {};
    try { out = await res.json(); } catch (e) { /* not JSON */ }
    if (out.signedOut) { signOut(out.error); throw new Error(out.error); }
    if (!res.ok || !out.ok) throw new Error(out.error || 'Something went wrong. Please try again.');
    return out;
  }

  // ---------------------------------------------------------------- routing

  function route() {
    const r = (location.hash || '').replace(/^#\/?/, '');
    return ['azan', 'registrations', 'subscribers', 'promo'].includes(r) ? r : 'azan';
  }
  window.addEventListener('hashchange', () => { stopAudio(); render(); });

  // ---------------------------------------------------------------- data

  async function load(quiet) {
    if (!quiet) { S.loading = true; render(); }
    try {
      const out = await api('overview');
      S.data = { azans: out.azans, registrations: out.registrations, masjids: out.masjids, nextUsername: out.nextUsername };
      S.error = null;
    } catch (e) {
      S.error = e.message;
    }
    S.loading = false;
    render();
  }

  function signOut(reason) {
    stopAudio();
    S.session = null;
    S.data = null;
    saveSession(null);
    render(reason);
  }

  // ---------------------------------------------------------------- views

  function render(loginError) {
    if (map) { map.remove(); map = null; }
    app.replaceChildren(S.session ? shell() : loginView(loginError));
    if (S.session && route() === 'subscribers' && S.data) drawMap();
  }

  function loginView(error) {
    const err = h('p', { class: 'alert', role: 'alert', hidden: !error }, error || '');
    const user = h('input', { id: 'u', name: 'username', type: 'text', autocomplete: 'username', required: true, placeholder: 'Super admin username' });
    const pass = h('input', { id: 'p', name: 'password', type: 'password', autocomplete: 'current-password', required: true, placeholder: 'Password' });
    const btn = h('button', { class: 'btn btn-gold', type: 'submit' }, 'Sign in');
    const form = h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        btn.disabled = true;
        btn.textContent = 'Signing in…';
        err.hidden = true;
        try {
          const out = await api('login', { username: user.value.trim(), password: pass.value.trim() });
          S.session = { token: out.token, username: out.username, expiresAt: out.expiresAt };
          saveSession(S.session);
          if (!location.hash) location.hash = '#/azan';
          render();
          load();
        } catch (ex) {
          err.textContent = ex.message;
          err.hidden = false;
          btn.disabled = false;
          btn.textContent = 'Sign in';
          pass.select();
        }
      },
    },
      h('span', { class: 'mark' }, icon(I.shield, 30)),
      h('h1', null, 'Salah-e-Waqt Admin'),
      h('p', { class: 'sub' }, 'Approve Azans and masjid registrations, and see followers.'),
      err,
      h('div', { class: 'field' }, h('label', { for: 'u' }, 'Username'), user),
      h('div', { class: 'field' }, h('label', { for: 'p' }, 'Password'), pass),
      btn,
      h('p', { class: 'note' }, 'Same super admin login as the app. Every action is checked again on the server.'),
    );
    setTimeout(() => user.focus(), 0);
    return h('div', { class: 'login' }, form);
  }

  function shell() {
    const r = route();
    const d = S.data;
    const pendingRegs = d ? d.registrations.filter((x) => x.status === 'pending').length : null;
    const nav = (id, label, ic, count) => h('a', { class: 'nav', href: '#/' + id, 'aria-current': r === id ? 'page' : null },
      icon(ic), h('span', { class: 't' }, label),
      count === null || count === undefined ? null : h('span', { class: 'count' + (count > 0 ? ' hot' : '') }, count));
    const side = h('nav', { class: 'side', 'aria-label': 'Admin sections' },
      h('div', { class: 'brand' }, h('span', { class: 'i' }, icon(I.shield)), 'Salah-e-Waqt Admin'),
      nav('azan', 'Azan approvals', I.music, d ? d.azans.length : null),
      nav('registrations', 'Registrations', I.masjid, pendingRegs),
      nav('subscribers', 'Subscribers', I.people, null),
      nav('promo', 'Send promotion', I.megaphone, null),
      h('div', { class: 'who' },
        h('span', null, 'Signed in as ' + S.session.username),
        h('button', { type: 'button', onclick: () => signOut() }, 'Sign out')),
    );
    let body;
    if (!d && S.loading) body = h('div', { class: 'loading' }, 'Loading…');
    else if (!d) body = h('div', { class: 'empty' }, S.error || 'Could not load.', ' ', h('button', { class: 'btn btn-line', type: 'button', onclick: () => load() }, 'Try again'));
    else if (r === 'registrations') body = registrationsView(d);
    else if (r === 'subscribers') body = subscribersView(d);
    else if (r === 'promo') body = promoView(d);
    else body = azanView(d);
    return h('div', { class: 'shell' }, side, h('main', null, body));
  }

  function refreshBtn() {
    return h('button', { class: 'btn btn-line', type: 'button', onclick: () => load(true) }, icon(I.refresh), 'Refresh');
  }

  // ---- Azan approvals

  function stopAudio() {
    audio.pause();
    playingKey = null;
  }
  audio.addEventListener('ended', () => { playingKey = null; render(); });

  function azanView(d) {
    const head = h('div', { class: 'head' },
      h('div', null, h('h1', null, 'Azan approvals'), h('p', { class: 'lead' }, 'Custom Azans uploaded by Moazzams. Listen before approving.')),
      refreshBtn());
    if (!d.azans.length) return [head, h('div', { class: 'empty' }, 'No Azans waiting for approval.')];
    return [head, d.azans.map((a) => {
      const key = a.mosqueId + '/' + a.type;
      const playing = playingKey === key;
      const busy = S.busy === key;
      const card = h('section', { class: 'card' },
        h('div', { class: 'row' },
          h('button', {
            class: 'play', type: 'button', 'aria-label': playing ? 'Pause preview' : 'Play preview', disabled: !a.url,
            onclick: () => {
              if (playing) { stopAudio(); } else { audio.src = a.url; audio.play().catch(() => toast('Could not play this file.')); playingKey = key; }
              render();
            },
          }, icon(playing ? I.pause : I.play)),
          h('div', { class: 'grow' },
            h('span', { class: 'title' }, a.mosqueName),
            h('span', { class: 'meta' }, ['Uploaded ' + when(a.uploadedAt), kb(a.sizeBytes), a.fileName].filter(Boolean).join(' · '))),
          h('span', { class: 'pill' }, a.type === 'fajr' ? 'Fajr Azan' : 'Other prayers'),
          h('div', { class: 'actions' },
            h('button', { class: 'btn btn-line', type: 'button', disabled: busy, onclick: () => { S.rejecting = S.rejecting === key ? null : key; render(); } }, 'Reject'),
            h('button', {
              class: 'btn btn-green', type: 'button', disabled: busy,
              onclick: () => act(key, 'approveAzan', { mosqueId: a.mosqueId, type: a.type }, 'Approved for ' + a.mosqueName),
            }, busy ? 'Working…' : 'Approve'))));
      if (S.rejecting === key) card.append(rejectBox(key, 'Reason (the Moazzam sees this)', 'e.g. Audio is too quiet, please upload a clearer recording', 'Reject upload',
        (reason) => act(key, 'rejectAzan', { mosqueId: a.mosqueId, type: a.type, reason }, 'Rejected. The file was removed.')));
      return card;
    })];
  }

  function rejectBox(key, label, hint, cta, onConfirm) {
    const id = 'reason-' + key.replace(/[^a-z0-9]/gi, '-');
    const ta = h('textarea', { id, rows: 2, maxlength: 500, placeholder: hint });
    setTimeout(() => ta.focus(), 0);
    return h('div', { class: 'reject' },
      h('label', { for: id }, label), ta,
      h('div', { class: 'actions' },
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { S.rejecting = null; render(); } }, 'Cancel'),
        h('button', {
          class: 'btn btn-red', type: 'button',
          onclick: () => {
            const reason = ta.value.trim();
            if (!reason) { toast('Please write a reason.'); ta.focus(); return; }
            onConfirm(reason);
          },
        }, cta)));
  }

  async function act(key, action, body, okText, onOk) {
    S.busy = key;
    render();
    try {
      const out = await api(action, body);
      S.rejecting = null;
      if (onOk) onOk(out);
      toast(okText);
      if (playingKey === key) stopAudio();
      await load(true);
    } catch (e) {
      toast(e.message);
    }
    S.busy = null;
    render();
  }

  // ---- Registrations

  function registrationsView(d) {
    const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Filter' },
      ['pending', 'approved', 'rejected'].map((f) => h('button', {
        type: 'button', role: 'tab', 'aria-selected': S.regFilter === f ? 'true' : 'false',
        onclick: () => { S.regFilter = f; render(); },
      }, f[0].toUpperCase() + f.slice(1) + ' (' + d.registrations.filter((x) => x.status === f).length + ')')));
    const head = h('div', { class: 'head' },
      h('div', null, h('h1', null, 'Registrations'), h('p', { class: 'lead' }, 'New masjids waiting for approval.',
        d.nextUsername ? [' Next login: ', h('strong', { style: 'color:var(--gold-text)' }, d.nextUsername)] : null)),
      tabs, refreshBtn());

    // Just-decided cards stay at the top until refreshed away.
    const decided = Object.entries(S.results).map(([id, r]) => resultCard(id, r));
    const list = d.registrations.filter((x) => x.status === S.regFilter && !S.results[x.id]);
    if (!list.length && !decided.length) return [head, h('div', { class: 'empty' }, 'Nothing here.')];
    const foot = S.regFilter === 'pending' && list.length > 1
      ? h('p', { class: 'meta' }, 'The number is given when you approve, so whichever you approve first gets ' + (d.nextUsername || 'the next number') + '.')
      : null;
    return [head, decided, list.map((r) => regCard(r, d.nextUsername)), foot];
  }

  function regCard(r, nextUsername) {
    const key = 'reg/' + r.id;
    const busy = S.busy === key;
    const dup = r.status === 'pending' && r.possibleDuplicate;
    const place = [r.area, r.city, [r.state, r.pincode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const card = h('section', { class: 'card' + (dup ? ' dup' : '') },
      h('div', { class: 'row' },
        h('div', { class: 'grow' },
          h('span', { class: 'title' }, r.mosqueName || '(no name)'),
          h('span', { class: 'meta' }, [place, r.submittedAt ? 'submitted ' + when(r.submittedAt) : ''].filter(Boolean).join(' · '))),
        r.status !== 'pending' ? h('span', { class: 'pill ' + (r.status === 'approved' ? 'ok' : 'no') }, r.status) : null,
        dup ? h('span', { class: 'pill dup' }, '⚠ POSSIBLE DUPLICATE') : null,
        r.lat && r.lng ? h('a', { href: 'https://www.google.com/maps/search/?api=1&query=' + r.lat + ',' + r.lng, target: '_blank', rel: 'noopener' }, 'See on map') : null),
      dup ? h('div', { class: 'dupbox' },
        h('span', null, 'Matching name in the same PIN code / area, city and state:'),
        (r.duplicateMatches || []).map((m) => h('div', { class: 'm' },
          h('span', { class: 'grow' }, h('b', null, m.name || '(no name)'), m.place ? ' · ' + m.place : ''),
          h('span', { class: 'pill ' + (m.status === 'live' ? 'ok' : '') }, m.status === 'live' ? 'Live · ' + m.id : 'Request · ' + m.status),
          ))) : null,
      h('dl', { class: 'facts' },
        r.regNumber ? fact('Registration no.', r.regNumber) : null,
        fact(r.status === 'approved' ? 'Username' : 'Login on approval', r.approvedUsername || nextUsername),
        fact('Contact phone', (r.phone || '—') + (r.phoneVerified ? ' (verified)' : '')),
        r.rejectionReason ? fact('Reason', r.rejectionReason) : null,
        r.decidedAt ? fact(r.status === 'approved' ? 'Approved' : 'Rejected', when(r.decidedAt)) : null));
    if (r.status === 'pending') {
      card.append(h('div', { class: 'actions', style: 'justify-content:flex-end' },
        h('button', { class: 'btn btn-line', type: 'button', disabled: busy, onclick: () => { S.rejecting = S.rejecting === key ? null : key; render(); } }, 'Reject'),
        h('button', {
          class: 'btn btn-green', type: 'button', disabled: busy,
          onclick: () => {
            if (!confirm('Approve "' + r.mosqueName + '"?\n\nThis creates the masjid and its login ' + (nextUsername || 'SW-MASJID-###') + '.' +
              (dup ? '\n\nIt looks like a masjid we may already have. Approve only if you checked it is a different masjid.' : ''))) return;
            act(key, 'approveRegistration', { id: r.id }, r.mosqueName + ' is live',
              (out) => { S.results[r.id] = { kind: 'approved', name: r.mosqueName, username: out.username, phone: out.phone, message: out.message }; });
          },
        }, busy ? 'Working…' : (dup ? 'Approve anyway' : 'Approve and create login'))));
      if (S.rejecting === key) card.append(rejectBox(key, 'Reason (sent to the masjid)', 'e.g. This masjid is already registered', 'Reject registration',
        (reason) => act(key, 'rejectRegistration', { id: r.id, reason }, 'Registration rejected',
          (out) => { S.results[r.id] = { kind: 'rejected', name: r.mosqueName, phone: out.phone, message: out.message }; })));
    } else {
      card.append(h('div', { class: 'actions', style: 'justify-content:flex-end' },
        h('button', {
          class: 'btn btn-line', type: 'button', disabled: busy,
          onclick: async () => {
            S.busy = key; render();
            try {
              const out = await api('registrationMessage', { id: r.id });
              S.results[r.id] = { kind: r.status, name: r.mosqueName, username: r.approvedUsername, phone: out.phone, message: out.message };
            } catch (e) { toast(e.message); }
            S.busy = null; render();
          },
        }, icon(I.wa), 'WhatsApp message again')));
    }
    return card;
  }

  function fact(label, value) {
    return h('div', null, h('dt', null, label), h('dd', null, value || '—'));
  }

  function resultCard(id, r) {
    const ok = r.kind === 'approved';
    return h('section', { class: 'card done' + (ok ? '' : ' rej'), 'aria-live': 'polite' },
      h('div', { class: 'row' }, icon(ok ? I.check : I.x, 22),
        h('span', { class: 'title' }, ok ? r.name + ' is live' : r.name + ' was rejected')),
      ok ? h('p', { class: 'meta', style: 'margin:0' }, 'Login: ', h('strong', { style: 'color:var(--gold-text)' }, r.username),
        '. Send the username, password and the how-to video to the masjid.') : null,
      h('pre', { class: 'msg' }, r.message),
      h('div', { class: 'actions' },
        r.phone ? h('a', { class: 'btn btn-wa', href: waLink(r.phone, r.message), target: '_blank', rel: 'noopener' }, icon(I.wa), 'Send on WhatsApp') : null,
        h('button', {
          class: 'btn btn-line', type: 'button',
          onclick: () => navigator.clipboard.writeText(r.message).then(() => toast('Message copied'), () => toast('Could not copy')),
        }, 'Copy message'),
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { delete S.results[id]; render(); } }, 'Done')));
  }

  // ---- Subscribers

  function subscribersView(d) {
    const total = d.masjids.reduce((n, m) => n + m.total, 0);
    const active = d.masjids.reduce((n, m) => n + m.active, 0);
    const head = h('div', { class: 'head' },
      h('div', null, h('h1', null, 'Subscribers'),
        h('p', { class: 'lead' }, 'Followers per masjid. Active = opened the app in the last 7 days. Counts update daily at 3:30 AM.')),
      refreshBtn());
    const stats = h('div', { class: 'stats' },
      stat('Masjids', d.masjids.length), stat('Total followers', total, true), stat('Active this week', active));
    const rows = d.masjids.map((m) => h('tr', {
      class: S.selected === m.id ? 'sel' : null, tabindex: 0,
      onclick: () => selectMasjid(m.id),
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectMasjid(m.id); } },
    },
      h('td', null, m.name, h('small', null, m.id)),
      h('td', { class: 'n', style: 'color:var(--gold-text);font-weight:600' }, m.total),
      h('td', { class: 'n' }, m.active),
      h('td', { class: 'n' }, h('a', {
        href: 'poster.html?m=' + encodeURIComponent(m.id), target: '_blank', rel: 'noopener',
        onclick: (e) => e.stopPropagation(), 'aria-label': 'Poster for ' + m.name,
      }, 'Poster'))));
    const table = h('div', { class: 'tablebox' }, h('table', null,
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Masjid'), h('th', { scope: 'col', class: 'n' }, 'Followers'),
        h('th', { scope: 'col', class: 'n' }, 'Active'), h('th', { scope: 'col', class: 'n' }, h('span', { class: 'sr-only' }, 'Poster')))),
      h('tbody', null, rows)));
    return [head, stats, h('div', { class: 'split' }, h('div', { id: 'map', role: 'region', 'aria-label': 'Map of masjids' }), table)];
  }

  function stat(label, value, gold) {
    return h('div', { class: 'stat' }, h('span', null, label), h('strong', { style: gold ? 'color:var(--gold-text)' : null }, value));
  }

  function selectMasjid(id) {
    S.selected = S.selected === id ? null : id;
    render();
  }

  function drawMap() {
    const el = document.getElementById('map');
    if (!el || !window.L) return;
    const pts = S.data.masjids.filter((m) => m.lat && m.lng);
    map = L.map(el, { scrollWheelZoom: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18, attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    if (!pts.length) { map.setView([21.15, 79.09], 9); return; }
    const max = Math.max(1, ...pts.map((m) => m.total));
    let focus = null;
    pts.forEach((m) => {
      const sel = S.selected === m.id;
      const c = L.circleMarker([m.lat, m.lng], {
        radius: 7 + 16 * Math.sqrt(m.total / max),
        color: sel ? '#FFFFFF' : '#D4AF37', weight: sel ? 3 : 2, fillColor: '#D4AF37', fillOpacity: 0.35,
      }).addTo(map);
      const tip = document.createElement('div');
      tip.append(h('strong', null, m.name), h('br'), m.total + ' followers · ' + m.active + ' active');
      c.bindTooltip(tip);
      c.on('click', () => selectMasjid(m.id));
      if (sel) focus = m;
    });
    if (focus) map.setView([focus.lat, focus.lng], 14);
    else map.fitBounds(L.latLngBounds(pts.map((m) => [m.lat, m.lng])).pad(0.3));
  }

  // ---- Send promotion

  // Shrinks big photos so the upload stays small; small PNG/JPEG go as-is.
  function readImage(file) {
    return new Promise((resolve, reject) => {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { reject(new Error('Choose a PNG or JPG image.')); return; }
      const fr = new FileReader();
      fr.onerror = () => reject(new Error('Could not read the image.'));
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Could not read the image.'));
        img.onload = () => {
          const small = file.size <= 1500000 && file.type !== 'image/webp' && img.width <= 2000;
          let url = fr.result;
          let type = file.type;
          if (!small) {
            const scale = Math.min(1, 1440 / Math.max(img.width, img.height));
            const c = document.createElement('canvas');
            c.width = Math.round(img.width * scale);
            c.height = Math.round(img.height * scale);
            const g = c.getContext('2d');
            g.fillStyle = '#ffffff';
            g.fillRect(0, 0, c.width, c.height);
            g.drawImage(img, 0, 0, c.width, c.height);
            url = c.toDataURL('image/jpeg', 0.88);
            type = 'image/jpeg';
          }
          resolve({ url, type, base64: url.split(',')[1], name: file.name, w: img.width, h: img.height });
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  function promoView(d) {
    const P = S.promo;
    const head = h('div', { class: 'head' },
      h('div', null, h('h1', null, 'Send promotion'),
        h('p', { class: 'lead' }, 'A notification with an image to everyone following the masjids you choose.')));

    if (P.result) {
      const r = P.result;
      return [head, h('section', { class: 'card done' + (r.failed.length ? ' rej' : ''), 'aria-live': 'polite' },
        h('div', { class: 'row' }, icon(r.failed.length ? I.x : I.check, 22),
          h('span', { class: 'title' }, 'Sent to ' + r.sent + ' masjid' + (r.sent === 1 ? '' : 's'))),
        r.failed.length ? h('p', { class: 'meta', style: 'margin:0' }, 'Could not send to: ' + r.failed.join(', ')) : null,
        h('p', { class: 'meta', style: 'margin:0' }, 'Phones that are offline get it when they come back online.'),
        h('div', { class: 'actions' },
          h('button', { class: 'btn btn-line', type: 'button', onclick: () => { S.promo = newPromo(); render(); } }, 'Send another')))];
    }

    // Form fields keep their own text; typing updates the preview only.
    const pvTitle = h('span', { class: 'pv-title' }, P.title || 'Title');
    const pvBody = h('span', { class: 'pv-body' }, P.body || 'Your message');
    const pvImg = P.image ? h('img', { class: 'pv-img', src: P.image.url, alt: '' }) : null;

    const title = h('input', { id: 'pt', type: 'text', maxlength: 100, value: P.title, placeholder: 'e.g. New update: Salah-e-Waqt 8.12',
      oninput: (e) => { P.title = e.target.value; pvTitle.textContent = P.title || 'Title'; updateSend(); } });
    const body = h('textarea', { id: 'pb', rows: 3, maxlength: 500, placeholder: 'e.g. A new Azan screen for every prayer. Tap to update now.',
      oninput: (e) => { P.body = e.target.value; pvBody.textContent = P.body || 'Your message'; updateSend(); } });
    body.value = P.body;
    const link = h('input', { id: 'pl', type: 'url', value: P.link, placeholder: 'https://…',
      oninput: (e) => { P.link = e.target.value.trim(); } });

    const fileIn = h('input', { id: 'pi', type: 'file', accept: 'image/png,image/jpeg,image/webp', class: 'sr-only',
      onchange: async (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        try { P.image = await readImage(f); } catch (ex) { toast(ex.message); }
        render();
      } });
    const imageBox = h('div', { class: 'field' },
      h('span', { class: 'lbl' }, 'Image'),
      P.image
        ? h('div', { class: 'imgpick' }, h('img', { src: P.image.url, alt: 'Chosen image' }),
            h('div', { class: 'grow' }, h('span', { class: 'title' }, P.image.name), h('span', { class: 'meta' }, P.image.w + ' × ' + P.image.h)),
            h('label', { for: 'pi', class: 'btn btn-line' }, 'Change'),
            h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { P.image = null; render(); } }, 'Remove'))
        : h('label', { for: 'pi', class: 'drop' }, icon(I.image, 28), h('span', null, 'Upload image'), h('small', null, 'PNG or JPG. Portrait 1080 × 1350 works well.')),
      fileIn);

    // Masjid picker
    const ms = d.masjids.slice().sort((a, b) => a.name.localeCompare(b.name));
    const allOn = ms.length > 0 && ms.every((m) => P.chosen.has(m.id));
    const reach = ms.filter((m) => P.chosen.has(m.id)).reduce((n, m) => n + m.total, 0);
    const allBox = h('input', { type: 'checkbox', id: 'pall', checked: allOn,
      onchange: (e) => { P.chosen = e.target.checked ? new Set(ms.map((m) => m.id)) : new Set(); render(); } });
    const picker = h('fieldset', { class: 'picker' },
      h('legend', null, 'Masjids'),
      h('label', { class: 'pick all', for: 'pall' }, allBox, h('span', { class: 'grow' }, h('span', { class: 'title' }, 'Select all masjids'),
        h('span', { class: 'meta' }, ms.length + ' masjids'))),
      ms.map((m) => {
        const id = 'pm-' + m.id.replace(/[^a-z0-9]/gi, '-');
        return h('label', { class: 'pick', for: id },
          h('input', { type: 'checkbox', id, checked: P.chosen.has(m.id),
            onchange: (e) => { e.target.checked ? P.chosen.add(m.id) : P.chosen.delete(m.id); render(); } }),
          h('span', { class: 'grow' }, h('span', { class: 'title' }, m.name), h('span', { class: 'meta' }, m.id)),
          h('span', { class: 'meta' }, m.total + ' followers'));
      }));

    const sendBtn = h('button', { class: 'btn btn-gold', type: 'button', onclick: sendPromo }, icon(I.send), 'Send');
    const summary = h('p', { class: 'meta', style: 'margin:0' });
    function updateSend() {
      const n = P.chosen.size;
      sendBtn.disabled = P.sending || !P.title.trim() || !P.body.trim() || !n;
      sendBtn.lastChild.textContent = P.sending ? 'Sending…' : n ? 'Send to ' + n + ' masjid' + (n === 1 ? '' : 's') : 'Send';
      summary.textContent = n ? 'About ' + reach + ' followers will get it.' : 'Choose at least one masjid.';
    }
    updateSend();

    async function sendPromo() {
      const n = P.chosen.size;
      const all = allOn;
      if (!confirm('Send "' + P.title.trim() + '" to ' + (all ? 'ALL ' : '') + n + ' masjid' + (n === 1 ? '' : 's') +
        ' (about ' + reach + ' followers)?\n\nA notification cannot be taken back.')) return;
      P.sending = true;
      updateSend();
      try {
        const out = await api('sendPromo', {
          title: P.title.trim(), body: P.body.trim(), clickUrl: P.link || '',
          all, mosqueIds: all ? [] : [...P.chosen],
          imageBase64: P.image ? P.image.base64 : null, imageType: P.image ? P.image.type : null,
        });
        P.result = { sent: out.sent, failed: out.failed || [] };
      } catch (e) {
        toast(e.message);
      }
      P.sending = false;
      render();
    }

    const form = h('div', { class: 'card promo-form' },
      h('div', { class: 'field' }, h('label', { for: 'pt' }, 'Title'), title),
      h('div', { class: 'field' }, h('label', { for: 'pb' }, 'Message'), body),
      imageBox,
      h('div', { class: 'field' }, h('label', { for: 'pl' }, 'Link when tapped (optional)'), link),
      picker,
      h('div', { class: 'sendbar' }, summary, sendBtn));
    const preview = h('aside', { class: 'preview', 'aria-label': 'Notification preview' },
      h('span', { class: 'lbl' }, 'PREVIEW'),
      h('div', { class: 'pv' }, h('span', { class: 'pv-app' }, 'Salah-e-Waqt · now'), pvTitle, pvBody, pvImg));
    return [head, h('div', { class: 'promo' }, form, preview)];
  }

  // ---------------------------------------------------------------- start

  render();
  if (S.session) load();
})();
