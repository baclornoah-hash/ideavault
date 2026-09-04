'use strict';
/* ============================================================
   LOOM — an idea-catching system
   Vanilla HTML / CSS / JS. No frameworks, no backend.
   ============================================================ */

/* ---------- constants ---------- */
const STORAGE_KEY = 'loom.ideas.v1';

const TYPES = [
  'Screenplay','Story','Character','Scene','Plot / Concept','Worldbuilding',
  'Website','App','Business','Content','Essay','Poetry','Research','Learning',
  'Personal','Random Thought','Brain Dump','Uncategorized'
];

const STATUSES = [
  { value:'inbox',      label:'Inbox' },
  { value:'clarifying', label:'Clarifying' },
  { value:'active',     label:'Active' },
  { value:'paused',     label:'Paused' },
  { value:'completed',  label:'Completed' },
  { value:'archived',   label:'Archived' },
  { value:'rejected',   label:'Not for now' }
];

const PROGRESS = [
  { value:'',                label:'Not set' },
  { value:'just-idea',       label:'Just an idea' },
  { value:'exploring',       label:'Exploring' },
  { value:'developing',      label:'Developing' },
  { value:'drafting',        label:'Drafting' },
  { value:'revising',        label:'Revising' },
  { value:'nearly-finished', label:'Nearly finished' },
  { value:'completed',       label:'Completed' }
];

const CREATIVE_TYPES = ['Screenplay','Story','Character','Scene','Plot / Concept','Worldbuilding','Poetry','Essay'];
const PRODUCTIVE_TYPES = ['Website','App','Business','Content','Research','Learning'];

/* ---------- state ---------- */
let ideas = [];
let currentView = 'dashboard';
let currentDetailId = null;
let pendingSlotIdeaId = null;
let reviewQueue = [];
let reviewIndex = 0;
let recognition = null;
let recognizing = false;

/* ============================================================
   STORAGE
   ============================================================ */
function loadIdeas(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  }catch(e){
    console.error('Loom: could not read saved ideas', e);
    return [];
  }
}
function persist(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ideas));
  }catch(e){
    console.error('Loom: could not save', e);
    toast("Couldn't save — your device storage may be full.");
  }
}

/* ============================================================
   UTIL
   ============================================================ */
