/* Salah-e-Waqt super admin panel.
 * Everything comes from, and every change goes through, the `superAdminApi`
 * Cloud Function, which checks the session on each call. This page holds no
 * secrets. Text from the database is only ever set with textContent. */
(function () {
  'use strict';

  const API = window.ADMIN_CONFIG.apiUrl;
  const KEY = 'swAdminSession';
  const app = document.getElementById('app');

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
  };
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
    return ['azan', 'registrations', 'subscribers'].includes(r) ? r : 'azan';
  }
  window.addEventListener('hashchange', () => { stopAudio(); render(); });

  // ---------------------------------------------------------------- data

  async function load(quiet) {
    if (!quiet) { S.loading = true; render(); }
    try {
      const out = await api('overview');
      S.data = { azans: out.azans, registrations: out.registrations, masjids: out.masjids };
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
      h('div', { class: 'who' },
        h('span', null, 'Signed in as ' + S.session.username),
        h('button', { type: 'button', onclick: () => signOut() }, 'Sign out')),
    );
    let body;
    if (!d && S.loading) body = h('div', { class: 'loading' }, 'Loading…');
    else if (!d) body = h('div', { class: 'empty' }, S.error || 'Could not load.', ' ', h('button', { class: 'btn btn-line', type: 'button', onclick: () => load() }, 'Try again'));
    else if (r === 'registrations') body = registrationsView(d);
    else if (r === 'subscribers') body = subscribersView(d);
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
      h('div', null, h('h1', null, 'Registrations'), h('p', { class: 'lead' }, "Masjids that registered but weren't found in the Waqf list.")),
      tabs, refreshBtn());

    // Just-decided cards stay at the top until refreshed away.
    const decided = Object.entries(S.results).map(([id, r]) => resultCard(id, r));
    const list = d.registrations.filter((x) => x.status === S.regFilter && !S.results[x.id]);
    if (!list.length && !decided.length) return [head, h('div', { class: 'empty' }, 'Nothing here.')];
    return [head, decided, list.map(regCard)];
  }

  function regCard(r) {
    const key = 'reg/' + r.id;
    const busy = S.busy === key;
    const place = [r.area, r.city, r.state].filter(Boolean).join(', ');
    const card = h('section', { class: 'card' },
      h('div', { class: 'row' },
        h('div', { class: 'grow' },
          h('span', { class: 'title' }, r.mosqueName || '(no name)'),
          h('span', { class: 'meta' }, [place, r.submittedAt ? 'submitted ' + when(r.submittedAt) : ''].filter(Boolean).join(' · '))),
        r.status !== 'pending' ? h('span', { class: 'pill ' + (r.status === 'approved' ? 'ok' : 'no') }, r.status) : null,
        r.lat && r.lng ? h('a', { href: 'https://www.google.com/maps/search/?api=1&query=' + r.lat + ',' + r.lng, target: '_blank', rel: 'noopener' }, 'See on map') : null),
      h('dl', { class: 'facts' },
        fact('Registration no.', r.regNumber),
        fact(r.status === 'approved' ? 'Username' : 'Username to create', r.approvedUsername || r.username),
        fact('Contact phone', (r.phone || '—') + (r.phoneVerified ? ' (verified)' : '')),
        r.rejectionReason ? fact('Reason', r.rejectionReason) : null,
        r.decidedAt ? fact(r.status === 'approved' ? 'Approved' : 'Rejected', when(r.decidedAt)) : null));
    if (r.status === 'pending') {
      card.append(h('div', { class: 'actions', style: 'justify-content:flex-end' },
        h('button', { class: 'btn btn-line', type: 'button', disabled: busy, onclick: () => { S.rejecting = S.rejecting === key ? null : key; render(); } }, 'Reject'),
        h('button', {
          class: 'btn btn-green', type: 'button', disabled: busy,
          onclick: () => {
            if (!confirm('Approve "' + r.mosqueName + '"?\n\nThis creates the masjid and its login ' + r.username + '.')) return;
            act(key, 'approveRegistration', { id: r.id }, r.mosqueName + ' is live',
              (out) => { S.results[r.id] = { kind: 'approved', name: r.mosqueName, username: out.username, phone: out.phone, message: out.message }; });
          },
        }, busy ? 'Working…' : 'Approve and create login')));
      if (S.rejecting === key) card.append(rejectBox(key, 'Reason (sent to the masjid)', 'e.g. Registration number does not match the Waqf certificate', 'Reject registration',
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
      h('td', { class: 'n' }, m.active)));
    const table = h('div', { class: 'tablebox' }, h('table', null,
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Masjid'), h('th', { scope: 'col', class: 'n' }, 'Followers'), h('th', { scope: 'col', class: 'n' }, 'Active'))),
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

  // ---------------------------------------------------------------- start

  render();
  if (S.session) load();
})();
