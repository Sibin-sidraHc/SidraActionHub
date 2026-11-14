/* Sidra Action Hub - admin page. */
'use strict';

const NAV = [['board', 'Board'], ['initiatives', 'Initiatives'], ['projects', 'Projects'], ['team', 'Team'], ['overview', 'Overview']];
const TITLES = { board: 'Kanban board', initiatives: 'Initiatives', initiative: 'Initiative', projects: 'Projects', project: 'Project', team: 'Team overview', overview: 'Overview', settings: 'Settings' };
const FILTER = { assignee: '', project: '' };
let SETTINGS = null, SETTINGS_ERR = '', TPL_STATUS = null;

const route = () => { const [v, id] = (location.hash.slice(1) || 'board').split('/'); return { v: TITLES[v] ? v : 'board', id }; };
window.addEventListener('hashchange', () => { if (S.me) { render(); window.scrollTo(0, 0); } });

const flags = (tasks, manual) => (manual ? '<span class="pill red">Red flag</span> ' : '') +
  (tasks.filter(overdue).length ? `<span class="pill red">${tasks.filter(overdue).length} overdue</span>` : '');
const lines = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);

/* ---------- shell ---------- */
const AdminPage = {
  shell() {
    const r = route(), top = { initiative: 'initiatives', project: 'projects' }[r.v] || r.v;
    return `<div class="layout"><nav class="side" aria-label="Main">
      <div class="brand"><img src="logo.png" alt="Sidra Healthcare"><small>Action Hub · Admin</small></div>
      <div class="nav-title">Workspace</div>
      ${NAV.map(([k, l]) => `<a class="nav ${top === k ? 'on' : ''}" href="#${k}">${l}</a>`).join('')}
      <div class="nav-title">Admin</div>
      <a class="nav ${top === 'settings' ? 'on' : ''}" href="#settings">Settings</a>
      <div class="side-foot"><span class="who"><b>${esc(S.me.name)}</b><br><span class="small">${esc(S.me.email)}</span></span><button class="btn sm" data-act="signOut">Sign out</button></div>
    </nav><main><header class="top"><h1>${TITLES[r.v]}</h1><button class="btn primary right" data-act="newTask">+ New task</button></header>
    <section class="content">${VIEWS[r.v](r.id)}</section></main></div>`;
  }
};