function uid(){
  return 'i_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8);
}
function nowIso(){ return new Date().toISOString(); }
function escapeHtml(str){
  return String(str == null ? '' : str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function statusLabel(v){ const s = STATUSES.find(s=>s.value===v); return s ? s.label : v; }
function progressLabel(v){ const p = PROGRESS.find(p=>p.value===v); return p ? p.label : ''; }
function timeAgo(iso){
  if(!iso) return 'Never';
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const min = Math.floor(diff/60000);
  if(min < 1) return 'just now';
  if(min < 60) return min + 'm ago';
  const hr = Math.floor(min/60);
  if(hr < 24) return hr + 'h ago';
  const day = Math.floor(hr/24);
  if(day < 7) return day + 'd ago';
  const wk = Math.floor(day/7);
  if(wk < 5) return wk + 'w ago';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'});
}
function formatDate(iso){
  if(!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'});
}
function parseListInput(str){
  return (str||'').split(',').map(s=>s.trim()).filter(Boolean);
}
function debounce(fn, ms){
  let t;
  return function(...args){ clearTimeout(t); t = setTimeout(()=>fn.apply(this,args), ms); };
}
function isTypingTarget(el){
  if(!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}
function anyModalOpen(){
  return !captureModalOverlay.hidden || !detailModalOverlay.hidden || !slotModalOverlay.hidden;
}

/* ============================================================
   CRUD
   ============================================================ */
function createIdea({ title, details, type }){
  const idea = {
    id: uid(),
    title: (title||'').trim() || 'Untitled idea',
    details: (details||'').trim(),
    description: '',
    whyMatters: '',
    type: type || 'Uncategorized',
    status: 'inbox',
    collections: [],
    tags: [],
    nextAction: '',
    notes: '',
    relatedIds: [],
    progress: '',
    favorite: false,
    focusRole: null,
    links: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
    lastWorkedOn: null
  };
  ideas.unshift(idea);
  persist();
  return idea;
}
function findIdea(id){ return ideas.find(i=>i.id===id) || null; }
function updateIdea(id, patch){
  const idea = findIdea(id);
  if(!idea) return null;
  Object.assign(idea, patch, { updatedAt: nowIso() });
  persist();
  return idea;
}
function deleteIdea(id){
  ideas = ideas.filter(i=>i.id!==id);
  ideas.forEach(i=>{ i.relatedIds = (i.relatedIds||[]).filter(r=>r!==id); });
  persist();
}

/* ---------- focus system ---------- */
function getPrimary(){ return ideas.find(i=>i.focusRole==='primary') || null; }
function getSecondary(){ return ideas.find(i=>i.focusRole==='secondary') || null; }
function getBackups(){
  return ideas.filter(i=> !i.focusRole && ['active','clarifying','paused'].includes(i.status))
              .sort((a,b)=> new Date(b.updatedAt) - new Date(a.updatedAt));
}
function getInboxIdeas(){
  return ideas.filter(i=>i.status==='inbox').sort((a,b)=> new Date(b.createdAt) - new Date(a.createdAt));
}

// Direct, explicit set — used when the person picked this exact slot on purpose.
// Returns the title of whoever got bumped, or null.
function setFocusRoleDirect(id, role){
  const idea = findIdea(id);
  if(!idea) return null;
  let demotedTitle = null;
  if(role){
    const occupant = ideas.find(i=> i.focusRole===role && i.id!==id);
    if(occupant){
      occupant.focusRole = null;
      occupant.updatedAt = nowIso();
      demotedTitle = occupant.title;
    }
  }
  idea.focusRole = role;
  if(idea.status === 'inbox') idea.status = 'active';
  idea.updatedAt = nowIso();
  persist();
  return demotedTitle;
}
function promoteExplicit(id, role){
  const demoted = setFocusRoleDirect(id, role);
  const idea = findIdea(id);
  toast(demoted
    ? `"${idea.title}" is now ${role}. "${demoted}" moved to backup.`
    : `"${idea.title}" is now ${role}.`);
  afterDataChange();
}
function moveToBackupExplicit(id){
  const idea = findIdea(id);
  if(!idea) return;
  idea.focusRole = null;
  if(idea.status === 'inbox') idea.status = 'active';
  idea.updatedAt = nowIso();
  persist();
  toast(`"${idea.title}" moved to backup.`);
  afterDataChange();
}
function archiveExplicit(id){
  const idea = findIdea(id);
  if(!idea) return;
  updateIdea(id, { status:'archived', focusRole:null });
  toast(`"${idea.title}" archived.`);
  afterDataChange();
}
function swapPrimarySecondary(){
  const p = getPrimary(), s = getSecondary();
  if(p) p.focusRole = 'secondary';
  if(s) s.focusRole = 'primary';
  if(p) p.updatedAt = nowIso();
  if(s) s.updatedAt = nowIso();
  persist();
  toast('Switched primary and secondary.');
  afterDataChange();
}
// Ambiguous "work on this" request — gentle, no slot pre-chosen.
function requestPromoteGeneric(id){
  const idea = findIdea(id);
  if(!idea) return;
  const p = getPrimary(), s = getSecondary();
  if(p && p.id === id){ toast('Already your primary idea.'); return; }
  if(s && s.id === id){ toast('Already your secondary idea.'); return; }
  if(!p){ setFocusRoleDirect(id,'primary'); toast(`"${idea.title}" is now primary.`); afterDataChange(); return; }
  if(!s){ setFocusRoleDirect(id,'secondary'); toast(`"${idea.title}" is now secondary.`); afterDataChange(); return; }
  openSlotModal(id);
}

function afterDataChange(){
  renderCurrentView();
  if(currentDetailId) renderDetailChips();
}

/* ============================================================
   DOM refs
   ============================================================ */
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

const sidebar = $('#sidebar');
const sidebarOverlay = $('#sidebarOverlay');
const toastEl = $('#toast');
let toastTimer = null;

const captureModalOverlay = $('#captureModalOverlay');
const detailModalOverlay = $('#detailModalOverlay');
const slotModalOverlay = $('#slotModalOverlay');

/* ============================================================
   TOAST
   ============================================================ */
function toast(msg, ms=2400){
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ toastEl.hidden = true; }, ms);
}

/* ============================================================
   NAVIGATION
   ============================================================ */
function navigate(view){
  currentView = view;
  $$('.view').forEach(v => v.hidden = (v.dataset.viewPanel !== view));
  $$('.nav-item[data-view]').forEach(btn=>{
    if(btn.dataset.view === view) btn.setAttribute('aria-current','page');
    else btn.removeAttribute('aria-current');
  });
  closeMobileSidebar();
  renderCurrentView();
  $('#main').scrollTo?.(0,0);
  window.scrollTo(0,0);
}
function renderCurrentView(){
  switch(currentView){
    case 'dashboard': renderDashboard(); break;
    case 'focus': renderFocusView(); break;
    case 'inbox': renderInboxView(); break;
    case 'all': renderAllView(); break;
    case 'dump': renderDumpView(); break;
    case 'review': /* stays as-is unless queue active */ break;
    case 'rescue': break;
    case 'settings': break;
  }
  updateInboxCount();
}
function updateInboxCount(){
  const n = getInboxIdeas().length;
  const badge = $('#inboxCount');
  badge.textContent = n;
  badge.hidden = n === 0;
}

function openMobileSidebar(){
  sidebar.classList.add('is-open');
  sidebarOverlay.classList.add('is-open');
  $('#menuToggle').setAttribute('aria-expanded','true');
}
function closeMobileSidebar(){
  sidebar.classList.remove('is-open');
  sidebarOverlay.classList.remove('is-open');
  $('#menuToggle').setAttribute('aria-expanded','false');
}

/* ============================================================
   RENDER: FOCUS CARDS (shared by dashboard + focus page)
   ============================================================ */
function focusCardHtml(idea, role, compact){
  if(!idea){
    return `
      <div class="focus-card focus-card--empty">
        <span class="focus-role-label"><span class="dot"></span>${role === 'primary' ? 'Primary' : 'Secondary'}</span>
        <p class="focus-desc" style="display:block;">No ${role} idea yet. Pick one from your inbox or backups when you're ready.</p>
        <button class="btn btn-secondary" data-action="go-inbox">Browse inbox</button>
      </div>`;
  }
  const na = idea.nextAction
    ? `<div class="focus-next-action"><span class="na-label">Next step</span>${escapeHtml(idea.nextAction)}</div>`
    : `<div class="focus-next-action"><span class="na-label">Next step</span><em>Not set yet — open the idea to add one.</em></div>`;
  const desc = idea.description || idea.details || '<em>No description yet.</em>';
  const actionBtn = role === 'primary'
    ? `<button class="btn btn-primary" data-action="continue-work" data-id="${idea.id}">Continue working</button>`
    : `<button class="btn btn-secondary" data-action="make-primary" data-id="${idea.id}">Make primary</button>`;
  return `
    <div class="focus-card focus-card--${role}">
      <span class="focus-role-label"><span class="dot"></span>${role === 'primary' ? '★ Primary' : '○ Secondary'}</span>
      <h3 data-action="open-detail" data-id="${idea.id}">${escapeHtml(idea.title)}</h3>
      <p class="focus-desc">${desc.startsWith('<em>') ? desc : escapeHtml(desc)}</p>
      <div class="focus-meta-row">
        <span><strong>Progress:</strong> ${progressLabel(idea.progress) || 'Just an idea'}</span>
        <span><strong>Last worked on:</strong> ${idea.lastWorkedOn ? timeAgo(idea.lastWorkedOn) : 'Never'}</span>
      </div>
      ${na}
      <div class="focus-card-actions">
        ${actionBtn}
        <button class="btn btn-tertiary" data-action="open-detail" data-id="${idea.id}">Open</button>
      </div>
    </div>`;
}
function renderFocusCardsInto(container, compact){
  const p = getPrimary(), s = getSecondary();
  container.className = compact ? 'focus-cards focus-cards--compact' : 'focus-cards';
  container.innerHTML = focusCardHtml(p,'primary',compact) + focusCardHtml(s,'secondary',compact);
}

/* ============================================================
   RENDER: DASHBOARD
   ============================================================ */
function renderDashboard(){
  renderFocusCardsInto($('#dashFocusCards'), true);

  const inboxIdeas = getInboxIdeas().slice(0,5);
  $('#dashInboxList').innerHTML = inboxIdeas.length
    ? inboxIdeas.map(rowHtml).join('')
    : `<li class="empty-state" style="padding:0.6rem 0;">Nothing waiting — capture something whenever it strikes.</li>`;

  const recent = [...ideas].sort((a,b)=> new Date(b.updatedAt)-new Date(a.updatedAt)).slice(0,5);
  $('#dashRecentList').innerHTML = recent.length
    ? recent.map(rowHtml).join('')
    : `<li class="empty-state" style="padding:0.6rem 0;">Your recent ideas will show up here.</li>`;

  const backups = getBackups().slice(0,6);
  $('#dashBackupList').innerHTML = backups.length
    ? backups.map(backupItemHtml).join('')
    : `<li class="empty-state" style="padding:0.6rem 0;">No backup ideas yet.</li>`;

  bindRowActions();
}
function rowHtml(idea){
  const roleTag = idea.focusRole === 'primary' ? 'Primary' : idea.focusRole === 'secondary' ? 'Secondary' : statusLabel(idea.status);
  return `
    <li class="idea-row" data-action="open-detail" data-id="${idea.id}">
      <div class="idea-row-main">
        <div class="idea-row-title">${escapeHtml(idea.title)}</div>
        <div class="idea-row-sub">${escapeHtml(idea.type)} · ${timeAgo(idea.updatedAt)}</div>
      </div>
      <span class="idea-row-badge">${escapeHtml(roleTag)}</span>
      ${rowMenuHtml(idea)}
    </li>`;
}
function rowMenuHtml(idea){
  const isInbox = idea.status === 'inbox';
  return `
    <details class="row-menu" data-stop-row-click>
      <summary aria-label="Actions for ${escapeHtml(idea.title)}">
        <svg width="16" height="16" viewBox="0 0 20 20"><circle cx="4" cy="10" r="1.4" fill="currentColor" stroke="none"/><circle cx="10" cy="10" r="1.4" fill="currentColor" stroke="none"/><circle cx="16" cy="10" r="1.4" fill="currentColor" stroke="none"/></svg>
      </summary>
      <div class="menu">
        <button data-action="open-detail" data-id="${idea.id}">Open</button>
        <button data-action="promote-primary" data-id="${idea.id}">Promote to primary</button>
        <button data-action="promote-secondary" data-id="${idea.id}">Promote to secondary</button>
        ${isInbox ? `<button data-action="keep-backup" data-id="${idea.id}">Keep as backup</button>` : ''}
        <hr>
        <button data-action="favorite-toggle" data-id="${idea.id}">${idea.favorite ? 'Remove favorite' : 'Mark favorite'}</button>
        <button data-action="archive" data-id="${idea.id}" class="danger">Archive</button>
      </div>
    </details>`;
}
function backupItemHtml(idea){
  return `
    <li class="backup-item" data-action="open-detail" data-id="${idea.id}">
      <span class="dot"></span>
      <span class="backup-item-title">${escapeHtml(idea.title)}</span>
      <span class="backup-item-actions" data-stop-row-click>
        <button data-action="promote-generic" data-id="${idea.id}">Focus</button>
      </span>
    </li>`;
}
function bindRowActions(){ /* handled globally via delegation — see initEventDelegation() */ }

/* ============================================================
   RENDER: FOCUS PAGE
   ============================================================ */
function renderFocusView(){
  renderFocusCardsInto($('#focusCards'), false);
  const backups = getBackups();
  $('#focusBackupList').innerHTML = backups.length
    ? backups.map(backupItemHtml).join('')
    : `<li class="empty-state">No backup ideas yet — organize something from your inbox to see it here.</li>`;
}

/* ============================================================
   RENDER: INBOX
   ============================================================ */
function renderInboxView(){
  const list = getInboxIdeas();
  $('#inboxList').innerHTML = list.map(rowHtml).join('');
  $('#inboxEmpty').hidden = list.length !== 0;
}

/* ============================================================
   RENDER: ALL IDEAS
   ============================================================ */
function populateFilterSelects(){
  const typeSel = $('#filterType');
  if(typeSel.options.length <= 1){
    TYPES.forEach(t=>{
      const o = document.createElement('option'); o.value = t; o.textContent = t;
      typeSel.appendChild(o);
    });
  }
  const statusSel = $('#filterStatus');
  if(statusSel.options.length <= 1){
    STATUSES.forEach(s=>{
      const o = document.createElement('option'); o.value = s.value; o.textContent = s.label;
      statusSel.appendChild(o);
    });
  }
  const collSel = $('#filterCollection');
  const currentVal = collSel.value;
  const collections = Array.from(new Set(ideas.flatMap(i=>i.collections||[]))).sort();
  collSel.innerHTML = '<option value="">Any collection</option>' +
    collections.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  collSel.value = collections.includes(currentVal) ? currentVal : '';
}
function matchesTextQuery(idea, q){
  if(!q) return true;
  const hay = [idea.title, idea.details, idea.description, idea.whyMatters, idea.notes,
    (idea.tags||[]).join(' '), (idea.collections||[]).join(' ')].join(' ').toLowerCase();
  return hay.includes(q.toLowerCase());
}
function renderAllView(){
  populateFilterSelects();

  const q = $('#allSearch').value.trim();
  const type = $('#filterType').value;
  const status = $('#filterStatus').value;
  const coll = $('#filterCollection').value;
  const role = $('#filterFocusRole').value;
  const favOnly = $('#filterFavorite').checked;
  const sort = $('#sortIdeas').value;

  let list = ideas.filter(i=>{
    if(!matchesTextQuery(i,q)) return false;
    if(type && i.type !== type) return false;
    if(status && i.status !== status) return false;
    if(coll && !(i.collections||[]).includes(coll)) return false;
    if(favOnly && !i.favorite) return false;
    if(role === 'primary' && i.focusRole !== 'primary') return false;
    if(role === 'secondary' && i.focusRole !== 'secondary') return false;
    if(role === 'inbox' && i.status !== 'inbox') return false;
    if(role === 'backup' && (i.focusRole || !['active','clarifying','paused'].includes(i.status))) return false;
    return true;
  });

  list.sort((a,b)=>{
    switch(sort){
      case 'created-desc': return new Date(b.createdAt) - new Date(a.createdAt);
      case 'created-asc': return new Date(a.createdAt) - new Date(b.createdAt);
      case 'title-asc': return a.title.localeCompare(b.title);
      default: return new Date(b.updatedAt) - new Date(a.updatedAt);
    }
  });

  $('#allIdeasGrid').innerHTML = list.map(ideaCardHtml).join('');
  $('#allEmpty').hidden = list.length !== 0;
}
function ideaCardHtml(idea){
  const roleClass = idea.focusRole ? ` idea-card--${idea.focusRole}` : '';
  const preview = idea.description || idea.details || 'No details yet.';
  const tags = (idea.tags||[]).slice(0,4).map(t=>`<span class="tag-chip">#${escapeHtml(t)}</span>`).join('');
  const pillClass = idea.status === 'active' ? ' status-pill--active' : idea.status === 'inbox' ? ' status-pill--inbox' : '';
  return `
    <div class="idea-card${roleClass}" data-action="open-detail" data-id="${idea.id}">
      <div class="idea-card-top">
        <div class="idea-card-title">${escapeHtml(idea.title)}</div>
        <button class="idea-card-fav${idea.favorite ? ' is-fav':''}" data-action="favorite-toggle" data-id="${idea.id}" data-stop-row-click aria-label="Toggle favorite">${idea.favorite ? '★' : '☆'}</button>
      </div>
      <div class="idea-card-details">${escapeHtml(preview)}</div>
      ${tags ? `<div class="idea-card-tags">${tags}</div>` : ''}
      <div class="idea-card-bottom">
        <span class="status-pill${pillClass}">${escapeHtml(statusLabel(idea.status))}</span>
        <span>${escapeHtml(idea.type)} · ${timeAgo(idea.updatedAt)}</span>
      </div>
    </div>`;
}

/* ============================================================
   RENDER: BRAIN DUMP
   ============================================================ */
function renderDumpView(){
  const dumps = ideas.filter(i=>i.type === 'Brain Dump').sort((a,b)=> new Date(b.createdAt)-new Date(a.createdAt));
  $('#dumpList').innerHTML = dumps.length
    ? dumps.map(rowHtml).join('')
    : `<li class="empty-state" style="padding:0.6rem 0;">No dumps yet.</li>`;
}

/* ============================================================
   QUICK CAPTURE
   ============================================================ */
function openCaptureModal(){
  captureModalOverlay.hidden = false;
  $('#qcModalConfirm').textContent = '';
  requestAnimationFrame(()=> $('#captureTitle').focus());
}
function closeCaptureModal(){
  captureModalOverlay.hidden = true;
  renderCurrentView();
}
function handleCaptureSubmit(e){
  e.preventDefault();
  const title = $('#captureTitle').value.trim();
  const details = $('#captureDetails').value.trim();
  if(!title) { $('#captureTitle').focus(); return; }
  createIdea({ title, details });
  $('#captureTitle').value = '';
  $('#captureDetails').value = '';
  $('.capture-more').open = false;
  $('#qcModalConfirm').textContent = 'Saved to inbox.';
  updateInboxCount();
  if(currentView === 'dashboard' || currentView === 'inbox') renderCurrentView();
  requestAnimationFrame(()=> $('#captureTitle').focus());
}
function handleInlineCaptureSubmit(e){
  e.preventDefault();
  const input = $('#quickCaptureInline');
  const title = input.value.trim();
  if(!title) { input.focus(); return; }
  createIdea({ title });
  input.value = '';
  $('#qcInlineConfirm').textContent = 'Saved to inbox.';
  clearTimeout(handleInlineCaptureSubmit._t);
  handleInlineCaptureSubmit._t = setTimeout(()=>{ $('#qcInlineConfirm').textContent=''; }, 2200);
  renderDashboard();
  input.focus();
}

/* ---------- voice capture ---------- */
function initVoiceCapture(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = $('#voiceCaptureBtn');
  if(!SR){
    btn.hidden = true;
    return;
  }
  btn.hidden = false;
  recognition = new SR();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onstart = ()=>{ recognizing = true; $('#voiceStatus').textContent = 'Listening…'; };
  recognition.onerror = ()=>{ recognizing = false; $('#voiceStatus').textContent = "Couldn't hear that — try typing instead."; };
  recognition.onend = ()=>{ recognizing = false; if($('#voiceStatus').textContent === 'Listening…') $('#voiceStatus').textContent=''; };
  recognition.onresult = (ev)=>{
    const transcript = ev.results[0][0].transcript;
    const field = $('#captureTitle');
    field.value = (field.value ? field.value + ' ' : '') + transcript;
    $('#voiceStatus').textContent = 'Got it.';
    setTimeout(()=>{ $('#voiceStatus').textContent=''; }, 1800);
  };
  btn.addEventListener('click', ()=>{
    if(recognizing){ recognition.stop(); return; }
    try{ recognition.start(); }catch(e){ /* already started */ }
  });
}

/* ============================================================
   DETAIL MODAL
   ============================================================ */
function populateSelectOnce(sel, options, valueKey='value', labelKey='label'){
  if(sel.options.length) return;
  options.forEach(o=>{
    const opt = document.createElement('option');
    if(typeof o === 'string'){ opt.value = o; opt.textContent = o; }
    else { opt.value = o[valueKey]; opt.textContent = o[labelKey]; }
    sel.appendChild(opt);
  });
}
function openDetail(id){
  const idea = findIdea(id);
  if(!idea) return;
  currentDetailId = id;

  populateSelectOnce($('#detailType'), TYPES);
  populateSelectOnce($('#detailStatus'), STATUSES);
  populateSelectOnce($('#detailProgress'), PROGRESS);

  $('#detailTitle').value = idea.title;
  $('#detailType').value = idea.type;
  $('#detailStatus').value = idea.status;
  $('#detailProgress').value = idea.progress || '';
  $('#detailCollections').value = (idea.collections||[]).join(', ');
  $('#detailTags').value = (idea.tags||[]).join(', ');
  $('#detailNextAction').value = idea.nextAction || '';
  $('#detailDescription').value = idea.description || idea.details || '';
  $('#detailWhyMatters').value = idea.whyMatters || '';
  $('#detailNotes').value = idea.notes || '';

  renderDetailChips();
  renderRelatedPicker();
  renderDetailMeta();

  detailModalOverlay.hidden = false;
}
function renderDetailChips(){
  const idea = findIdea(currentDetailId);
  if(!idea) return;
  const chips = [];
  if(idea.focusRole === 'primary') chips.push('<span class="role-chip role-chip--primary">★ Primary</span>');
  else if(idea.focusRole === 'secondary') chips.push('<span class="role-chip role-chip--secondary">○ Secondary</span>');
  else if(idea.status === 'inbox') chips.push('<span class="role-chip role-chip--inbox">Inbox</span>');
  else chips.push(`<span class="role-chip role-chip--inbox">${escapeHtml(statusLabel(idea.status))}</span>`);
  $('#detailChipRow').innerHTML = chips.join('');
  $('#detailFavoriteBtn').textContent = idea.favorite ? '★ Favorited' : '☆ Favorite';
}
function renderRelatedPicker(){
  const idea = findIdea(currentDetailId);
  if(!idea) return;
  const others = ideas.filter(i=>i.id !== idea.id).sort((a,b)=>a.title.localeCompare(b.title));
  const picker = $('#relatedPicker');
  if(!others.length){
    picker.innerHTML = '<span style="font-size:0.82rem;color:var(--ink-faint);">No other ideas yet to relate this to.</span>';
  } else {
    picker.innerHTML = others.slice(0,60).map(o=>{
      const chosen = (idea.relatedIds||[]).includes(o.id);
      return `<button type="button" class="${chosen?'is-chosen':''}" data-action="toggle-related" data-id="${o.id}">${chosen?'✓ ':''}${escapeHtml(o.title)}</button>`;
    }).join('');
  }
  renderRelatedChosen();
}
function renderRelatedChosen(){
  const idea = findIdea(currentDetailId);
  if(!idea) return;
  const chosen = (idea.relatedIds||[]).map(id=>findIdea(id)).filter(Boolean);
  $('#relatedChosen').innerHTML = chosen.length
    ? chosen.map(c=>`<span class="tag-chip">${escapeHtml(c.title)}</span>`).join('')
    : '';
}
function renderDetailMeta(){
  const idea = findIdea(currentDetailId);
  if(!idea) return;
  $('#detailMeta').innerHTML = `
    Created ${formatDate(idea.createdAt)}<br>
    Last edited ${formatDate(idea.updatedAt)}<br>
    Last worked on ${idea.lastWorkedOn ? formatDate(idea.lastWorkedOn) : 'Never'}`;
}
function closeDetailModal(){
  detailModalOverlay.hidden = true;
  currentDetailId = null;
  renderCurrentView();
}
function saveDetailField(patch){
  if(!currentDetailId) return;
  updateIdea(currentDetailId, patch);
  renderDetailMeta();
}
function wireDetailFieldListeners(){
  const blurFields = [
    ['#detailTitle','title', v=>v.trim() || 'Untitled idea'],
    ['#detailDescription','description', v=>v],
    ['#detailWhyMatters','whyMatters', v=>v],
    ['#detailNotes','notes', v=>v],
    ['#detailNextAction','nextAction', v=>v],
    ['#detailCollections','collections', v=>parseListInput(v)],
    ['#detailTags','tags', v=>parseListInput(v)]
  ];
  blurFields.forEach(([sel, key, transform])=>{
    $(sel).addEventListener('blur', ()=>{
      if(!currentDetailId) return;
      saveDetailField({ [key]: transform($(sel).value) });
      if(key === 'title'){
        $('#detailTitle').value = findIdea(currentDetailId).title;
      }
    });
  });
  $('#detailType').addEventListener('change', ()=> saveDetailField({ type: $('#detailType').value }));
  $('#detailStatus').addEventListener('change', ()=>{
    const idea = findIdea(currentDetailId);
    const newStatus = $('#detailStatus').value;
    const patch = { status:newStatus };
    if(['archived','rejected','completed'].includes(newStatus)) patch.focusRole = null;
    saveDetailField(patch);
    renderDetailChips();
  });
  $('#detailProgress').addEventListener('change', ()=> saveDetailField({ progress: $('#detailProgress').value }));
}

/* ============================================================
   SLOT MODAL
   ============================================================ */
function openSlotModal(id){
  pendingSlotIdeaId = id;
  const idea = findIdea(id);
  $('#slotModalTitle').textContent = 'You already have a primary and secondary idea';
  $('#slotModalBody').textContent = `Would you like "${idea.title}" to replace one of them, or stay as a backup idea for now?`;
  slotModalOverlay.hidden = false;
}
function closeSlotModal(){
  slotModalOverlay.hidden = true;
  pendingSlotIdeaId = null;
}

/* ============================================================
   REVIEW
   ============================================================ */
function buildReviewQueue(){
  return ideas
    .filter(i=> !['archived','rejected'].includes(i.status))
    .sort((a,b)=> new Date(a.updatedAt) - new Date(b.updatedAt))
    .slice(0,5);
}
function startReview(){
  reviewQueue = buildReviewQueue();
  reviewIndex = 0;
  $('#reviewEmpty').hidden = true;
  if(!reviewQueue.length){
    $('#reviewStage').hidden = true;
    $('#reviewEmpty').hidden = false;
    return;
  }
  renderReviewStage();
}
function renderReviewStage(){
  const stage = $('#reviewStage');
  if(reviewIndex >= reviewQueue.length){
    stage.hidden = false;
    stage.innerHTML = `<h3>Nice — you're through this batch.</h3><p>You reviewed ${reviewQueue.length} idea${reviewQueue.length===1?'':'s'}. Come back whenever.</p>
      <button class="btn btn-secondary" data-action="review-again">Review 5 more</button>`;
    return;
  }
  const idea = reviewQueue[reviewIndex];
  stage.hidden = false;
  stage.innerHTML = `
    <div class="review-progress">Idea ${reviewIndex+1} of ${reviewQueue.length}</div>
    <h3 data-action="open-detail" data-id="${idea.id}">${escapeHtml(idea.title)}</h3>
    <p>${escapeHtml(idea.description || idea.details || 'No details yet.')}</p>
    <div class="review-progress">${escapeHtml(idea.type)} · ${escapeHtml(statusLabel(idea.status))} · last edited ${timeAgo(idea.updatedAt)}</div>
    <div class="review-actions">
      <button class="btn btn-secondary" data-action="review-keep" data-id="${idea.id}">Keep as is</button>
      <button class="btn btn-secondary" data-action="review-develop" data-id="${idea.id}">Develop it</button>
      <button class="btn btn-tertiary" data-action="review-pause" data-id="${idea.id}">Pause</button>
      <button class="btn btn-tertiary" data-action="promote-primary" data-id="${idea.id}">Promote to primary</button>
      <button class="btn btn-tertiary" data-action="promote-secondary" data-id="${idea.id}">Promote to secondary</button>
      <button class="btn btn-tertiary" data-action="review-archive" data-id="${idea.id}">Archive</button>
      <button class="btn btn-danger-ghost" data-action="review-delete" data-id="${idea.id}">Delete</button>
    </div>`;
}
function reviewAdvance(){ reviewIndex += 1; renderReviewStage(); }

function showRandomIdea(){
  const pool = ideas.filter(i=> !['archived','rejected'].includes(i.status));
  if(!pool.length){
    $('#reviewStage').hidden = false;
    $('#reviewStage').innerHTML = `<p>Nothing to show yet — capture an idea first.</p>`;
    return;
  }
  const idea = pool[Math.floor(Math.random()*pool.length)];
  const stage = $('#reviewStage');
  stage.hidden = false;
  stage.innerHTML = `
    <div class="review-progress">Random idea</div>
    <h3 data-action="open-detail" data-id="${idea.id}">${escapeHtml(idea.title)}</h3>
    <p>${escapeHtml(idea.description || idea.details || 'No details yet.')}</p>
    <div class="review-progress">${escapeHtml(idea.type)} · ${escapeHtml(statusLabel(idea.status))} · last edited ${timeAgo(idea.updatedAt)}</div>
    <div class="review-actions">
      <button class="btn btn-secondary" data-action="open-detail" data-id="${idea.id}">Open</button>
      <button class="btn btn-tertiary" data-action="promote-primary" data-id="${idea.id}">Promote to primary</button>
      <button class="btn btn-tertiary" data-action="promote-secondary" data-id="${idea.id}">Promote to secondary</button>
      <button class="btn btn-secondary" data-action="random-again">Another random idea</button>
    </div>`;
}

/* ============================================================
   RESCUE ME
   ============================================================ */
function pickForEnergy(energy){
  const alive = ideas.filter(i=> !['archived','rejected'].includes(i.status));
  const primary = getPrimary(), secondary = getSecondary();
  const byRandom = arr => arr.length ? arr[Math.floor(Math.random()*arr.length)] : null;

  switch(energy){
    case 'main':
      return primary || secondary || byRandom(alive);
    case 'easy': {
      const withNext = alive.filter(i=>i.nextAction).sort((a,b)=> a.nextAction.length - b.nextAction.length);
      return withNext[0] || byRandom(alive);
    }
    case 'creative': {
      const pool = alive.filter(i=> CREATIVE_TYPES.includes(i.type));
      return byRandom(pool) || byRandom(alive);
    }
    case 'productive': {
      const pool = alive.filter(i=> PRODUCTIVE_TYPES.includes(i.type));
      return byRandom(pool) || byRandom(alive);
    }
    case 'explore': {
      const inboxList = getInboxIdeas();
      return inboxList[0] || byRandom(alive);
    }
    case 'unsure':
    default:
      return primary || secondary || byRandom(getBackups()) || byRandom(alive);
  }
}
function handleEnergyPick(energy){
  const idea = pickForEnergy(energy);
  const box = $('#rescueResult');
  if(!idea){
    box.hidden = false;
    box.innerHTML = `<p>Nothing saved yet — capture an idea first, then come back here.</p>`;
    return;
  }
  box.hidden = false;
  box.innerHTML = `
    <h3 data-action="open-detail" data-id="${idea.id}">${escapeHtml(idea.title)}</h3>
    <p>${escapeHtml(idea.description || idea.details || 'No details yet.')}</p>
    <div class="review-progress" style="margin-bottom:0.8rem;">${escapeHtml(idea.type)} · ${escapeHtml(statusLabel(idea.status))}${idea.nextAction ? ' · next: ' + escapeHtml(idea.nextAction) : ''}</div>
    <div class="review-actions">
      <button class="btn btn-primary" data-action="work-on-now" data-id="${idea.id}">Work on this now</button>
      <button class="btn btn-tertiary" data-action="open-detail" data-id="${idea.id}">Open</button>
      <button class="btn btn-tertiary" data-action="energy-again" data-energy="${energy}">Show another</button>
    </div>`;
}

/* ============================================================
   BRAIN DUMP submit
   ============================================================ */
function handleDumpSubmit(e){
  e.preventDefault();
  const text = $('#dumpText').value.trim();
  if(!text) return;
  const firstLine = text.split(/\n|\.(?=\s|$)/)[0].slice(0,80).trim();
  createIdea({ title: firstLine || 'Brain dump', details: text, type: 'Brain Dump' });
  $('#dumpText').value = '';
  toast('Saved to inbox.');
  renderDumpView();
  updateInboxCount();
}

/* ============================================================
   GLOBAL SEARCH
   ============================================================ */
const runGlobalSearch = debounce(function(){
  const q = $('#globalSearch').value.trim();
  const box = $('#globalSearchResults');
  if(q.length < 2){ box.hidden = true; box.innerHTML=''; return; }
  const results = ideas.filter(i=>matchesTextQuery(i,q)).slice(0,8);
  box.hidden = false;
  box.innerHTML = `<h3>${results.length ? results.length + ' match' + (results.length===1?'':'es') : 'No matches'}</h3>` +
    (results.length ? `<ul class="idea-rows">${results.map(rowHtml).join('')}</ul>` : `<p class="empty-state" style="padding:0.4rem 0.6rem;">Try a different word.</p>`);
}, 180);

/* ============================================================
   SETTINGS: export / import / clear
   ============================================================ */
function downloadBlob(filename, content, mime){
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}
function exportJson(){
  downloadBlob(`loom-export-${Date.now()}.json`, JSON.stringify({ exportedAt: nowIso(), ideas }, null, 2), 'application/json');
  toast('Exported.');
}
function csvEscape(v){
  const s = String(v==null?'':v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
}
function exportCsv(){
  const cols = ['title','type','status','progress','favorite','focusRole','nextAction','tags','collections','createdAt','updatedAt'];
  const rows = [cols.join(',')].concat(ideas.map(i=> cols.map(c=>{
    let v = i[c];
    if(Array.isArray(v)) v = v.join(' | ');
    return csvEscape(v);
  }).join(',')));
  downloadBlob(`loom-export-${Date.now()}.csv`, rows.join('\n'), 'text/csv');
  toast('Exported.');
}
function importJsonFile(file){
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const data = JSON.parse(reader.result);
      const incoming = Array.isArray(data) ? data : Array.isArray(data.ideas) ? data.ideas : null;
      if(!incoming) throw new Error('Unrecognized format');
      let count = 0;
      incoming.forEach(raw=>{
        if(!raw || typeof raw !== 'object' || !raw.title) return;
        ideas.unshift({
          id: uid(),
          title: String(raw.title).slice(0,300),
          details: String(raw.details||''),
          description: String(raw.description||''),
          whyMatters: String(raw.whyMatters||''),
          type: TYPES.includes(raw.type) ? raw.type : 'Uncategorized',
          status: STATUSES.some(s=>s.value===raw.status) ? raw.status : 'inbox',
          collections: Array.isArray(raw.collections) ? raw.collections.map(String) : [],
          tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
          nextAction: String(raw.nextAction||''),
          notes: String(raw.notes||''),
          relatedIds: [],
          progress: PROGRESS.some(p=>p.value===raw.progress) ? raw.progress : '',
          favorite: !!raw.favorite,
          focusRole: null,
          links: Array.isArray(raw.links) ? raw.links.map(String) : [],
          createdAt: raw.createdAt || nowIso(),
          updatedAt: nowIso(),
          lastWorkedOn: raw.lastWorkedOn || null
        });
        count++;
      });
      persist();
      $('#importStatus').textContent = `Imported ${count} idea${count===1?'':'s'}.`;
      renderCurrentView();
      updateInboxCount();
    }catch(err){
      $('#importStatus').textContent = "Couldn't read that file — is it a Loom export?";
    }
  };
  reader.readAsText(file);
}

/* ============================================================
   EVENT DELEGATION — one listener, all data-action clicks
   ============================================================ */
function initEventDelegation(){
  document.addEventListener('click', (e)=>{
    // nav items
    const navBtn = e.target.closest('.nav-item[data-view]');
    if(navBtn){ navigate(navBtn.dataset.view); return; }
    const linkBtn = e.target.closest('[data-view].link-btn');
    if(linkBtn){ navigate(linkBtn.dataset.view); return; }

    const actionEl = e.target.closest('[data-action]');
    if(!actionEl) return;
    const action = actionEl.dataset.action;
    const id = actionEl.dataset.id;

    switch(action){
      case 'open-detail':
        // a click inside a row's kebab menu (e.g. the summary toggle) bubbles up to
        // the row's own open-detail handler unless we catch it here.
        if(e.target.closest('.row-menu')) return;
        openDetail(id);
        break;
      case 'go-inbox': navigate('inbox'); break;
      case 'continue-work': {
        updateIdea(id, { lastWorkedOn: nowIso(), status: findIdea(id).status === 'inbox' ? 'active' : findIdea(id).status });
        toast('Marked as worked on.');
        renderCurrentView();
        break;
      }
      case 'make-primary': swapPrimarySecondary(); break;
      case 'promote-primary': promoteExplicit(id, 'primary'); break;
      case 'promote-secondary': promoteExplicit(id, 'secondary'); break;
      case 'promote-generic': requestPromoteGeneric(id); break;
      case 'work-on-now': requestPromoteGeneric(id); handleEnergyPick(document.querySelector('.energy-btn.is-active')?.dataset.energy || currentEnergy); break;
      case 'keep-backup': moveToBackupExplicit(id); break;
      case 'archive': archiveExplicit(id); break;
      case 'review-archive': archiveExplicit(id); reviewAdvance(); break;
      case 'favorite-toggle': {
        const idea = findIdea(id);
        updateIdea(id, { favorite: !idea.favorite });
        if(currentDetailId === id) renderDetailChips();
        renderCurrentView();
        break;
      }
      case 'toggle-related': {
        const idea = findIdea(currentDetailId);
        const set = new Set(idea.relatedIds||[]);
        if(set.has(id)) set.delete(id); else set.add(id);
        saveDetailField({ relatedIds: Array.from(set) });
        renderRelatedPicker();
        break;
      }
      case 'review-keep': reviewAdvance(); break;
      case 'review-develop': {
        const idea = findIdea(id);
        updateIdea(id, { status: idea.status === 'inbox' ? 'clarifying' : 'active' });
        reviewAdvance();
        break;
      }
      case 'review-pause': updateIdea(id, { status:'paused', focusRole:null }); reviewAdvance(); break;
      case 'review-delete': {
        if(confirm('Delete this idea? This can\'t be undone.')){ deleteIdea(id); reviewAdvance(); }
        break;
      }
      case 'review-again': startReview(); break;
      case 'random-again': showRandomIdea(); break;
      case 'energy-again': handleEnergyPick(actionEl.dataset.energy); break;
      default: break;
    }
  });

  // energy buttons (need active-state tracking)
  $('#energyGrid').addEventListener('click', (e)=>{
    const btn = e.target.closest('.energy-btn');
    if(!btn) return;
    $$('.energy-btn').forEach(b=>b.classList.remove('is-active'));
    btn.classList.add('is-active');
    currentEnergy = btn.dataset.energy;
    handleEnergyPick(currentEnergy);
  });
}
let currentEnergy = 'unsure';

/* ============================================================
   INIT
   ============================================================ */
function init(){
  ideas = loadIdeas();

  // sidebar nav
  $('#menuToggle').addEventListener('click', openMobileSidebar);
  sidebarOverlay.addEventListener('click', closeMobileSidebar);

  // capture entry points
  ['#sidebarCapture','#topbarCapture','#mainTopbarCapture'].forEach(sel=>{
    $(sel).addEventListener('click', openCaptureModal);
  });
  $('#closeCaptureModal').addEventListener('click', closeCaptureModal);
  captureModalOverlay.addEventListener('click', (e)=>{ if(e.target === captureModalOverlay) closeCaptureModal(); });
  $('#captureForm').addEventListener('submit', handleCaptureSubmit);

  $('#quickCaptureInlineForm').addEventListener('submit', handleInlineCaptureSubmit);

  // detail modal
  $('#closeDetailModal').addEventListener('click', closeDetailModal);
  detailModalOverlay.addEventListener('click', (e)=>{ if(e.target === detailModalOverlay) closeDetailModal(); });
  wireDetailFieldListeners();
  $('#detailFavoriteBtn').addEventListener('click', ()=>{
    const idea = findIdea(currentDetailId);
    updateIdea(currentDetailId, { favorite: !idea.favorite });
    renderDetailChips();
  });
  $('#detailPrimaryBtn').addEventListener('click', ()=> { promoteExplicit(currentDetailId,'primary'); renderDetailChips(); });
  $('#detailSecondaryBtn').addEventListener('click', ()=> { promoteExplicit(currentDetailId,'secondary'); renderDetailChips(); });
  $('#detailBackupBtn').addEventListener('click', ()=> { moveToBackupExplicit(currentDetailId); renderDetailChips(); });
  $('#detailArchiveBtn').addEventListener('click', ()=>{ archiveExplicit(currentDetailId); closeDetailModal(); });
  $('#detailDeleteBtn').addEventListener('click', ()=>{
    if(confirm('Delete this idea permanently? This can\'t be undone.')){
      deleteIdea(currentDetailId);
      toast('Deleted.');
      closeDetailModal();
    }
  });

  // slot modal
  $('#slotReplacePrimary').addEventListener('click', ()=>{
    if(pendingSlotIdeaId) promoteExplicit(pendingSlotIdeaId, 'primary');
    closeSlotModal();
  });
  $('#slotReplaceSecondary').addEventListener('click', ()=>{
    if(pendingSlotIdeaId) promoteExplicit(pendingSlotIdeaId, 'secondary');
    closeSlotModal();
  });
  $('#slotKeepBackup').addEventListener('click', ()=>{
    if(pendingSlotIdeaId) moveToBackupExplicit(pendingSlotIdeaId);
    closeSlotModal();
  });
  $('#slotCancel').addEventListener('click', closeSlotModal);
  slotModalOverlay.addEventListener('click', (e)=>{ if(e.target === slotModalOverlay) closeSlotModal(); });

  // all-ideas filters
  ['#allSearch','#filterType','#filterStatus','#filterCollection','#filterFocusRole','#sortIdeas'].forEach(sel=>{
    $(sel).addEventListener('input', renderAllView);
    $(sel).addEventListener('change', renderAllView);
  });
  $('#filterFavorite').addEventListener('change', renderAllView);

  // brain dump
  $('#dumpForm').addEventListener('submit', handleDumpSubmit);

  // review
  $('#startReview').addEventListener('click', startReview);
  $('#randomIdeaBtn').addEventListener('click', showRandomIdea);

  // settings
  $('#exportJsonBtn').addEventListener('click', exportJson);
  $('#exportCsvBtn').addEventListener('click', exportCsv);
  $('#importFile').addEventListener('change', (e)=>{
    const file = e.target.files[0];
    if(file) importJsonFile(file);
    e.target.value = '';
  });
  $('#clearDataBtn').addEventListener('click', ()=>{
    if(confirm('Clear every idea on this device? Export first if you want a backup.')){
      ideas = [];
      persist();
      renderCurrentView();
      updateInboxCount();
      toast('All data cleared.');
    }
  });

  // global search
  $('#globalSearch').addEventListener('input', runGlobalSearch);

  // keyboard shortcuts
  document.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape'){
      if(!captureModalOverlay.hidden) closeCaptureModal();
      else if(!detailModalOverlay.hidden) closeDetailModal();
      else if(!slotModalOverlay.hidden) closeSlotModal();
      return;
    }
    const cmdK = (e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K');
    if(cmdK){ e.preventDefault(); openCaptureModal(); return; }
    if((e.key === 'n' || e.key === 'N') && !isTypingTarget(e.target) && !anyModalOpen()){
      e.preventDefault();
      openCaptureModal();
    }
  });

  initEventDelegation();
  initVoiceCapture();

  updateInboxCount();
  navigate('dashboard');
}

document.addEventListener('DOMContentLoaded', init);
