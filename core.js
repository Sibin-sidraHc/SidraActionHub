/* Sidra Action Hub - shared by the admin and member pages: API calls, state, forms, task drawer. */
'use strict';

const CFG = window.SIDRA_CONFIG || {};
const S = { me: null, users: [], initiatives: [], projects: [], tasks: [], subtasks: [], stages: [], doneStage: '', holdStage: '', statuses: [], priorities: [], today: '' };
const ACT = {};          // click / change / submit handlers, looked up by data-act, data-change, data-submit
let PORTAL = 'admin';    // set by admin.js or member.js
let PAGE = null;         // { shell(): html }
let DETAIL = null;       // comments + activity of the task open in the drawer
let OPEN_TASK = null;
let DETAIL_SEQ = 0;      // guards against an older reply overwriting a newer one
let LOADING = true;

const $ = (s, r) => (r || document).querySelector(s);
const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- storage (falls back to memory if the browser blocks it) ---------- */
const mem = {};
const store = {
  get(k) { try { return localStorage.getItem(k) || mem[k] || null; } catch (e) { return mem[k] || null; } },
  set(k, v) { mem[k] = v; try { localStorage.setItem(k, v); } catch (e) { /* memory only */ } },
  del(k) { delete mem[k]; try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
};
const tokenKey = () => 'sidra_' + PORTAL + '_token';

/* ---------- API ---------- */
async function api(action, payload, refresh) {
  if (!CFG.API_URL) throw new Error('The Action Hub is not connected yet: set API_URL in config.js.');
  let j;
  try {
    // No Content-Type header on purpose: a plain-text POST needs no CORS preflight, which Apps Script cannot answer.
    const res = await fetch(CFG.API_URL, { method: 'POST', body: JSON.stringify({ action, token: store.get(tokenKey()), payload: payload || {}, refresh: !!refresh }) });
    j = await res.json();
  } catch (e) {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }
  if (!j.ok) {
    if (j.code === 'auth') { store.del(tokenKey()); S.me = null; render(); }
    throw new Error(j.error || 'Something went wrong.');
  }
  return j.data;
}

/** Run a change on the server and take the fresh board state it sends back. */
async function mutate(action, payload) {
  const d = await api(action, payload, true);
  if (d.result && d.result.detailFor) { DETAIL = d.result; DETAIL_SEQ++; }
  setState(d.state);
  return d.result;
}

function setState(state) { Object.assign(S, state); render(); }

/* ---------- lookups and formatting ---------- */
const user = id => S.users.find(u => u.id === id);
const uname = id => (user(id) || {}).name || 'Unassigned';
const pname = id => (S.projects.find(p => p.id === id) || {}).name || '';
const iname = id => (S.initiatives.find(i => i.id === id) || {}).name || '';
const activeUsers = () => S.users.filter(u => u.active);
const addDays = (ymd, n) => { const d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const isOpen = t => t.stage !== S.doneStage;
const overdue = t => isOpen(t) && t.stage !== S.holdStage && !!t.dueDate && t.dueDate < S.today;
const dueSoon = t => isOpen(t) && t.stage !== S.holdStage && !!t.dueDate && t.dueDate >= S.today && t.dueDate <= addDays(S.today, 3);
const tpct = t => t.stage === S.doneStage ? 100 : t.progress;
const pct = list => list.length ? Math.round(list.reduce((a, t) => a + tpct(t), 0) / list.length) : 0;
const fdate = ymd => ymd ? new Date(ymd + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No date';
const ftime = iso => iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const bar = p => `<div class="bar" title="${p}%"><i style="width:${Math.max(0, Math.min(100, p))}%"></i></div>`;
const stagePill = s => `<span class="pill s${Math.max(0, S.stages.indexOf(s))}">${esc(s)}</span>`;
const dueHtml = t => `<span class="due ${overdue(t) ? 'late' : dueSoon(t) ? 'soon' : ''}">${esc(fdate(t.dueDate))}</span>`;
const opts = (list, sel, none) => (none !== undefined ? `<option value="">${esc(none)}</option>` : '') +
  list.map(o => `<option value="${esc(o.v)}"${String(o.v) === String(sel || '') ? ' selected' : ''}>${esc(o.l)}</option>`).join('');
const userOpts = () => activeUsers().map(u => ({ v: u.id, l: u.name }));

function taskTable(list, emptyText) {
  if (!list.length) return `<div class="empty">${esc(emptyText || 'No tasks here yet.')}</div>`;
  return `<div class="tablewrap"><table><tr><th>Task</th><th>Stage</th><th>Assigned to</th><th>Due</th><th>Progress</th></tr>${list.map(t => `
    <tr class="click" data-act="openTask" data-id="${esc(t.id)}"><td><b>${esc(t.title)}</b></td><td>${stagePill(t.stage)}</td>
    <td>${esc(uname(t.assigneeId))}</td><td>${dueHtml(t)}</td><td>${bar(tpct(t))}</td></tr>`).join('')}</table></div>`;
}

/* ---------- toast, modal, forms ---------- */
let toastTimer;
function toast(msg, isErr) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast' + (isErr ? ' err' : ''); t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, isErr ? 6000 : 2600);
}

function closeModal() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; }

function fieldHtml(f, val) {
  const req = f.required ? ' required' : '', hint = f.hint ? `<span class="hint">${esc(f.hint)}</span>` : '';
  const attrs = `name="${esc(f.name)}"${req}${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ''}`;
  if (f.type === 'select') return `<label>${esc(f.label)}<select ${attrs}>${opts(f.options, val, f.none)}</select>${hint}</label>`;
  if (f.type === 'textarea') return `<label>${esc(f.label)}<textarea ${attrs}>${esc(val)}</textarea>${hint}</label>`;
  if (f.type === 'checkbox') return `<label class="check"><input type="checkbox" name="${esc(f.name)}"${val ? ' checked' : ''}>${esc(f.label)}</label>`;
  if (f.type === 'multi') return `<label>${esc(f.label)}<div class="checks">${f.options.map(o => `<label class="check"><input type="checkbox" name="${esc(f.name)}" value="${esc(o.v)}"${(val || []).indexOf(o.v) >= 0 ? ' checked' : ''}>${esc(o.l)}</label>`).join('')}</div>${hint}</label>`;
  return `<label>${esc(f.label)}<input type="${esc(f.type || 'text')}" ${attrs} value="${esc(val)}"${f.type === 'password' ? ' autocomplete="new-password"' : ''}>${hint}</label>`;
}

function readForm(form, fields) {
  const out = {};
  fields.forEach(f => {
    if (f.type === 'checkbox') out[f.name] = form.elements[f.name].checked;
    else if (f.type === 'multi') out[f.name] = Array.from(form.querySelectorAll(`input[name="${f.name}"]:checked`)).map(i => i.value);
    else out[f.name] = form.elements[f.name].value;
  });
  return out;
}

/** Open a form in a dialog. onSave gets the values; the dialog closes when it succeeds. */
function formModal(title, fields, values, onSave, opt) {
  opt = opt || {};
  const m = $('#modal');
  m.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true"><h2>${esc(title)}</h2><form>
    ${opt.intro ? `<p class="muted small">${esc(opt.intro)}</p>` : ''}${fields.map(f => fieldHtml(f, (values || {})[f.name])).join('')}
    <div class="actions"><button type="button" class="btn" data-act="closeModal">Cancel</button><button class="btn primary">${esc(opt.save || 'Save')}</button></div></form></div>`;
  m.hidden = false;
  const form = $('form', m);
  if (opt.wire) opt.wire(form);
  const first = form.querySelector('input,select,textarea'); if (first) first.focus();
  form.onsubmit = e => {
    e.preventDefault();
    guard($('.btn.primary', form), async () => { await onSave(readForm(form, fields)); closeModal(); });
  };
}

/** Run an async handler: disable the button meanwhile, show any error. */
async function guard(el, fn) {
  const btn = el && el.tagName === 'BUTTON' ? el : null;
  if (btn) { if (btn.disabled) return; btn.disabled = true; }
  try { await fn(); } catch (e) { toast(e.message || String(e), true); } finally { if (btn) btn.disabled = false; }
}

/* ---------- event delegation ---------- */
document.addEventListener('click', e => {
  if (e.target.id === 'modal') return closeModal();
  const el = e.target.closest('[data-act]');
  if (!el || !ACT[el.dataset.act]) return;
  if (el.tagName === 'A') e.preventDefault();
  guard(el, () => ACT[el.dataset.act](el, e));
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-change]');
  if (el && ACT[el.dataset.change]) guard(null, () => ACT[el.dataset.change](el, e));
});
document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-submit]');
  if (!f || !ACT[f.dataset.submit]) return;
  e.preventDefault();
  guard(f.querySelector('button:not([type=button])'), () => ACT[f.dataset.submit](f, e));
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!$('#modal').hidden) closeModal(); else if (OPEN_TASK) ACT.closeDrawer();
});

/* ---------- sign-in ---------- */
function loginView() {
  const admin = PORTAL === 'admin';
  return `<div class="login"><form class="login-card" data-submit="login">
    <img class="logo-full" src="logo.png" alt="Sidra Healthcare"><div class="board-name">Action Hub</div>
    <h1>${admin ? 'Admin sign-in' : 'Member sign-in'}</h1>
    ${CFG.API_URL ? '' : '<div class="setup-note">This page is not connected yet. Add the Apps Script web app URL to <b>config.js</b>.</div>'}
    <label>Email<input name="email" type="email" autocomplete="username" required></label>
    <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
    <button class="btn primary block">Sign in</button>
    ${admin ? '<a class="alt" href="member.html">Team member? Sign in here</a>' : ''}
  </form></div>`;
}

ACT.login = async form => {
  const d = await api('login', { email: form.elements.email.value, password: form.elements.password.value, portal: PORTAL });
  store.set(tokenKey(), d.token);
  setState(d.state);
};

ACT.signOut = async () => {
  try { await api('logout'); } catch (e) { /* signing out locally is enough */ }
  store.del(tokenKey()); S.me = null; OPEN_TASK = null; render();
};

ACT.changePassword = () => formModal('Change my password', [
  { name: 'current', label: 'Current password', type: 'password', required: true },
  { name: 'next', label: 'New password', type: 'password', required: true, hint: 'At least 8 characters.' }
], {}, async v => { await api('changePassword', v); toast('Password changed.'); });

ACT.closeModal = () => closeModal();

/* ---------- render ---------- */
function render() {
  const app = $('#app');
  if (LOADING) { app.innerHTML = '<div class="loading">Loading the Action Hub…</div>'; return; }
  if (!S.me) { app.innerHTML = loginView(); closeModal(); $('#drawer').hidden = true; OPEN_TASK = null; return; }
  const y = window.scrollY;
  app.innerHTML = PAGE.shell();
  window.scrollTo(0, y);
  refreshDrawer();
}

async function boot(portal, page) {
  PORTAL = portal; PAGE = page;
  render();
  if (store.get(tokenKey())) {
    try { Object.assign(S, await api('bootstrap')); } catch (e) { /* falls through to the sign-in form */ }
  }
  LOADING = false;
  render();
  // Keep the board fresh and the "online" dot honest while the tab is open.
  setInterval(async () => {
    if (!S.me || document.hidden || !$('#modal').hidden) return;
    const typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (typing) return;
    try { setState(await api('bootstrap')); } catch (e) { /* try again next time */ }
  }, 120000);
}

/* ---------- task form (admin edits anything; members create tasks for themselves) ---------- */
function taskForm(t) {
  const admin = S.me.role === 'admin';
  t = t || { stage: S.stages[0], priority: 'Medium', assigneeId: admin ? '' : S.me.id };
  const fields = [
    { name: 'title', label: 'Title', required: true },
    { name: 'description', label: 'Description', type: 'textarea' },
    { name: 'stage', label: 'Stage', type: 'select', options: S.stages.map(s => ({ v: s, l: s })) },
    { name: 'projectId', label: 'Project', type: 'select', none: 'No project', options: S.projects.map(p => ({ v: p.id, l: p.name })) },
    { name: 'initiativeId', label: 'Initiative', type: 'select', none: 'No initiative', options: S.initiatives.map(i => ({ v: i.id, l: i.name })), hint: 'Filled in automatically when you choose a project.' }
  ];
  if (admin) fields.push({ name: 'assigneeId', label: 'Assigned to', type: 'select', none: 'Choose a person', options: userOpts(), required: true });
  fields.push({ name: 'priority', label: 'Priority', type: 'select', options: S.priorities.map(p => ({ v: p, l: p })) }, { name: 'dueDate', label: 'Due date', type: 'date' });
  formModal(t.id ? 'Edit task' : 'New task', fields, t, async v => {
    if (t.id) v.id = t.id;
    const r = await mutate('saveTask', v);
    toast(t.id ? 'Task saved.' : 'Task created.');
    if (!t.id && r && r.id) ACT.openTask({ dataset: { id: r.id } });
  }, {
    wire(form) {
      const sync = () => {
        const p = S.projects.find(x => x.id === form.elements.projectId.value);
        if (p) form.elements.initiativeId.value = p.initiativeId || '';
        form.elements.initiativeId.disabled = !!p;
      };
      form.elements.projectId.addEventListener('change', sync); sync();
    }
  });
}
ACT.newTask = el => taskForm(el && el.dataset.project ? { stage: S.stages[0], priority: 'Medium', projectId: el.dataset.project, assigneeId: S.me.role === 'admin' ? '' : S.me.id } : null);

/* ---------- task drawer ---------- */
function drawerHtml(t) {
  const me = S.me, admin = me.role === 'admin', canEdit = admin || t.assigneeId === me.id, d = DETAIL && DETAIL.detailFor === t.id ? DETAIL : null;
  const subs = S.subtasks.filter(s => s.taskId === t.id);
  const where = [pname(t.projectId), iname(t.initiativeId)].filter(Boolean).join(' · ');
  return `<div class="drawer-head"><h2>${esc(t.title)}</h2><button class="btn sm" data-act="closeDrawer" aria-label="Close">Close</button></div>
    <div class="chips">${stagePill(t.stage)}<span class="pill">${esc(t.priority)} priority</span>
      ${overdue(t) ? '<span class="pill red">Overdue</span>' : dueSoon(t) ? '<span class="pill amber">Due soon</span>' : ''}</div>
    <p class="small muted">Assigned to <b>${esc(uname(t.assigneeId))}</b> · Due ${dueHtml(t)}${where ? ' · ' + esc(where) : ''}</p>
    ${t.description ? `<p class="desc">${esc(t.description)}</p>` : ''}
    ${admin ? `<div class="row"><select data-change="drawerStage" aria-label="Stage" style="width:auto;margin:0">${opts(S.stages.map(s => ({ v: s, l: s })), t.stage)}</select>
      <button class="btn sm" data-act="editTask" data-id="${esc(t.id)}">Edit</button><button class="btn sm danger" data-act="deleteTask" data-id="${esc(t.id)}">Delete</button></div>` : ''}

    <section><h3>Progress</h3>
      ${canEdit && isOpen(t) ? `<div class="row"><input type="range" id="prog" min="0" max="100" step="5" value="${t.progress}" data-orig="${t.progress}" style="flex:1" aria-label="Progress"
        oninput="this.nextElementSibling.textContent=this.value+'%'"><b style="width:44px">${t.progress}%</b><button class="btn sm primary" data-act="saveProgress">Update</button></div>`
      : `<div class="row">${bar(tpct(t))}<b>${tpct(t)}%</b></div>`}</section>

    <section><h3>Subtasks ${subs.length ? `(${subs.filter(s => s.done).length}/${subs.length})` : ''}</h3>
      ${subs.map(s => {
        const mine = canEdit || s.ownerId === me.id || s.collaborators.indexOf(me.id) >= 0;
        const who = [uname(s.ownerId)].concat(s.collaborators.map(uname)).join(', ');
        return `<div class="sub ${s.done ? 'done' : ''}"><input type="checkbox" data-change="toggleSub" data-id="${esc(s.id)}"${s.done ? ' checked' : ''}${mine ? '' : ' disabled'} aria-label="Done">
          <span class="t">${esc(s.title)}<span class="hint">${esc(who)}</span></span>
          ${canEdit ? `<button class="btn sm" data-act="editSub" data-id="${esc(s.id)}">Edit</button><button class="btn sm danger" data-act="delSub" data-id="${esc(s.id)}">Remove</button>` : ''}</div>`;
      }).join('') || '<p class="muted small">No subtasks yet.</p>'}
      ${canEdit ? '<button class="btn sm" data-act="addSub">+ Add subtask</button>' : ''}</section>

    <section><h3>Discussion</h3>
      ${d ? (d.comments.map(c => `<div class="msg ${c.type === 'issue' ? 'issue' : ''}"><span class="small"><b>${esc(uname(c.userId))}</b>
        ${c.type === 'issue' ? '<span class="pill red">Issue</span>' : ''} <span class="muted">${esc(ftime(c.createdAt))}</span></span><p>${esc(c.text)}</p></div>`).join('') || '<p class="muted small">No comments yet.</p>')
      : '<p class="muted small">Loading…</p>'}
      <textarea id="commentText" placeholder="Write a comment or describe an issue" aria-label="Comment"></textarea>
      <div class="row" style="margin-top:8px"><button class="btn sm primary" data-act="comment">Comment</button><button class="btn sm danger" data-act="issue">Report an issue</button></div></section>

    <section><h3>Activity</h3>${d ? (d.activity.map(a => `<div class="act"><b>${esc(uname(a.userId))}</b> ${esc(a.text)} · ${esc(ftime(a.createdAt))}</div>`).join('') || '<p class="muted small">Nothing yet.</p>') : '<p class="muted small">Loading…</p>'}</section>`;
}

function refreshDrawer() {
  const el = $('#drawer'), t = OPEN_TASK && S.tasks.find(x => x.id === OPEN_TASK);
  if (!t) { OPEN_TASK = null; el.hidden = true; el.innerHTML = ''; return; }
  // keep what the person is in the middle of typing or sliding
  const draft = $('#commentText') ? $('#commentText').value : '', top = el.scrollTop;
  const old = $('#prog'), slid = old && old.value !== old.dataset.orig ? old.value : null;
  el.innerHTML = drawerHtml(t); el.hidden = false; el.scrollTop = top;
  if (draft) $('#commentText').value = draft;
  if (slid !== null && $('#prog')) { $('#prog').value = slid; $('#prog').nextElementSibling.textContent = slid + '%'; }
}

ACT.openTask = async el => {
  OPEN_TASK = el.dataset.id; DETAIL = null; refreshDrawer();
  const seq = ++DETAIL_SEQ, d = await api('getTask', { id: OPEN_TASK });
  if (OPEN_TASK === d.detailFor && seq === DETAIL_SEQ) { DETAIL = d; refreshDrawer(); }
};
ACT.closeDrawer = () => { OPEN_TASK = null; DETAIL = null; refreshDrawer(); };
ACT.saveProgress = async () => { const v = Number($('#prog').value); $('#prog').dataset.orig = String(v); await mutate('updateProgress', { id: OPEN_TASK, progress: v }); toast('Progress updated.'); };
ACT.toggleSub = async el => { try { await mutate('toggleSubtask', { id: el.dataset.id, done: el.checked }); } catch (e) { refreshDrawer(); throw e; } };
ACT.delSub = async el => { if (confirm('Remove this subtask?')) await mutate('deleteSubtask', { id: el.dataset.id }); };

function subForm(s) {
  const t = S.tasks.find(x => x.id === OPEN_TASK);
  formModal(s ? 'Edit subtask' : 'Add subtask', [
    { name: 'title', label: 'Subtask', required: true },
    { name: 'ownerId', label: 'Owner', type: 'select', options: userOpts() },
    { name: 'collaborators', label: 'Collaborators', type: 'multi', options: userOpts(), hint: 'Owners and collaborators can see this task and tick the subtask.' }
  ], s || { ownerId: t.assigneeId, collaborators: [] }, v => mutate('saveSubtask', Object.assign(v, { taskId: OPEN_TASK, id: s ? s.id : undefined })));
}
ACT.addSub = () => subForm(null);
ACT.editSub = el => subForm(S.subtasks.find(s => s.id === el.dataset.id));

async function postComment(type) {
  const box = $('#commentText'), text = box.value.trim();
  if (!text) { box.focus(); throw new Error(type === 'issue' ? 'Describe the issue first.' : 'Write a comment first.'); }
  box.value = '';
  try { await mutate('addComment', { taskId: OPEN_TASK, text, type }); } catch (e) { if ($('#commentText')) $('#commentText').value = text; throw e; }
  toast(type === 'issue' ? 'Issue reported to the admin.' : 'Comment added.');
}
ACT.comment = () => postComment('comment');
ACT.issue = () => postComment('issue');