const VIEWS = {
  /* ----- kanban ----- */
  board() {
    const list = S.tasks.filter(t => (!FILTER.assignee || t.assigneeId === FILTER.assignee) && (!FILTER.project || t.projectId === FILTER.project));
    return `<div class="filters">
      <select data-change="filter" data-key="assignee" aria-label="Filter by person">${opts(S.users.map(u => ({ v: u.id, l: u.name })), FILTER.assignee, 'Everyone')}</select>
      <select data-change="filter" data-key="project" aria-label="Filter by project">${opts(S.projects.map(p => ({ v: p.id, l: p.name })), FILTER.project, 'All projects')}</select>
      <span class="muted small">Drag a card to another column to change its stage.</span></div>
    <div class="board">${S.stages.map(st => {
      const col = list.filter(t => t.stage === st);
      return `<div class="col" data-stage="${esc(st)}"><div class="col-head">${esc(st)} <span>${col.length}</span></div>${col.map(t => {
        const subs = S.subtasks.filter(s => s.taskId === t.id);
        return `<div class="card" draggable="true" data-act="openTask" data-id="${esc(t.id)}"><b>${esc(t.title)}</b>
          ${t.projectId ? `<span class="pill">${esc(pname(t.projectId))}</span>` : ''}
          <div class="meta"><span>${esc(uname(t.assigneeId))}</span>${dueHtml(t)}</div>
          <div class="meta">${bar(tpct(t))}<span>${subs.length ? subs.filter(s => s.done).length + '/' + subs.length + ' subtasks' : tpct(t) + '%'}</span></div></div>`;
      }).join('')}</div>`;
    }).join('')}</div>`;
  },

  /* ----- initiatives ----- */
  initiatives() {
    return `<div class="row" style="margin-bottom:14px"><button class="btn" data-act="editInitiative">+ New initiative</button></div>
    <div class="tiles">${S.initiatives.map(i => {
      const tasks = S.tasks.filter(t => t.initiativeId === i.id), p = pct(tasks);
      return `<a class="tile" href="#initiative/${esc(i.id)}"><h2>${esc(i.name)}</h2>
        <div class="chips">${stagePill(i.stage)} ${flags(tasks, i.redFlag)}</div>
        <div class="row small muted" style="margin-bottom:8px"><span>Owner: ${esc(uname(i.ownerId))}</span><span class="right">${S.projects.filter(x => x.initiativeId === i.id).length} projects · ${tasks.length} tasks</span></div>
        <div class="row">${bar(p)}<b class="small">${p}%</b></div></a>`;
    }).join('') || '<div class="empty">No initiatives yet. Create the first one.</div>'}</div>`;
  },

  initiative(id) {
    const i = S.initiatives.find(x => x.id === id);
    if (!i) return '<div class="empty">This initiative no longer exists. <a href="#initiatives">Back to initiatives</a></div>';
    const tasks = S.tasks.filter(t => t.initiativeId === i.id), projects = S.projects.filter(p => p.initiativeId === i.id);
    return `<a class="crumb" href="#initiatives">← All initiatives</a>
    <div class="panel"><div class="row"><h2>${esc(i.name)}</h2>${stagePill(i.stage)} ${flags(tasks, i.redFlag)}
      <button class="btn sm right" data-act="editInitiative" data-id="${esc(i.id)}">Edit</button><button class="btn sm danger" data-act="deleteInitiative" data-id="${esc(i.id)}">Delete</button></div>
      ${i.description ? `<p class="desc">${esc(i.description)}</p>` : ''}
      <p class="small muted">Owner: <b>${esc(uname(i.ownerId))}</b> · Team: ${esc(i.team.map(uname).join(', ') || 'nobody yet')}</p>
      <div class="row">${bar(pct(tasks))}<b>${pct(tasks)}%</b></div></div>
    <div class="cols2">
      <div class="panel"><h2>Milestones</h2>${i.milestones.map(m => `<div class="sub ${m.done ? 'done' : ''}"><span class="dot ${m.done ? 'on' : ''}"></span><span class="t">${esc(m.title)}</span>
        <span class="small ${!m.done && m.date && m.date < S.today ? 'due late' : 'muted'}">${esc(fdate(m.date))}</span></div>`).join('') || '<p class="muted small">No milestones yet.</p>'}</div>
      <div class="panel"><h2>Risks</h2>${i.risks.map(r => `<div class="sub"><span class="pill ${r.level === 'High' ? 'red' : r.level === 'Medium' ? 'amber' : 'green'}">${esc(r.level)}</span><span class="t">${esc(r.text)}</span></div>`).join('') || '<p class="muted small">No risks recorded.</p>'}</div>
    </div>
    <div class="panel"><div class="row" style="margin-bottom:10px"><h2>Projects</h2><button class="btn sm right" data-act="editProject" data-initiative="${esc(i.id)}">+ New project</button></div>${projectTable(projects)}</div>
    <div class="panel"><h2>Tasks</h2>${taskTable(tasks)}</div>`;
  },

  /* ----- projects ----- */
  projects() {
    return `<div class="row" style="margin-bottom:14px"><button class="btn" data-act="editProject">+ New project</button></div><div class="panel">${projectTable(S.projects)}</div>`;
  },

  project(id) {
    const p = S.projects.find(x => x.id === id);
    if (!p) return '<div class="empty">This project no longer exists. <a href="#projects">Back to projects</a></div>';
    const tasks = S.tasks.filter(t => t.projectId === p.id);
    return `<a class="crumb" href="#projects">← All projects</a>
    <div class="panel"><div class="row"><h2>${esc(p.name)}</h2><span class="pill">${esc(p.status)}</span> ${flags(tasks)}
      <button class="btn sm right" data-act="editProject" data-id="${esc(p.id)}">Edit</button><button class="btn sm danger" data-act="deleteProject" data-id="${esc(p.id)}">Delete</button></div>
      ${p.description ? `<p class="desc">${esc(p.description)}</p>` : ''}
      <p class="small muted">Owner: <b>${esc(uname(p.ownerId))}</b>${p.initiativeId ? ` · Initiative: <a href="#initiative/${esc(p.initiativeId)}">${esc(iname(p.initiativeId))}</a>` : ''}</p>
      <div class="row">${bar(pct(tasks))}<b>${pct(tasks)}%</b></div></div>
    <div class="panel"><div class="row" style="margin-bottom:10px"><h2>Tasks</h2><button class="btn sm right" data-act="newTask" data-project="${esc(p.id)}">+ New task</button></div>${taskTable(tasks)}</div>`;
  },

  /* ----- team ----- */
  team() {
    return `<div class="panel"><div class="tablewrap"><table><tr><th>Member</th><th>Status</th><th>Open</th><th>Overdue</th><th>Completed</th></tr>${activeUsers().map(u => {
      const mine = S.tasks.filter(t => t.assigneeId === u.id), late = mine.filter(overdue).length;
      return `<tr><td><b>${esc(u.name)}</b>${u.role === 'admin' ? ' <span class="pill">Admin</span>' : ''}<span class="hint">${esc(u.email)}</span></td>
        <td><span class="dot ${u.online ? 'on' : ''}"></span>${u.online ? 'Online' : (u.lastSeen ? 'Last seen ' + esc(ftime(u.lastSeen)) : 'Never signed in')}</td>
        <td>${mine.filter(isOpen).length}</td><td>${late ? `<span class="pill red">${late}</span>` : '0'}</td><td>${mine.filter(t => !isOpen(t)).length}</td></tr>`;
    }).join('')}</table></div></div><p class="muted small">Add members and set passwords in <a href="#settings">Settings</a>.</p>`;
  },

  /* ----- overview ----- */
  overview() {
    const T = S.tasks, open = T.filter(isOpen), late = T.filter(overdue), soon = T.filter(dueSoon);
    const max = Math.max(1, ...activeUsers().map(u => open.filter(t => t.assigneeId === u.id).length));
    const maxS = Math.max(1, ...S.stages.map(s => T.filter(t => t.stage === s).length));
    return `<div class="stats">
      <div class="stat"><b>${T.length}</b><span>Total tasks</span></div><div class="stat"><b>${open.length}</b><span>Open</span></div>
      <div class="stat bad"><b>${late.length}</b><span>Overdue</span></div><div class="stat warn"><b>${soon.length}</b><span>Due in 3 days</span></div>
      <div class="stat good"><b>${T.length - open.length}</b><span>Completed</span></div></div>
    <div class="cols2">
      <div class="panel"><h2>Workload by team member</h2>${activeUsers().map(u => { const n = open.filter(t => t.assigneeId === u.id).length; return `<div class="barrow"><span>${esc(u.name)}</span>${bar(n / max * 100)}<b>${n}</b></div>`; }).join('')}<p class="muted small">Open tasks per person.</p></div>
      <div class="panel"><h2>Tasks by stage</h2>${S.stages.map(s => { const n = T.filter(t => t.stage === s).length; return `<div class="barrow"><span>${esc(s)}</span>${bar(n / maxS * 100)}<b>${n}</b></div>`; }).join('')}</div>
    </div>
    <div class="panel"><h2>Overdue</h2>${taskTable(late, 'Nothing is overdue.')}</div>
    <div class="panel"><h2>Due soon</h2>${taskTable(soon, 'Nothing is due in the next 3 days.')}</div>`;
  },

  /* ----- settings ----- */
  settings() {
    if (!SETTINGS) {
      if (SETTINGS_ERR) return `<div class="empty">${esc(SETTINGS_ERR)} <button class="btn sm" data-act="reloadSettings">Try again</button></div>`;
      loadSettings();
      return '<div class="loading">Loading settings…</div>';
    }
    const s = SETTINGS.settings, on = k => s[k] === 'true' ? ' checked' : '', meta = s.provider === 'meta';
    const members = S.users.filter(u => u.role === 'member');
    return `<div class="panel"><div class="row" style="margin-bottom:10px"><h2>Members and passwords</h2><button class="btn sm right" data-act="editMember">+ Add member</button></div>
      <div class="tablewrap"><table><tr><th>Name</th><th>Email</th><th>WhatsApp</th><th>Status</th><th></th></tr>${members.map(u => `<tr><td><b>${esc(u.name)}</b></td><td>${esc(u.email)}</td>
        <td>${u.whatsapp ? '+' + esc(u.whatsapp) : '<span class="pill amber">No number</span>'}</td><td>${u.active ? '<span class="pill green">Active</span>' : '<span class="pill">Deactivated</span>'}</td>
        <td><div class="row" style="justify-content:flex-end"><button class="btn sm" data-act="editMember" data-id="${esc(u.id)}">Edit</button><button class="btn sm" data-act="resetPassword" data-id="${esc(u.id)}">Reset password</button>
        <button class="btn sm ${u.active ? 'danger' : ''}" data-act="toggleMember" data-id="${esc(u.id)}">${u.active ? 'Deactivate' : 'Activate'}</button></div></td></tr>`).join('') || '<tr><td colspan="5" class="empty">No members yet.</td></tr>'}</table></div></div>

    <div class="panel"><h2>Admin account</h2><form data-submit="saveAdmin"><div class="grid2">
      <label>Name<input name="name" value="${esc(S.me.name)}" required></label><label>Admin email<input name="email" type="email" value="${esc(S.me.email)}" required></label>
      <label>Current password<input name="currentPassword" type="password" autocomplete="current-password" required></label>
      <label>New password<input name="newPassword" type="password" autocomplete="new-password"><span class="hint">Leave empty to keep the current one.</span></label>
      </div><button class="btn primary">Save admin account</button></form></div>

    <div class="panel"><h2>WhatsApp</h2><form data-submit="saveSettings"><div class="grid2">
      <label>Provider<select name="provider">${opts([{ v: 'off', l: 'Off (email only)' }, { v: 'meta', l: 'Meta WhatsApp Cloud API' }, { v: 'generic', l: 'Generic JSON provider' }], s.provider)}</select></label>
      <label>API key<input name="apiKey" type="password" autocomplete="off" placeholder="${SETTINGS.apiKeySet ? 'Saved. Type a new key to replace it.' : 'Paste the key'}"><span class="hint">Write-only: once saved it is never shown again.</span></label>
      <label>Phone number ID<input name="phoneNumberId" inputmode="numeric" value="${esc(s.phoneNumberId)}"></label>
      <label>Business account ID<input name="businessAccountId" inputmode="numeric" value="${esc(s.businessAccountId)}"></label>
      <label>Admin WhatsApp number<input name="adminWhatsapp" type="tel" value="${esc(s.adminWhatsapp)}" placeholder="971501234567"><span class="hint">With country code. Reports go here.</span></label>
      <label>Generic provider URL<input name="genericUrl" type="url" value="${esc(s.genericUrl)}" placeholder="https://"><span class="hint">Only for the generic JSON provider.</span></label>
      <label>Action Hub link<input name="boardUrl" type="url" value="${esc(s.boardUrl)}" placeholder="https://…github.io/…/member.html"><span class="hint">Added to emails so people can open the Action Hub.</span></label>
      <label>Graph API version<input name="graphVersion" value="${esc(s.graphVersion)}" placeholder="v21.0"></label></div>
      <label>Delivery-status webhook URL<input readonly value="${esc(SETTINGS.webhookUrl)}" onclick="this.select()"><span class="hint">Copy this into the provider's webhook settings. Verify token: ${esc(SETTINGS.verifyToken)}</span></label>
      <h3 style="margin:14px 0 8px">Reminders and reports</h3>
      <div class="checks" style="margin-bottom:12px">
        <label class="check"><input type="checkbox" name="remindersOn"${on('remindersOn')}>Member reminders, daily about 08:00</label>
        <label class="check"><input type="checkbox" name="dailyOn"${on('dailyOn')}>Daily report, about 18:00</label>
        <label class="check"><input type="checkbox" name="weeklyOn"${on('weeklyOn')}>Weekly report, Mondays</label>
        <label class="check"><input type="checkbox" name="monthlyOn"${on('monthlyOn')}>Monthly report, 1st of the month</label></div>
      <div class="row"><button class="btn primary">Save settings</button><button type="button" class="btn" data-act="testMessage">Send a test message</button><button type="button" class="btn" data-act="reportNow">Send the complete report now</button></div></form></div>

    <div class="panel"><h2>Message templates</h2><p class="muted small">Meta must approve these before WhatsApp messages can be delivered.</p>
      <div class="tablewrap"><table><tr><th>Template</th><th>Text</th><th>Status</th></tr>${SETTINGS.templates.map(t => { const st = (TPL_STATUS || []).find(x => x.name === t.name);
        return `<tr><td><b>${esc(t.name)}</b></td><td class="small">${esc(t.text)}</td><td>${st ? `<span class="pill ${st.status === 'APPROVED' ? 'green' : st.status === 'ERROR' || st.status === 'REJECTED' ? 'red' : 'amber'}">${esc(st.status)}</span>${st.note ? `<span class="hint">${esc(st.note)}</span>` : ''}` : '<span class="muted small">Not checked</span>'}</td></tr>`; }).join('')}</table></div>
      <div class="row" style="margin-top:12px"><button class="btn" data-act="submitTemplates"${meta ? '' : ' disabled'}>Submit for approval</button><button class="btn" data-act="templateStatus"${meta ? '' : ' disabled'}>Check status</button>
      ${meta ? '' : '<span class="muted small">Choose the Meta provider and save to use templates.</span>'}</div></div>

    <div class="panel"><div class="row" style="margin-bottom:10px"><h2>Message log</h2><button class="btn sm right" data-act="reloadSettings">Refresh</button></div>
      <div class="tablewrap"><table><tr><th>When</th><th>Type</th><th>Channel</th><th>To</th><th>Status</th><th>Tries</th></tr>${SETTINGS.messages.map(m => `<tr><td class="small">${esc(ftime(m.createdAt))}</td><td>${esc(m.kind)}</td><td>${esc(m.channel)}</td>
        <td class="small">${esc(uname(m.userId))}<span class="hint">${esc(m.to)}</span></td><td><span class="pill ${m.status === 'failed' ? 'red' : m.status === 'read' || m.status === 'delivered' ? 'green' : m.status === 'queued' ? 'amber' : ''}">${esc(m.status)}</span>${m.error ? `<span class="hint">${esc(m.error)}</span>` : ''}</td><td>${esc(m.attempts)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">No messages sent yet.</td></tr>'}</table></div>
      <p class="muted small">Email shows "sent" only: email has no delivery receipt. WhatsApp moves to delivered and read once the webhook is connected.</p></div>`;
  }
};

function projectTable(list) {
  if (!list.length) return '<div class="empty">No projects yet.</div>';
  return `<div class="tablewrap"><table><tr><th>Project</th><th>Initiative</th><th>Status</th><th>Owner</th><th>Tasks</th><th>Progress</th></tr>${list.map(p => {
    const tasks = S.tasks.filter(t => t.projectId === p.id);
    return `<tr class="click" data-act="go" data-to="project/${esc(p.id)}"><td><b>${esc(p.name)}</b></td><td>${esc(iname(p.initiativeId) || '-')}</td><td><span class="pill">${esc(p.status)}</span></td>
      <td>${esc(uname(p.ownerId))}</td><td>${tasks.length}</td><td>${bar(pct(tasks))}</td></tr>`;
  }).join('')}</table></div>`;
}

/* ---------- actions ---------- */
ACT.go = el => { location.hash = el.dataset.to; };
ACT.filter = el => { FILTER[el.dataset.key] = el.value; render(); };
ACT.editTask = el => taskForm(S.tasks.find(t => t.id === el.dataset.id));
ACT.deleteTask = async el => { if (confirm('Delete this task with its subtasks and discussion? This cannot be undone.')) { await mutate('deleteTask', { id: el.dataset.id }); toast('Task deleted.'); } };
ACT.drawerStage = el => moveTask(OPEN_TASK, el.value);

async function moveTask(id, stage) {
  const t = S.tasks.find(x => x.id === id);
  if (!t || t.stage === stage) return;
  const before = t.stage;
  t.stage = stage; render(); // show the move at once, then confirm with the server
  try { await mutate('moveTask', { id, stage }); } catch (e) { t.stage = before; render(); throw e; }
}

// drag and drop between kanban columns
let DRAG = null;
document.addEventListener('dragstart', e => { const c = e.target.closest && e.target.closest('.card'); if (c) { DRAG = c.dataset.id; c.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', DRAG); } });
document.addEventListener('dragend', () => { DRAG = null; document.querySelectorAll('.dragging,.over').forEach(x => x.classList.remove('dragging', 'over')); });
document.addEventListener('dragover', e => { const col = DRAG && e.target.closest('.col'); if (!col) return; e.preventDefault(); document.querySelectorAll('.col.over').forEach(x => x !== col && x.classList.remove('over')); col.classList.add('over'); });
document.addEventListener('drop', e => { const col = DRAG && e.target.closest('.col'); if (!col) return; e.preventDefault(); const id = DRAG; DRAG = null; guard(null, () => moveTask(id, col.dataset.stage)); });

ACT.editInitiative = el => {
  const i = S.initiatives.find(x => x.id === el.dataset.id);
  const v = i ? Object.assign({}, i, {
    milestones: i.milestones.map(m => [m.title, m.date, m.done ? 'done' : ''].filter(Boolean).join(' | ')).join('\n'),
    risks: i.risks.map(r => r.level + ' | ' + r.text).join('\n')
  }) : { stage: S.stages[0], team: [] };
  formModal(i ? 'Edit initiative' : 'New initiative', [
    { name: 'name', label: 'Name', required: true, placeholder: 'Home nursing expansion' },
    { name: 'description', label: 'Description', type: 'textarea' },
    { name: 'stage', label: 'Stage', type: 'select', options: S.stages.map(s => ({ v: s, l: s })) },
    { name: 'ownerId', label: 'Owner', type: 'select', none: 'No owner', options: userOpts() },
    { name: 'team', label: 'Team', type: 'multi', options: userOpts() },
    { name: 'milestones', label: 'Milestones', type: 'textarea', hint: 'One per line: Title | 2026-12-01 | done', placeholder: 'Licence approved | 2026-12-01' },
    { name: 'risks', label: 'Risks', type: 'textarea', hint: 'One per line: High | description', placeholder: 'High | Nurse hiring is behind' },
    { name: 'redFlag', label: 'Raise a red flag on this initiative', type: 'checkbox' }
  ], v, async f => {
    f.id = i ? i.id : undefined;
    f.milestones = lines(f.milestones).map(l => { const p = l.split('|').map(x => x.trim()); return { title: p[0], date: p.find(x => /^\d{4}-\d{2}-\d{2}$/.test(x)) || '', done: p.slice(1).some(x => /^done$/i.test(x)) }; });
    f.risks = lines(f.risks).map(l => { const p = l.split('|').map(x => x.trim()); const lv = ['Low', 'Medium', 'High'].find(x => x.toLowerCase() === p[0].toLowerCase()); return { level: lv || 'Medium', text: lv ? p.slice(1).join(' | ') : l }; });
    const r = await mutate('saveInitiative', f);
    toast('Initiative saved.');
    if (!i) location.hash = 'initiative/' + r.id;
  });
};
ACT.deleteInitiative = async el => { if (confirm('Delete this initiative? Its projects and tasks are kept but unlinked.')) { await mutate('deleteInitiative', { id: el.dataset.id }); location.hash = 'initiatives'; } };

ACT.editProject = el => {
  const p = S.projects.find(x => x.id === el.dataset.id);
  formModal(p ? 'Edit project' : 'New project', [
    { name: 'name', label: 'Name', required: true, placeholder: 'Al Ain branch launch' },
    { name: 'description', label: 'Description', type: 'textarea' },
    { name: 'initiativeId', label: 'Initiative', type: 'select', none: 'No initiative', options: S.initiatives.map(i => ({ v: i.id, l: i.name })) },
    { name: 'status', label: 'Status', type: 'select', options: S.statuses.map(s => ({ v: s, l: s })) },
    { name: 'ownerId', label: 'Owner', type: 'select', none: 'No owner', options: userOpts() }
  ], p || { status: S.statuses[0], initiativeId: el.dataset.initiative || '' }, async f => {
    f.id = p ? p.id : undefined;
    await mutate('saveProject', f);
    toast('Project saved.');
  });
};
ACT.deleteProject = async el => { if (confirm('Delete this project? Its tasks are kept but unlinked.')) { await mutate('deleteProject', { id: el.dataset.id }); location.hash = 'projects'; } };

/* ----- settings actions ----- */
async function loadSettings() {
  try { SETTINGS = await api('getSettings'); SETTINGS_ERR = ''; } catch (e) { SETTINGS_ERR = e.message; }
  if (S.me) render();
}
ACT.reloadSettings = () => { SETTINGS = null; SETTINGS_ERR = ''; render(); };

ACT.editMember = el => {
  const u = S.users.find(x => x.id === el.dataset.id);
  const fields = [
    { name: 'name', label: 'Name', required: true },
    { name: 'email', label: 'Email', type: 'email', required: true },
    { name: 'whatsapp', label: 'WhatsApp number', type: 'tel', placeholder: '971501234567', hint: 'With country code. Leave empty for email only.' }
  ];
  if (!u) fields.push({ name: 'password', label: 'Starting password', type: 'password', required: true, hint: 'At least 8 characters. Give it to the member; they can change it.' });
  formModal(u ? 'Edit member' : 'Add member', fields, u || {}, async f => { f.id = u ? u.id : undefined; await mutate('saveMember', f); toast(u ? 'Member saved.' : 'Member added.'); });
};
ACT.resetPassword = el => formModal('Reset password for ' + uname(el.dataset.id), [
  { name: 'password', label: 'New password', type: 'password', required: true, hint: 'At least 8 characters. The member is signed out everywhere.' }
], {}, async f => { await api('resetPassword', { id: el.dataset.id, password: f.password }); toast('Password reset.'); });
ACT.toggleMember = async el => {
  const u = user(el.dataset.id);
  if (u.active && !confirm('Deactivate ' + u.name + '? They will not be able to sign in.')) return;
  await mutate('setMemberActive', { id: u.id, active: !u.active });
};
ACT.saveAdmin = async form => {
  const f = Object.fromEntries(new FormData(form).entries());
  await mutate('saveAdminAccount', f);
  toast('Admin account saved.');
};
ACT.saveSettings = async form => {
  const f = Object.fromEntries(new FormData(form).entries());
  ['remindersOn', 'dailyOn', 'weeklyOn', 'monthlyOn'].forEach(k => { f[k] = form.elements[k].checked; });
  SETTINGS = await api('saveSettings', f);
  render(); toast('Settings saved.');
};
ACT.testMessage = async () => { SETTINGS = await api('testMessage'); render(); toast('Test sent. Check the message log below.'); };
ACT.reportNow = async () => { SETTINGS = await api('sendReportNow'); render(); toast('Complete report sent.'); };
ACT.submitTemplates = async () => { TPL_STATUS = await api('submitTemplates'); render(); toast('Templates submitted.'); };
ACT.templateStatus = async () => { TPL_STATUS = await api('templateStatus'); render(); };

const _signOut = ACT.signOut;
ACT.signOut = async () => { SETTINGS = null; TPL_STATUS = null; await _signOut(); };

boot('admin', AdminPage);
