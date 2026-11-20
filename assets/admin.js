(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var cfg = window.NETRAVEX_CONFIG || {};
  var live = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
  var AREAS = window.NETRAVEX_AREAS || [];
  var TABLE = 'scoping_inquiries';
  var STATUSES = ['NEW', 'CONTACTED', 'SCHEDULED', 'CLOSED'];
  var LABEL = { NEW: 'New', CONTACTED: 'Contacted', SCHEDULED: 'Scheduled', CLOSED: 'Closed' };
  var ANS = ['No', 'Partly', 'Yes'];

  var sb = live ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;
  var rows = [];
  var demo = false;
  var openId = null;
  var confirmDeleteId = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function when(iso) {
    try {
      return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) + ' IST';
    } catch (e) { return iso; }
  }
  function setStatus(msg) { $('#dStatus').textContent = msg || ''; }

  /* ---------- views ---------- */
  function showAuth() {
    $('#authView').hidden = false; $('#dash').hidden = true;
    $('#signOut').hidden = true; $('#whoami').hidden = true;
  }
  function showDash(email) {
    $('#authView').hidden = true; $('#dash').hidden = false;
    $('#signOut').hidden = !live; $('#demoBanner').hidden = !demo;
    if (email) { $('#whoami').textContent = email; $('#whoami').hidden = false; }
  }

  /* ---------- sample data (preview only) ---------- */
  function sample() {
    var base = Date.now();
    function r(n, org, type, name, role, email, ans, status, msg, hrs) {
      var pts = ans.reduce(function (s, a) { return s + (a || 0); }, 0);
      var any = ans.some(function (a) { return a !== null; });
      return {
        id: 'demo-' + n, reference_id: 'NVX-' + (10000 + n), full_name: name, organization_name: org, org_type: type, role_title: role,
        work_email: email, phone_number: '+91 90000 0000' + n, focus_area: '30-day readiness roadmap', message: msg,
        answers: any ? ans : null, readiness_score: any ? pts / 2 : null, readiness_percent: any ? Math.round(pts / 20 * 100) : null,
        consent_given: true, consent_at: new Date(base - hrs * 3600000).toISOString(), notice_version: '2026-11-v1',
        status: status, auto_reply_status: 'SENT', auto_reply_error: null, admin_notes: '', created_at: new Date(base - hrs * 3600000).toISOString()
      };
    }
    return [
      r(5, 'Sample District Co-operative Bank', 'Co-operative bank', 'Sample Person A', 'IT Head', 'a@sample.invalid', [1, 1, 0, 0, 0, 2, 1, 2, 1, 0], 'NEW', 'Sample message: we want a first look at where member data is stored.', 3),
      r(4, 'Sample Urban Co-operative Bank', 'Co-operative bank', 'Sample Person B', 'Compliance Officer', 'b@sample.invalid', [0, 0, 0, 0, 0, 1, 0, 1, 0, 0], 'CONTACTED', '', 27),
      r(3, 'Sample Retail Pvt Ltd', 'Growing enterprise', 'Sample Person C', 'Founder', 'c@sample.invalid', [2, 2, 1, 1, 0, 2, 1, 2, 2, 1], 'SCHEDULED', 'Sample message: we need notices and consent flows.', 52),
      r(2, 'Sample Credit Society', 'Other', 'Sample Person D', '', 'd@sample.invalid', [null, null, null, null, null, null, null, null, null, null], 'NEW', '', 80)
    ];
  }

  /* ---------- data ---------- */
  function load() {
    setStatus('Loading…');
    return sb.from(TABLE).select('*').order('created_at', { ascending: false }).limit(1000).then(function (res) {
      if (res.error) { setStatus('Could not load enquiries: ' + res.error.message); return; }
      rows = res.data || [];
      setStatus('');
      render();
    });
  }
  function enter(session) {
    if (!session) { showAuth(); return; }
    sb.rpc('is_admin').then(function (res) {
      if (res.error || res.data !== true) {
        $('#aErr').textContent = 'This account is signed in but is not set up as a Netravex admin. Ask an administrator to add it.';
        sb.auth.signOut(); showAuth(); return;
      }
      showDash(session.user && session.user.email);
      load();
    });
  }

  function update(id, patch, okMsg) {
    var row = rows.filter(function (r) { return r.id === id; })[0];
    if (!row) return;
    if (demo) { Object.keys(patch).forEach(function (k) { row[k] = patch[k]; }); render(); setStatus(okMsg + ' (sample data, not saved)'); return; }
    sb.from(TABLE).update(patch).eq('id', id).select('id').then(function (res) {
      if (res.error || !res.data || !res.data.length) { setStatus('Could not save: ' + (res.error ? res.error.message : 'not allowed')); render(); return; }
      Object.keys(patch).forEach(function (k) { row[k] = patch[k]; });
      render(); setStatus(okMsg);
    });
  }
  function remove(id) {
    if (demo) { rows = rows.filter(function (r) { return r.id !== id; }); openId = null; render(); setStatus('Removed from the sample list.'); return; }
    sb.from(TABLE).delete().eq('id', id).select('id').then(function (res) {
      if (res.error || !res.data || !res.data.length) { setStatus('Could not delete: ' + (res.error ? res.error.message : 'not allowed')); return; }
      rows = rows.filter(function (r) { return r.id !== id; }); openId = null; render(); setStatus('Enquiry deleted.');
    });
  }

  /* ---------- rendering ---------- */
  function band(p) { return p == null ? 'none' : p < 40 ? 'low' : p < 70 ? 'mid' : 'high'; }
  function filtered() {
    var q = ($('#search').value || '').trim().toLowerCase(), st = $('#statusFilter').value;
    return rows.filter(function (r) {
      if (st !== 'ALL' && r.status !== st) return false;
      if (!q) return true;
      return [r.organization_name, r.full_name, r.work_email, r.reference_id].join(' ').toLowerCase().indexOf(q) !== -1;
    });
  }
  function detailHtml(r) {
    var areas = AREAS.map(function (a, i) {
      var v = r.answers ? r.answers[i] : null;
      var cls = v === null || v === undefined ? 'vn' : 'v' + v;
      var txt = v === null || v === undefined ? 'Not answered' : ANS[v];
      return '<li><span>' + (i + 1) + '. ' + esc(a.t) + '</span><span class="v ' + cls + '">' + txt + '</span></li>';
    }).join('');
    var reply = r.auto_reply_status === 'SENT' ? 'Sent' : r.auto_reply_status === 'FAILED' ? 'Failed' + (r.auto_reply_error ? ' (' + esc(r.auto_reply_error) + ')' : '') : 'Pending';
    return '<div class="dgrid"><div><h4>Scorecard answers</h4>' + (r.answers ? '<ul class="areas">' + areas + '</ul>' : '<p class="muted">The visitor did not attach a scorecard.</p>') + '</div>' +
      '<div><h4>Enquiry</h4><dl class="facts">' +
      '<dt>Name</dt><dd>' + esc(r.full_name) + (r.role_title ? ' (' + esc(r.role_title) + ')' : '') + '</dd>' +
      '<dt>Email</dt><dd>' + esc(r.work_email) + '</dd>' +
      '<dt>Phone</dt><dd>' + esc(r.phone_number || 'Not given') + '</dd>' +
      '<dt>Type</dt><dd>' + esc(r.org_type) + '</dd>' +
      '<dt>Wants help with</dt><dd>' + esc(r.focus_area || 'Not given') + '</dd>' +
      '<dt>Consent</dt><dd>Given ' + esc(when(r.consent_at)) + ', notice ' + esc(r.notice_version) + '</dd>' +
      '<dt>Auto-reply</dt><dd>' + reply + '</dd></dl>' +
      '<div class="msg">' + (r.message ? esc(r.message) : '<span class="muted">No message.</span>') + '</div>' +
      '<h4>Internal notes</h4><textarea id="notes-' + esc(r.id) + '" maxlength="4000" aria-label="Internal notes for ' + esc(r.reference_id) + '">' + esc(r.admin_notes || '') + '</textarea>' +
      '<div class="drow"><button class="btn sm primary" type="button" data-act="notes" data-id="' + esc(r.id) + '">Save notes</button>' +
      (confirmDeleteId === r.id
        ? '<button class="btn sm danger" type="button" data-act="delete-yes" data-id="' + esc(r.id) + '">Confirm delete</button><button class="btn sm" type="button" data-act="delete-no">Cancel</button>'
        : '<button class="btn sm danger" type="button" data-act="delete" data-id="' + esc(r.id) + '">Delete enquiry</button>') +
      '</div></div></div>';
  }
  function render() {
    var scored = rows.filter(function (r) { return r.readiness_score != null; });
    $('#kTotal').textContent = rows.length;
    $('#kNew').textContent = rows.filter(function (r) { return r.status === 'NEW'; }).length;
    $('#kAvg').textContent = scored.length ? (scored.reduce(function (s, r) { return s + Number(r.readiness_score); }, 0) / scored.length).toFixed(1) + ' / 10' : '–';
    $('#kLow').textContent = scored.filter(function (r) { return r.readiness_percent < 40; }).length;

    var list = filtered();
    $('#tbody').innerHTML = list.length ? list.map(function (r) {
      var p = r.readiness_percent, b = band(p);
      var main = '<tr class="main"><td><span class="ref">' + esc(r.reference_id) + '</span></td>' +
        '<td><b>' + esc(r.organization_name) + '</b><span class="sub">' + esc(r.full_name) + ' · ' + esc(r.work_email) + '</span></td>' +
        '<td class="num"><span class="pill ' + b + '">' + (p == null ? 'Not attached' : Number(r.readiness_score).toFixed(1) + ' / 10') + '</span></td>' +
        '<td><select data-act="status" data-id="' + esc(r.id) + '" aria-label="Status for ' + esc(r.reference_id) + '">' +
        STATUSES.map(function (s) { return '<option value="' + s + '"' + (r.status === s ? ' selected' : '') + '>' + LABEL[s] + '</option>'; }).join('') + '</select></td>' +
        '<td class="num">' + esc(when(r.created_at)) + '</td>' +
        '<td><button class="btn sm" type="button" data-act="toggle" data-id="' + esc(r.id) + '" aria-expanded="' + (openId === r.id) + '">' + (openId === r.id ? 'Hide' : 'Details') + '</button></td></tr>';
      return main + (openId === r.id ? '<tr class="detail"><td colspan="6">' + detailHtml(r) + '</td></tr>' : '');
    }).join('') : '<tr class="empty-row"><td colspan="6">' + (rows.length ? 'No enquiries match this search.' : 'No enquiries yet. New ones from the website will appear here.') + '</td></tr>';
  }

  /* ---------- events ---------- */
  $('#tbody').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]'); if (!b) return;
    var id = b.dataset.id, act = b.dataset.act;
    if (act === 'toggle') { openId = openId === id ? null : id; confirmDeleteId = null; render(); }
    else if (act === 'notes') { update(id, { admin_notes: $('#notes-' + id).value }, 'Notes saved.'); }
    else if (act === 'delete') { confirmDeleteId = id; render(); }
    else if (act === 'delete-no') { confirmDeleteId = null; render(); }
    else if (act === 'delete-yes') { confirmDeleteId = null; remove(id); }
  });
  $('#tbody').addEventListener('change', function (e) {
    var s = e.target.closest('select[data-act="status"]'); if (!s) return;
    update(s.dataset.id, { status: s.value }, 'Status updated.');
  });
  $('#search').addEventListener('input', render);
  $('#statusFilter').addEventListener('change', render);
  $('#refresh').addEventListener('click', function () { if (demo) { rows = sample(); render(); setStatus('Sample data reset.'); } else { load(); } });

  function csvCell(v) {
    var s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;   /* stop spreadsheet formula injection */
    return '"' + s.replace(/"/g, '""') + '"';
  }
  $('#exportCsv').addEventListener('click', function () {
    var head = ['Reference', 'Organisation', 'Type', 'Name', 'Role', 'Email', 'Phone', 'Focus', 'Readiness /10', 'Readiness %', 'Status', 'Consent at', 'Notice version', 'Received'];
    var lines = [head.map(csvCell).join(',')].concat(filtered().map(function (r) {
      return [r.reference_id, r.organization_name, r.org_type, r.full_name, r.role_title, r.work_email, r.phone_number, r.focus_area, r.readiness_score, r.readiness_percent, r.status, r.consent_at, r.notice_version, r.created_at].map(csvCell).join(',');
    }));
    try {
      var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'netravex-enquiries.csv';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setStatus('Exported ' + (lines.length - 1) + ' enquiries.');
    } catch (err) { setStatus('Export is not available in this view.'); }
  });

  /* ---------- auth ---------- */
  $('#loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!sb) { $('#aErr').textContent = 'Sign-in is not available until Supabase is configured in config.js.'; return; }
    var email = $('#aEmail').value.trim(), pass = $('#aPass').value;
    if (!email || !pass) { $('#aErr').textContent = 'Enter your email and password.'; return; }
    $('#aErr').textContent = ''; $('#aSubmit').disabled = true; $('#aSubmit').textContent = 'Signing in…';
    sb.auth.signInWithPassword({ email: email, password: pass }).then(function (res) {
      $('#aSubmit').disabled = false; $('#aSubmit').textContent = 'Sign in';
      if (res.error) { $('#aErr').textContent = 'Sign-in failed. Check your email and password.'; return; }
      $('#aPass').value = '';
      enter(res.data.session);
    });
  });
  $('#signOut').addEventListener('click', function () {
    if (sb) sb.auth.signOut();
    rows = []; openId = null; showAuth();
  });
  $('#demoBtn').addEventListener('click', function () {
    demo = true; rows = sample(); showDash('sample data'); render();
  });

  if (sb) {
    sb.auth.getSession().then(function (res) { enter(res.data && res.data.session); });
  } else {
    $('#demoNote').hidden = false;
    showAuth();
  }
})();
