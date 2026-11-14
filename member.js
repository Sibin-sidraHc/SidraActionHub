/* Sidra Action Hub - member page. */
'use strict';

let TAB = 'mine';
const TABS = [['mine', 'My tasks'], ['subtasks', 'My subtasks'], ['collab', 'Collaborating'], ['created', 'Created by me']];

function tabTasks(tab) {
  const me = S.me.id, has = fn => t => S.subtasks.some(s => s.taskId === t.id && fn(s));
  if (tab === 'mine') return S.tasks.filter(t => t.assigneeId === me);
  if (tab === 'subtasks') return S.tasks.filter(has(s => s.ownerId === me));
  if (tab === 'collab') return S.tasks.filter(has(s => s.collaborators.indexOf(me) >= 0));
  return S.tasks.filter(t => t.createdBy === me);
}

const EMPTY = {
  mine: 'No tasks are assigned to you right now.',
  subtasks: 'You do not own any subtasks yet.',
  collab: 'You are not collaborating on any subtasks yet.',
  created: 'You have not created any tasks yet.'
};

const MemberPage = {
  shell() {
    const order = t => (isOpen(t) ? 0 : 1) + (t.dueDate || '9999');
    const list = tabTasks(TAB).slice().sort((a, b) => order(a) < order(b) ? -1 : 1);
    const mine = tabTasks('mine');
    return `<header class="mtop"><div class="brand"><img class="logo" src="logo-mark.png" alt="Sidra Healthcare"><div><b>Sidra Action Hub</b><small>${esc(S.me.name)}</small></div></div>
      <button class="btn primary right" data-act="newTask">+ New task</button><button class="btn" data-act="changePassword">Change password</button><button class="btn" data-act="signOut">Sign out</button></header>
    <div class="mwrap">
      <div class="stats"><div class="stat"><b>${mine.filter(isOpen).length}</b><span>Open</span></div><div class="stat bad"><b>${mine.filter(overdue).length}</b><span>Overdue</span></div>
        <div class="stat warn"><b>${mine.filter(dueSoon).length}</b><span>Due in 3 days</span></div><div class="stat good"><b>${mine.filter(t => !isOpen(t)).length}</b><span>Completed</span></div></div>
      <div class="tabs" role="tablist">${TABS.map(([k, l]) => `<button class="tab ${TAB === k ? 'on' : ''}" role="tab" aria-selected="${TAB === k}" data-act="tab" data-tab="${k}">${l} (${tabTasks(k).length})</button>`).join('')}</div>
      ${list.map(t => {
        const subs = S.subtasks.filter(s => s.taskId === t.id), where = [pname(t.projectId), iname(t.initiativeId)].filter(Boolean).join(' · ');
        return `<div class="card mcard" data-act="openTask" data-id="${esc(t.id)}"><div class="row">${stagePill(t.stage)}${overdue(t) ? '<span class="pill red">Overdue</span>' : dueSoon(t) ? '<span class="pill amber">Due soon</span>' : ''}<span class="right small">${dueHtml(t)}</span></div>
          <b style="margin-top:8px">${esc(t.title)}</b>${where ? `<span class="small muted">${esc(where)}</span>` : ''}
          <div class="meta">${bar(tpct(t))}<span>${subs.length ? subs.filter(s => s.done).length + '/' + subs.length + ' subtasks' : tpct(t) + '%'}</span></div>
          ${t.assigneeId !== S.me.id ? `<div class="meta"><span>Assigned to ${esc(uname(t.assigneeId))}</span></div>` : ''}</div>`;
      }).join('') || `<div class="empty">${EMPTY[TAB]}</div>`}
    </div>`;
  }
};

ACT.tab = el => { TAB = el.dataset.tab; render(); };

boot('member', MemberPage);
