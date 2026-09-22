'use strict';

// Positions use the original 800 × 500 canvas coordinate system.
let ROOT_ID = 'root';
let maps = [];
let activeMapId = null;
function createInitialMapData() {
  const now = Date.now();
  return { version: 1, updatedAt: now, viewport: { x: 0, y: 0, scale: 1 }, nodes: [
  { id: ROOT_ID, text: '新しいアイデア', parentId: null, x: 400, y: 270, color: 'blue' },
  { id: 'work', text: '仕事', parentId: ROOT_ID, x: 420, y: 101.5, color: 'blue', icon: 'work' },
  { id: 'study', text: '勉強', parentId: ROOT_ID, x: 156, y: 222, color: 'green', icon: 'book' },
  { id: 'travel', text: '旅行', parentId: ROOT_ID, x: 644, y: 222, color: 'orange', icon: 'plane' },
  { id: 'side-business', text: '副業', parentId: ROOT_ID, x: 208, y: 383, color: 'purple', icon: 'chart' },
  { id: 'ai-tools', text: 'AIツール', parentId: ROOT_ID, x: 592, y: 383, color: 'cyan', icon: 'robot' },
].map(node => ({ ...node, createdAt: now, updatedAt: now })) };
}
let nodes = [];
const themes = {
  blue: { className: 'work-node', label:'青', swatch:'#dceaff', border:'#8db4ee', stroke: '#80aaf0' },
  green: { className: 'study-node', label:'緑', swatch:'#dff2e5', border:'#8dc8a3', stroke: '#87c3a0' },
  orange: { className: 'travel-node', label:'オレンジ', swatch:'#ffead3', border:'#e8b477', stroke: '#efb377' },
  purple: { className: 'business-node', label:'紫', swatch:'#eadff7', border:'#b99bd7', stroke: '#b4a0db' },
  cyan: { className: 'ai-node', label:'水色', swatch:'#d9f2f7', border:'#7fc5d6', stroke: '#7cc5da' },
  red: { className: 'red-node', label:'赤', swatch:'#f9dde0', border:'#d9949b', stroke:'#df9299' },
  yellow: { className: 'yellow-node', label:'黄色', swatch:'#faedbd', border:'#d5b95c', stroke:'#d8bd67' },
  gray: { className: 'gray-node', label:'グレー', swatch:'#e6e9ed', border:'#aeb7c1', stroke:'#aeb7c1' },
};
const DEFAULT_NODE_COLOR = 'blue';
const EXPORT_PADDING = 80;
const MAX_EXPORT_SIDE = 8192;
const MAX_EXPORT_PIXELS = 24000000;
const EXPORT_NODE_SIZE = { width:120, height:55 };
const EXPORT_ROOT_SIZE = { width:168, height:60 };
const exportTheme = {
  blue:{ background:'#eff5ff', border:'#c5d9fa', text:'#5185d5' },
  green:{ background:'#eff8f2', border:'#c7e4d0', text:'#589c74' },
  orange:{ background:'#fff5ea', border:'#f4d6b5', text:'#bf7e3c' },
  purple:{ background:'#f5f0fc', border:'#decff0', text:'#8b64b4' },
  cyan:{ background:'#edf9fc', border:'#c0e5ef', text:'#4b93aa' },
  red:{ background:'#fff1f2', border:'#f1c9cc', text:'#b45f67' },
  yellow:{ background:'#fff9e8', border:'#eddca7', text:'#9b7a26' },
  gray:{ background:'#f3f5f7', border:'#d8dee5', text:'#667383' },
};
const svgNS = 'http://www.w3.org/2000/svg';
const stage = document.querySelector('.map-stage');
const canvas = document.querySelector('.canvas');
const world = document.querySelector('#mindMapWorld');
let viewport = { x: 0, y: 0, scale: 1 };
const MIN_SCALE = 0.4;
const MAX_SCALE = 2.5;
const pointers = new Map();
let panState = null;
let pinchState = null;
const connections = document.querySelector('.connections');
const nodeElements = new Map();
const connectionPaths = new Map();
const editor = document.querySelector('#node-editor');
const form = document.querySelector('#node-form');
const nameInput = document.querySelector('#node-name');
const errorText = document.querySelector('#editor-error');
const mobile = matchMedia('(max-width: 768px), (max-width: 900px) and (max-height: 500px)');
let selectedNodeId = null;
let editorState = null;
let nextId = 1;
const deleteButton = document.querySelector('[data-action="delete-node"]');
const editButton = document.querySelector('[data-action="edit-node"]');
const styleButton = document.querySelector('[data-action="style"]');
const colorPalette = document.querySelector('#color-palette');
const colorOptions = document.querySelector('#color-options');
const deleteDialog = document.querySelector('#delete-dialog');
const importDialog = document.querySelector('#import-dialog');
const notice = document.querySelector('#node-notice');
let pendingDeleteId = null;
let noticeTimer;
let dragState = null;
let suppressDragClick = false;
let lastDragEnd = -Infinity;
let searchQuery = '';
let searchResults = [];
let searchActiveIndex = -1;
let searchHighlightTimer;

const STORAGE_KEY = 'simple-mind-map-data';
const STORAGE_VERSION = 2;
let saveTimer;
let dirty = false;
let recoveryBlocked = false;
const saveStatus = document.querySelector('.save-status');

function setSaveStatus(state) {
  const labels = { pending: '保存中...', saved: '自動保存済み', error: '保存できませんでした' };
  saveStatus.dataset.state = state;
  document.querySelector('#save-status-text').textContent = labels[state];
  saveStatus.title = state === 'error' ? 'ブラウザの保存領域を利用できません。変更はこのページ内に残っています。'
    : 'このブラウザに自動保存します';
}

// Validate the complete tree before rendering: duplicate IDs, orphans and cycles
// must never reach the existing parent/child rendering code.
function validateMapData(data, rootId = 'root') {
  if (!data || !Array.isArray(data.nodes) || !data.nodes.length) throw Error('Invalid version or nodes');
  const now = Date.now(), ids = new Map();
  const validatedNodes = data.nodes.map(node => {
    if (!node || typeof node.id !== 'string' || !node.id || ids.has(node.id)
      || typeof node.text !== 'string' || !node.text.trim() || node.text.length > 100
      || !Number.isFinite(node.x) || !Number.isFinite(node.y)
      || Math.abs(node.x) > 1000000 || Math.abs(node.y) > 1000000
      || (node.parentId !== null && typeof node.parentId !== 'string')) throw Error('Invalid node');
    const color = Object.hasOwn(themes,node.color) ? node.color : DEFAULT_NODE_COLOR;
    const valid = { id: node.id, text: node.text, parentId: node.parentId, x: node.x, y: node.y, color,
      createdAt: Number.isFinite(node.createdAt) && node.createdAt >= 0 ? node.createdAt : now,
      updatedAt: Number.isFinite(node.updatedAt) && node.updatedAt >= 0 ? node.updatedAt : now,
      moved: node.moved === true, added: node.added === true };
    if (['study','travel'].includes(node.layoutKey)) valid.layoutKey = node.layoutKey;
    if (['work','book','plane','chart','robot'].includes(node.icon)) valid.icon = node.icon;
    ids.set(valid.id, valid);
    return valid;
  });
  if (!ids.has(rootId) || ids.get(rootId).parentId !== null) throw Error('Missing root');
  const complete = new Set([rootId]);
  for (const node of validatedNodes) {
    const path = new Set();
    let id = node.id;
    while (!complete.has(id)) {
      if (!ids.has(id) || path.has(id)) throw Error('Orphan or cycle');
      path.add(id);
      id = ids.get(id).parentId;
    }
    path.forEach(id => complete.add(id));
  }
  const v = data.viewport;
  if (!v || typeof v.scale !== 'number') throw Error('Missing viewport');
  return { version: STORAGE_VERSION, nodes: validatedNodes,
    viewport: { x: Number.isFinite(v.x) && Math.abs(v.x) <= 10000000 ? v.x : 0,
      y: Number.isFinite(v.y) && Math.abs(v.y) <= 10000000 ? v.y : 0,
      scale: Number.isFinite(v.scale) ? Math.min(MAX_SCALE, Math.max(MIN_SCALE,v.scale)) : 1 },
    updatedAt: Number.isFinite(data.updatedAt) ? data.updatedAt : now };
}

function makeMapId() { return `map-${crypto.randomUUID()}`; }
function getActiveMaps() { return maps.filter(map=>map.deletedAt===null); }
function getTrashedMaps() { return maps.filter(map=>map.deletedAt!==null); }
function getOrderedActiveMaps() {
  const active = getActiveMaps();
  return [...active.filter(map=>map.isFavorite),...active.filter(map=>!map.isFavorite)];
}
function getActiveMap() { return maps.find(map => map.id === activeMapId && map.deletedAt===null); }
function normalizedDeletedAt(value) {
  if (typeof value !== 'string' || !value.trim() || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}
function createInitialData() { return migrateV1ToV2(createInitialMapData()); }
function migrateV1ToV2(oldData) {
  const valid = validateMapData(oldData);
  const now = Date.now(), id = makeMapId();
  return { version: STORAGE_VERSION, activeMapId: id, updatedAt: now,
    maps: [{ id, title: 'マイマップ', nodes: valid.nodes, viewport: valid.viewport,
      createdAt: valid.nodes.find(node => node.parentId === null).createdAt, updatedAt: valid.updatedAt,
      isFavorite:false, deletedAt:null }] };
}
function validateAppData(data) {
  if (!data || data.version !== STORAGE_VERSION || !Array.isArray(data.maps) || !data.maps.length) throw Error('Invalid maps');
  const ids = new Set();
  const validated = data.maps.map(map => {
    if (!map || typeof map.id !== 'string' || !map.id || ids.has(map.id)
      || typeof map.title !== 'string' || !map.title.trim() || map.title.length > 100) throw Error('Invalid map');
    ids.add(map.id);
    const roots = Array.isArray(map.nodes) ? map.nodes.filter(node => node && node.parentId === null) : [];
    if (roots.length !== 1) throw Error('Invalid map root');
    const valid = validateMapData(map, roots[0].id);
    return { id: map.id, title: map.title.trim(), nodes: valid.nodes, viewport: valid.viewport,
      createdAt: Number.isFinite(map.createdAt) ? map.createdAt : Date.now(), updatedAt: valid.updatedAt,
      isFavorite:map.isFavorite===true, deletedAt:normalizedDeletedAt(map.deletedAt) };
  });
  if (!validated.some(map=>map.deletedAt===null)) validated.push(newEmptyMap('新しいマップ'));
  const availableIds = new Set(validated.filter(map=>map.deletedAt===null).map(map=>map.id));
  return { version: STORAGE_VERSION, maps: validated,
    activeMapId: availableIds.has(data.activeMapId) ? data.activeMapId : [...availableIds][0], updatedAt: Date.now() };
}

function markDirty() {
  if (saveStatus.dataset.state !== 'pending') setSaveStatus('pending');
  dirty = true;
  if (getActiveMap()) getActiveMap().updatedAt = Date.now();
}
function scheduleSave() {
  markDirty();
  clearTimeout(saveTimer);
  if (!pointers.size) saveTimer = setTimeout(saveAppData, 350);
}
function saveAppData() {
  clearTimeout(saveTimer);
  if (!dirty) return true;
  // An earlier debounce must not write halfway through a gesture.
  if (pointers.size) return false;
  try {
    if (recoveryBlocked) throw Error('Original data could not be backed up');
    const data = validateAppData({ version: STORAGE_VERSION, maps, activeMapId, updatedAt: Date.now() });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    dirty = false;
    setSaveStatus('saved');
    return true;
  } catch (error) {
    console.warn('Simple Mind Map: save failed', error);
    setSaveStatus('error');
    return false;
  }
}
function loadAppData() {
  let raw;
  try { raw = localStorage.getItem(STORAGE_KEY); }
  catch (error) {
    console.warn('Simple Mind Map: storage unavailable', error);
    setSaveStatus('error');
    return createInitialData();
  }
  if (raw === null) { scheduleSave(); return createInitialData(); }
  try {
    const parsed = JSON.parse(raw);
    const data = parsed.version === 1 ? migrateV1ToV2(parsed) : validateAppData(parsed);
    // Missing STEP12 fields are safe runtime defaults and do not need an
    // immediate write. Only structural repairs must be persisted at startup.
    const needsNormalization = parsed.version === 1 || parsed.activeMapId !== data.activeMapId
      || parsed.maps?.length !== data.maps.length;
    if (needsNormalization) scheduleSave(); else setSaveStatus('saved');
    return data;
  } catch (error) {
    console.warn('Simple Mind Map: invalid saved data', error);
    // Keep the original before replacing it. A successful replacement prevents
    // the same warning on every subsequent reload.
    try { localStorage.setItem(`${STORAGE_KEY}-recovery`, raw); }
    catch (backupError) { recoveryBlocked = true; console.warn('Backup failed', backupError); }
    notify('保存データを読み込めなかったため、初期状態で起動しました');
    if (recoveryBlocked) setSaveStatus('error'); else scheduleSave();
    return createInitialData();
  }
}
function resetAppData() {
  if (!window.confirm('すべてのマインドマップデータを初期化しますか？')) return false;
  try {
    localStorage.removeItem(`${STORAGE_KEY}-recovery`);
    localStorage.removeItem(STORAGE_KEY);
    clearTimeout(saveTimer);
    dirty = false;
    location.reload();
    return true;
  } catch (error) {
    console.warn('Simple Mind Map: reset failed', error);
    setSaveStatus('error');
    return false;
  }
}
function flushSave() {
  cancelGestures();
  if (dirty) saveAppData();
}
window.addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSave();
});

// History is session-only and contains data, never DOM or viewport changes.
const MAX_HISTORY = 50;
const undoStack = [];
const redoStack = [];
const undoButton = document.querySelector('[data-action="undo"]');
const redoButton = document.querySelector('[data-action="redo"]');
const deepCopy = value => typeof structuredClone === 'function'
  ? structuredClone(value) : JSON.parse(JSON.stringify(value));

function createHistorySnapshot() {
  return deepCopy({ nodes });
}
function updateHistoryButtons() {
  undoButton.disabled = undoStack.length === 0;
  redoButton.disabled = redoStack.length === 0;
}
function appendHistory(stack, snapshot) {
  stack.push(snapshot);
  if (stack.length > MAX_HISTORY) stack.shift();
}
function pushHistory(snapshot = createHistorySnapshot()) {
  appendHistory(undoStack, snapshot);
  redoStack.length = 0;
  updateHistoryButtons();
}
function restoreHistorySnapshot(snapshot) {
  // Reuse storage validation to protect root and all parent relationships.
  const restored = validateMapData({ nodes: deepCopy(snapshot.nodes), viewport }, ROOT_ID);
  nodes.splice(0, nodes.length, ...restored.nodes);
  selectedNodeId = null;
  updateMapTitle();
  renderNodes();
  scheduleSave();
}
function traverseHistory(source, destination) {
  if (!source.length || pointers.size || editor.open || deleteDialog.open || mapDialog.open || importDialog.open) return;
  const current = createHistorySnapshot();
  try {
    restoreHistorySnapshot(source[source.length - 1]);
  } catch (error) {
    console.warn('Simple Mind Map: invalid history', error);
    notify('履歴を復元できませんでした');
    return;
  }
  source.pop();
  appendHistory(destination, current);
  updateHistoryButtons();
}
function undo() { traverseHistory(undoStack, redoStack); }
function redo() { traverseHistory(redoStack, undoStack); }
undoButton.addEventListener('click', undo);
redoButton.addEventListener('click', redo);
document.addEventListener('keydown', event => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.isComposing
    || event.target.isContentEditable || event.target.closest('input,textarea,select')
    || editor.open || deleteDialog.open || mapDialog.open || importDialog.open || pointers.size) return;
  const key = event.key.toLowerCase();
  if (key !== 'z' && !(key === 'y' && event.ctrlKey && !event.shiftKey)) return;
  event.preventDefault();
  if (event.repeat) return;
  if ((key === 'z' && event.shiftKey) || key === 'y') redo(); else undo();
});

function nodeElement(id) {
  return nodeElements.get(id) ?? null;
}

function selectNode(id) {
  selectedNodeId = nodes.some(node => node.id === id) ? id : null;
  deleteButton.disabled = selectedNodeId === null;
  editButton.disabled = selectedNodeId === null;
  styleButton.disabled = selectedNodeId === null;
  if (selectedNodeId === null) closeColorPalette();
  nodeElements.forEach(element => {
    const selected = element.dataset.nodeId === selectedNodeId;
    element.classList.toggle('is-selected', selected);
    element.setAttribute('aria-pressed', String(selected));
  });
  updateColorPalette();
}

function updateColorPalette() {
  const node = nodes.find(item=>item.id===selectedNodeId);
  colorOptions.querySelectorAll('[data-color]').forEach(button=>{
    const current = !!node && button.dataset.color === node.color;
    button.classList.toggle('is-current',current);
    button.setAttribute('aria-pressed',String(current));
  });
}
function closeColorPalette() {
  colorPalette.hidden = true;
  styleButton.setAttribute('aria-expanded','false');
}
function toggleColorPalette() {
  if (styleButton.disabled || editor.open || deleteDialog.open || mapDialog.open || importDialog.open || pointers.size) return;
  mapMenu.hidden = true;
  backupMenu.hidden = true;
  colorPalette.hidden = !colorPalette.hidden;
  styleButton.setAttribute('aria-expanded',String(!colorPalette.hidden));
  updateColorPalette();
  if (!colorPalette.hidden) colorOptions.querySelector('.is-current')?.focus();
}
function changeNodeColor(nodeId,color) {
  if (!Object.hasOwn(themes,color)) color = DEFAULT_NODE_COLOR;
  const node = nodes.find(item=>item.id===nodeId);
  if (!node || node.color === color) { updateColorPalette(); return false; }
  pushHistory();
  node.color = color;
  node.updatedAt = Date.now();
  renderNodes();
  scheduleSave();
  return true;
}
for (const [color,theme] of Object.entries(themes)) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'color-option';
  button.dataset.color = color;
  button.setAttribute('aria-label',`${theme.label}に変更`);
  button.title = `${theme.label}に変更`;
  button.setAttribute('aria-pressed','false');
  button.style.setProperty('--swatch',theme.swatch);
  button.style.setProperty('--swatch-border',theme.border);
  const swatch = document.createElement('span');
  swatch.className = 'color-swatch';
  swatch.setAttribute('aria-hidden','true');
  const check = document.createElement('span');
  check.className = 'color-check';
  check.textContent = '✓';
  check.setAttribute('aria-hidden','true');
  button.append(swatch,check);
  button.addEventListener('click',()=>changeNodeColor(selectedNodeId,color));
  colorOptions.append(button);
}
styleButton.setAttribute('aria-expanded','false');
styleButton.addEventListener('click',toggleColorPalette);
document.querySelector('[data-action="close-colors"]').addEventListener('click',()=>{
  closeColorPalette();
  styleButton.focus();
});
document.addEventListener('click',event=>{
  if (!event.target.closest('#color-palette,[data-action="style"]')) closeColorPalette();
});
document.addEventListener('keydown',event=>{
  if (event.key === 'Escape' && !colorPalette.hidden) {
    event.preventDefault();
    event.stopImmediatePropagation();
    closeColorPalette();
    styleButton.focus();
  }
},true);

function renderNodes() {
  nodeElements.forEach(element => element.remove());
  nodeElements.clear();
  const fragment = document.createDocumentFragment();
  for (const node of nodes) {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = `node ${node.id === ROOT_ID ? 'main-node' : `category-node ${themes[node.color].className}`}`;
    element.dataset.color = node.color;
    element.dataset.nodeId = node.id;
    element.dataset.parentId = node.parentId ?? '';
    element.title = `${node.text} — ダブルクリック、または選択後にもう一度タップで編集`;
    if (node.icon) {
      const icon = document.createElementNS(svgNS, 'svg');
      icon.classList.add('icon');
      icon.setAttribute('aria-hidden', 'true');
      const use = document.createElementNS(svgNS, 'use');
      use.setAttribute('href', `#i-${node.icon}`);
      icon.append(use);
      element.append(icon);
    }
    const label = document.createElement('span');
    label.className = 'node-label';
    label.textContent = node.text;
    element.append(label);
    nodeElements.set(node.id,element);
    fragment.append(element);
  }
  world.append(fragment);
  layoutNodes();
  selectNode(selectedNodeId);
  refreshSearch();
}

function positionNode(node) {
  const element = nodeElement(node.id);
  // Preserve STEP1's slightly wider mobile branch arrangement.
  const initialStudy = (node.layoutKey || node.id) === 'study' && node.x === 156 && node.y === 222;
  const initialTravel = (node.layoutKey || node.id) === 'travel' && node.x === 644 && node.y === 222;
  const x = !node.moved && mobile.matches && initialStudy ? 144
    : !node.moved && mobile.matches && initialTravel ? 656 : node.x;
  element.style.left = `${x / 8}%`;
  element.style.top = `${node.y / 5}%`;
}

function overlaps(a, b, gap = 10) {
  return a.left < b.right + gap && a.right + gap > b.left
    && a.top < b.bottom + gap && a.bottom + gap > b.top;
}

// Search around the parent first, then look for the nearest remaining free slot.
// Automatic placement only handles new nodes; manually moved nodes keep their positions.
function worldRect(id) {
  const rect = nodeElement(id).getBoundingClientRect();
  const origin = world.getBoundingClientRect();
  return { left: (rect.left-origin.left)/origin.width*800,
    right: (rect.right-origin.left)/origin.width*800,
    top: (rect.top-origin.top)/origin.height*500,
    bottom: (rect.bottom-origin.top)/origin.height*500 };
}

function findPosition(node) {
  const parent = worldRect(node.parentId);
  const size = worldRect(node.id);
  const width = size.right-size.left, height = size.bottom-size.top;
  const occupied = nodes.filter(other => other.id !== node.id).map(other => worldRect(other.id));
  const x = (parent.left+parent.right)/2, y = (parent.top+parent.bottom)/2;
  for (let ring = 1; ring <= nodes.length + 1; ring++) {
    for (const [dx,dy] of [[1,-1],[1,0],[1,1],[-1,1],[-1,0],[-1,-1]]) {
      const cx = x+dx*((parent.right-parent.left+width)/2+30)*ring;
      const cy = y+dy*((parent.bottom-parent.top+height)/2+30)*ring;
      const rect = { left:cx-width/2, right:cx+width/2, top:cy-height/2, bottom:cy+height/2 };
      if (!occupied.some(other => overlaps(rect, other, 18))) return { x:cx, y:cy };
    }
  }
  return null;
}

const AUTO_LAYOUT_ROOT = { x:400, y:250 };
const AUTO_LAYOUT_HORIZONTAL_GAP = 205;
const AUTO_LAYOUT_VERTICAL_GAP = 88;

// Calculate into a separate Map first. Invalid or cyclic data never mutates the
// current map, even if it somehow bypassed the normal storage validation.
function calculateAutoLayout(targetNodes = nodes) {
  if (!Array.isArray(targetNodes) || !targetNodes.length) return null;
  const byId = new Map(), children = new Map();
  for (const node of targetNodes) {
    if (!node || typeof node.id !== 'string' || !node.id || byId.has(node.id)
      || !Number.isFinite(node.x) || !Number.isFinite(node.y)) return null;
    byId.set(node.id,node);
    children.set(node.id,[]);
  }
  const roots = targetNodes.filter(node=>node.parentId===null);
  if (roots.length !== 1) return null;
  for (const node of targetNodes) {
    if (node.parentId === null) continue;
    if (!byId.has(node.parentId)) return null;
    children.get(node.parentId).push(node);
  }

  const weights = new Map(), visiting = new Set(), visited = new Set();
  function calculateSubtreeSize(id) {
    if (visiting.has(id)) throw Error('cycle');
    if (weights.has(id)) return weights.get(id);
    visiting.add(id);
    visited.add(id);
    const descendants = children.get(id);
    const size = descendants.length
      ? descendants.reduce((total,child)=>total+calculateSubtreeSize(child.id),0) : 1;
    visiting.delete(id);
    weights.set(id,size);
    return size;
  }
  try { calculateSubtreeSize(roots[0].id); }
  catch (error) { return null; }
  if (visited.size !== targetNodes.length) return null;

  const positions = new Map([[roots[0].id,{...AUTO_LAYOUT_ROOT}]]);
  function layoutSubtree(node,direction,depth,top) {
    const span = weights.get(node.id)*AUTO_LAYOUT_VERTICAL_GAP;
    positions.set(node.id,{ x:AUTO_LAYOUT_ROOT.x+direction*depth*AUTO_LAYOUT_HORIZONTAL_GAP,
      y:top+span/2 });
    let childTop = top;
    for (const child of children.get(node.id)) {
      layoutSubtree(child,direction,depth+1,childTop);
      childTop += weights.get(child.id)*AUTO_LAYOUT_VERTICAL_GAP;
    }
  }
  function layoutSide(branches,direction) {
    const total = branches.reduce((sum,node)=>sum+weights.get(node.id),0)*AUTO_LAYOUT_VERTICAL_GAP;
    let top = AUTO_LAYOUT_ROOT.y-total/2;
    for (const branch of branches) {
      layoutSubtree(branch,direction,1,top);
      top += weights.get(branch.id)*AUTO_LAYOUT_VERTICAL_GAP;
    }
  }
  const rootChildren = children.get(roots[0].id);
  const leftCount = Math.floor(rootChildren.length/2);
  layoutSide(rootChildren.slice(0,leftCount),-1);
  layoutSide(rootChildren.slice(leftCount),1);
  return positions;
}

function autoLayoutCurrentMap() {
  if (pointers.size || editor.open || deleteDialog.open || mapDialog.open || importDialog.open) return false;
  const map = getActiveMap();
  if (!map || map.nodes !== nodes) return false;
  const positions = calculateAutoLayout(map.nodes);
  if (!positions || positions.size !== map.nodes.length) {
    console.warn('Simple Mind Map: auto layout skipped because the node tree is invalid');
    notify('自動整理できませんでした');
    return false;
  }
  const changed = map.nodes.some(node=>{
    const position = positions.get(node.id);
    return Math.abs(node.x-position.x)>.01 || Math.abs(node.y-position.y)>.01;
  });
  if (changed) {
    pushHistory();
    for (const node of map.nodes) Object.assign(node,positions.get(node.id));
    renderNodes();
    scheduleSave();
  }
  fitToView();
  notify(changed ? 'ノードを自動整理しました' : 'すでに整理されています');
  return changed;
}

function layoutNodes() {
  nodes.forEach(positionNode);
  renderConnections();
}

function renderConnections(movedId = null) {
  if (movedId === null) {
    connections.replaceChildren();
    connectionPaths.clear();
  }
  const origin = world.getBoundingClientRect();
  const rectFor = id => {
    const rect = nodeElement(id).getBoundingClientRect();
    return { x: (rect.left + rect.width/2-origin.left)/origin.width*800,
      y: (rect.top + rect.height/2-origin.top)/origin.height*500,
      halfWidth: rect.width/origin.width*400, halfHeight: rect.height/origin.height*250 };
  };
  for (const node of nodes) {
    if (node.parentId === null) continue; // The root has no parent and is never removed.
    if (movedId !== null && node.id !== movedId && node.parentId !== movedId) continue;
    const parent = rectFor(node.parentId);
    const child = rectFor(node.id);
    const curve = connectionCurve(parent,child);
    const pathData = `M${curve.start.x} ${curve.start.y} C${curve.control1.x} ${curve.control1.y} ${curve.control2.x} ${curve.control2.y} ${curve.end.x} ${curve.end.y}`;
    const path = movedId === null ? document.createElementNS(svgNS, 'path')
      : connectionPaths.get(node.id);
    if (!path) continue;
    path.setAttribute('d', pathData);
    path.setAttribute('stroke', themes[node.color].stroke);
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    path.dataset.parentId = node.parentId;
    path.dataset.childId = node.id;
    if (movedId === null) {
      connectionPaths.set(node.id,path);
      connections.append(path);
    }
  }
}

function connectionCurve(parent,child) {
  const dx = child.x-parent.x, dy = child.y-parent.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    const direction = Math.sign(dx) || 1;
    const start = { x:parent.x+direction*parent.halfWidth, y:parent.y };
    const end = { x:child.x-direction*child.halfWidth, y:child.y };
    const middle = (start.x+end.x)/2;
    return { start, control1:{x:middle,y:start.y}, control2:{x:middle,y:end.y}, end };
  }
  const direction = Math.sign(dy) || 1;
  const start = { x:parent.x, y:parent.y+direction*parent.halfHeight };
  const end = { x:child.x, y:child.y-direction*child.halfHeight };
  const middle = (start.y+end.y)/2;
  return { start, control1:{x:start.x,y:middle}, control2:{x:end.x,y:middle}, end };
}

function openEditor(mode, id = selectedNodeId ?? ROOT_ID) {
  if (editor.open || deleteDialog.open || mapDialog.open || importDialog.open || dragState?.dragging || pinchState) return;
  const node = nodes.find(item => item.id === id);
  editorState = { mode, id };
  document.querySelector('#editor-title').textContent = mode === 'add' ? '子ノードを追加' : 'ノード名を編集';
  document.querySelector('#editor-description').textContent = mode === 'add' ? `「${node.text}」につなげます` : 'アイデアに名前をつけましょう';
  document.querySelector('.editor-submit').textContent = mode === 'add' ? '追加' : '変更';
  nameInput.value = mode === 'add' ? '新しいノード' : node.text;
  errorText.textContent = '';
  nameInput.removeAttribute('aria-invalid');
  editor.showModal();
  nameInput.focus();
  nameInput.select();
}

form.addEventListener('submit', event => {
  event.preventDefault();
  if (event.isComposing) return;
  const text = nameInput.value.trim();
  if (!text) {
    errorText.textContent = 'ノード名を入力してください。';
    nameInput.setAttribute('aria-invalid', 'true');
    nameInput.focus();
    return;
  }
  let targetId = editorState.id;
  if (editorState.mode === 'add') {
    const parent = nodes.find(node => node.id === editorState.id);
    while (maps.some(map => map.nodes.some(node => node.id === `node-${nextId}`))) nextId++;
    const now = Date.now();
    const node = { id: `node-${nextId++}`, text, parentId: parent.id, x: parent.x, y: parent.y,
      color: parent.color, icon: parent.icon, added: true, createdAt: now, updatedAt: now };
    const beforeAdd = createHistorySnapshot();
    nodes.push(node);
    renderNodes();
    const position = findPosition(node);
    if (!position) {
      nodes.pop();
      renderNodes();
      errorText.textContent = '配置できる余白がありません。';
      return;
    }
    pushHistory(beforeAdd);
    Object.assign(node, position);
    targetId = node.id;
  } else {
    if (nodes.find(node => node.id === targetId).text === text) { editor.close(); return; }
    pushHistory();
    Object.assign(nodes.find(node => node.id === targetId), { text, updatedAt: Date.now() });

  }
  selectNode(targetId);
  renderNodes();
  editor.close();
  nodeElement(targetId).focus({ preventScroll: true });
  revealNode(targetId);
  scheduleSave();
});

// Prevent Enter used to confirm Japanese IME composition from submitting the form.
nameInput.addEventListener('keydown', event => {
  if (event.key === 'Enter' && (event.isComposing || event.keyCode === 229)) event.preventDefault();
});
nameInput.addEventListener('input', () => {
  errorText.textContent = '';
  nameInput.removeAttribute('aria-invalid');
});
document.querySelector('[data-action="cancel-edit"]').addEventListener('click', () => editor.close());
editor.addEventListener('close', () => { editorState = null; });

// click supports pointer and keyboard activation without duplicate touch/mouse events.
stage.addEventListener('click', event => {
  const element = event.target.closest('.node');
  if (!element) return;
  const id = element.dataset.nodeId;
  if (selectedNodeId === id && (event.pointerType === 'touch' || mobile.matches)) openEditor('edit', id);
  else selectNode(id);
});
stage.addEventListener('dblclick', event => {
  if (performance.now() - lastDragEnd < 400) return;
  const element = event.target.closest('.node');
  if (element) openEditor('edit', element.dataset.nodeId);
});
stage.addEventListener('keydown', event => {
  const element = event.target.closest('.node');
  if (element && (event.key === 'F2' || event.key === 'Enter')) {
    event.preventDefault();
    selectNode(element.dataset.nodeId);
    openEditor('edit', element.dataset.nodeId);
  }
});
canvas.addEventListener('click', event => {
  if (!event.target.closest('button,.bottom-toolbar,.zoom-controls')) selectNode(null);
});
document.querySelectorAll('[data-action="quick-add"],[data-action="add-node"],[data-action="add-subtopic"]')
  .forEach(button => button.addEventListener('click', () => openEditor('add')));
editButton.addEventListener('click',()=>{
  if (selectedNodeId !== null) openEditor('edit',selectedNodeId);
});

// Deletion is only committed by the confirmation button. Capture its target id
// so keyboard focus changes cannot change which subtree is being removed.
function notify(message) {
  clearTimeout(noticeTimer);
  notice.textContent = message;
  notice.hidden = false;
  noticeTimer = setTimeout(() => { notice.hidden = true; }, 3500);
}

function descendantIds(id) {
  const ids = new Set([id]);
  const queue = [id];
  while (queue.length) {
    const parentId = queue.pop();
    for (const node of nodes) {
      if (node.parentId === parentId && !ids.has(node.id)) {
        ids.add(node.id);
        queue.push(node.id);
      }
    }
  }
  return ids;
}

function requestDelete() {
  if (selectedNodeId === null || editor.open || deleteDialog.open || mapDialog.open || importDialog.open || pointers.size) return;
  if (selectedNodeId === ROOT_ID) {
    notify('メインノードは削除できません');
    return;
  }
  const node = nodes.find(node => node.id === selectedNodeId);
  if (!node) return;
  pendingDeleteId = node.id;
  const count = descendantIds(node.id).size - 1;
  document.querySelector('#delete-description').textContent = count
    ? `「${node.text}」には子ノードがあります。このノードとすべての子孫ノード（${count}件）を削除しますか？`
    : `「${node.text}」を削除します。削除後は「元に戻す」で復元できます。`;
  deleteDialog.showModal();
  document.querySelector('[data-action="cancel-delete"]').focus();
}

deleteButton.addEventListener('click', requestDelete);
document.querySelector('[data-action="cancel-delete"]').addEventListener('click', () => deleteDialog.close());
deleteDialog.addEventListener('close', () => { pendingDeleteId = null; });
document.querySelector('[data-action="confirm-delete"]').addEventListener('click', () => {
  if (!pendingDeleteId || pendingDeleteId === ROOT_ID) return;
  pushHistory();
  const ids = descendantIds(pendingDeleteId);
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (nodes[i].id !== ROOT_ID && ids.has(nodes[i].id)) nodes.splice(i, 1);
  }
  selectNode(null);
  renderNodes();
  deleteDialog.close();
  document.querySelector('[data-action="add-node"]').focus({ preventScroll: true });
  notify(`${ids.size}件のノードを削除しました`);
  scheduleSave();
});
document.addEventListener('keydown', event => {
  if (!['Delete', 'Backspace'].includes(event.key) || event.isComposing || event.repeat
    || event.ctrlKey || event.metaKey || event.altKey || editor.open || deleteDialog.open || mapDialog.open || importDialog.open
    || event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')) return;
  if (selectedNodeId !== null) {
    event.preventDefault();
    requestDelete();
  }
});

// A single gesture controller arbitrates node drag, background pan and pinch.
function applyViewport() {
  world.style.transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`;
  document.querySelector('.zoom-value').textContent = `${Math.round(viewport.scale*100)}%`;
}

function clientToWorld(clientX, clientY) {
  const rect = world.getBoundingClientRect();
  return { x: (clientX-rect.left)/rect.width*800, y: (clientY-rect.top)/rect.height*500 };
}

function placeAnchor(point, clientX, clientY, scale, persist = true) {
  const base = stage.getBoundingClientRect();
  viewport.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
  viewport.x = clientX-base.left-point.x/800*base.width*viewport.scale;
  viewport.y = clientY-base.top-point.y/500*base.height*viewport.scale;
  applyViewport();
  if (persist) scheduleSave();
}

function viewArea() {
  const rect = canvas.getBoundingClientRect();
  const toolbar = document.querySelector('.bottom-toolbar').getBoundingClientRect();
  const zoom = document.querySelector('.zoom-controls').getBoundingClientRect();
  return { left: rect.left+24, right: rect.right-72, top: rect.top+60,
    bottom: Math.min(toolbar.top-24, mobile.matches ? zoom.top-20 : toolbar.top-24) };
}

function zoomAt(scale, x, y) {
  if (pointers.size || editor.open || deleteDialog.open || mapDialog.open || importDialog.open) return;
  placeAnchor(clientToWorld(x,y),x,y,scale);
}

function zoomBy(factor) {
  const area = viewArea();
  zoomAt(viewport.scale*factor,(area.left+area.right)/2,(area.top+area.bottom)/2);
}

function centerOnRoot() {
  const rect = worldRect(ROOT_ID), area = viewArea();
  placeAnchor({x:(rect.left+rect.right)/2,y:(rect.top+rect.bottom)/2},
    (area.left+area.right)/2,(area.top+area.bottom)/2,viewport.scale);
}

function centerOnNode(nodeId) {
  if (!nodes.some(node => node.id === nodeId) || !nodeElement(nodeId)) return false;
  const rect = worldRect(nodeId), area = viewArea();
  placeAnchor({ x:(rect.left+rect.right)/2, y:(rect.top+rect.bottom)/2 },
    (area.left+area.right)/2, (area.top+area.bottom)/2,
    viewport.scale < .7 ? .8 : viewport.scale, false);
  return true;
}

function fitToView() {
  if (pointers.size) return;
  const rects = nodes.map(node => worldRect(node.id));
  const left = Math.min(...rects.map(r=>r.left)), right = Math.max(...rects.map(r=>r.right));
  const top = Math.min(...rects.map(r=>r.top)), bottom = Math.max(...rects.map(r=>r.bottom));
  const base = stage.getBoundingClientRect(), area = viewArea();
  const scale = Math.min((area.right-area.left)/((right-left)/800*base.width+60),
    (area.bottom-area.top)/((bottom-top)/500*base.height+60));
  placeAnchor({x:(left+right)/2,y:(top+bottom)/2},(area.left+area.right)/2,(area.top+area.bottom)/2,scale);
  if (scale < MIN_SCALE) notify('40%でも収まらない範囲は、背景をドラッグして移動できます');
}

function revealNode(id) {
  const r = nodeElement(id).getBoundingClientRect(), area = viewArea();
  if (r.left >= area.left && r.right <= area.right && r.top >= area.top && r.bottom <= area.bottom) return;
  const rect = worldRect(id);
  placeAnchor({x:(rect.left+rect.right)/2,y:(rect.top+rect.bottom)/2},
    (area.left+area.right)/2,(area.top+area.bottom)/2,viewport.scale);
}

document.querySelector('[data-action="zoom-in"]').addEventListener('click',()=>zoomBy(1.1));
document.querySelector('[data-action="zoom-out"]').addEventListener('click',()=>zoomBy(1/1.1));
document.querySelector('[data-action="fit-view"]').addEventListener('click',fitToView);
document.querySelector('[data-action="auto-layout"]').addEventListener('click',autoLayoutCurrentMap);
const isTool = target => !!target.closest('.bottom-toolbar,.zoom-controls,.quick-add,input,dialog');
canvas.addEventListener('wheel',event=>{
  if (isTool(event.target) || editor.open || deleteDialog.open || mapDialog.open || importDialog.open) return;
  event.preventDefault();
  const delta = event.deltaY*(event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1);
  zoomAt(viewport.scale*Math.exp(-Math.max(-100,Math.min(100,delta))*0.002),event.clientX,event.clientY);
},{passive:false});

function stopNodeDrag() {
  if (dragState?.dragging) {
    nodes.find(node => node.id === dragState.nodeId).updatedAt = Date.now();
  }
  if (dragState) dragState.element.classList.remove('is-dragging');
  dragState = null;
}
function suppressGestureClick() {
  suppressDragClick = true;
  lastDragEnd = performance.now();
}
function startPinch() {
  stopNodeDrag();
  panState = null;
  canvas.classList.remove('is-panning');
  const [a,b] = [...pointers.values()];
  const x = (a.x+b.x)/2, y = (a.y+b.y)/2;
  pinchState = { distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)), scale:viewport.scale,
    anchor:clientToWorld(x,y) };
  suppressGestureClick();
}
canvas.addEventListener('pointerdown',event=>{
  if (pointers.size === 0) suppressDragClick = false;
  if (event.button !== 0 || isTool(event.target) || editor.open || deleteDialog.open || mapDialog.open || importDialog.open || pointers.size >= 2) return;
  clearTimeout(saveTimer);
  pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
  const element = event.target.closest('.node');
  (element || canvas).setPointerCapture(event.pointerId);
  if (pointers.size >= 2) { startPinch(); return; }
  if (element) {
    const point = clientToWorld(event.clientX,event.clientY);
    const rect = worldRect(element.dataset.nodeId);
    dragState = { nodeId:element.dataset.nodeId, element, dragging:false,
      startPointerX:event.clientX,startPointerY:event.clientY,
      startNodeX:(rect.left+rect.right)/2,startNodeY:(rect.top+rect.bottom)/2,
      startWorld:point };
  } else {
    panState = {startPointerX:event.clientX,startPointerY:event.clientY,
      startViewportX:viewport.x,startViewportY:viewport.y,active:false};
  }
});
canvas.addEventListener('pointermove',event=>{
  if (!pointers.has(event.pointerId)) return;
  pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
  if (pinchState) {
    event.preventDefault();
    if (pointers.size < 2) return; // Ignore the remaining finger until both lift.
    const [a,b] = [...pointers.values()];
    placeAnchor(pinchState.anchor,(a.x+b.x)/2,(a.y+b.y)/2,
      pinchState.scale*Math.hypot(a.x-b.x,a.y-b.y)/pinchState.distance);
    return;
  }
  const state = dragState || panState;
  if (!state) return;
  const dx = event.clientX-state.startPointerX, dy = event.clientY-state.startPointerY;
  if (!state.dragging && !state.active && Math.hypot(dx,dy)<=5) return;
  event.preventDefault();
  markDirty();
  if (dragState) {
    if (!dragState.dragging) {
      pushHistory();
      dragState.dragging = true;
      selectNode(dragState.nodeId);
      dragState.element.classList.add('is-dragging');
    }
    const node = nodes.find(node=>node.id===dragState.nodeId);
    const point = clientToWorld(event.clientX,event.clientY);
    node.x = Math.max(-10000,Math.min(10000,dragState.startNodeX+point.x-dragState.startWorld.x));
    node.y = Math.max(-10000,Math.min(10000,dragState.startNodeY+point.y-dragState.startWorld.y));
    node.moved = true;
    positionNode(node);
    renderConnections(node.id);
  } else {
    panState.active = true;
    canvas.classList.add('is-panning');
    viewport.x = panState.startViewportX+dx;
    viewport.y = panState.startViewportY+dy;
    applyViewport();
  }
});
function endGesture(event) {
  if (!pointers.has(event.pointerId)) return;
  if (pinchState || dragState?.dragging || panState?.active) suppressGestureClick();
  pointers.delete(event.pointerId);
  stopNodeDrag();
  panState = null;
  canvas.classList.remove('is-panning');
  if (!pointers.size) {
    pinchState = null;
    if (dirty) scheduleSave();
  }
}
canvas.addEventListener('pointerup',endGesture);
canvas.addEventListener('pointercancel',endGesture);
canvas.addEventListener('lostpointercapture',endGesture);
function cancelGestures() {
  if (pointers.size) suppressGestureClick();
  pointers.clear();
  stopNodeDrag();
  panState = null;
  pinchState = null;
  canvas.classList.remove('is-panning');
  if (dirty) scheduleSave();
}
window.addEventListener('blur',cancelGestures);
canvas.addEventListener('click',event=>{
  if (!suppressDragClick || event.detail===0) return;
  event.preventDefault();
  event.stopImmediatePropagation();
},true);
canvas.addEventListener('contextmenu',event=>{
  if (!isTool(event.target)) event.preventDefault();
});

// Search is transient view state: it never enters history or localStorage.
const desktopSearchInput = document.querySelector('#node-search');
const desktopSearchResults = document.querySelector('#desktop-search-results');
const mobileSearchPanel = document.querySelector('#mobile-search');
const mobileSearchInput = document.querySelector('#mobile-node-search');
const mobileSearchResults = document.querySelector('#mobile-search-results');
const searchInputs = [desktopSearchInput, mobileSearchInput];
const searchLists = [desktopSearchResults, mobileSearchResults];
const MAX_SEARCH_RESULTS = 20;

function normalizedSearch(value) {
  return value.trim().toLocaleLowerCase();
}
function findNodeById(id) {
  return nodes.find(node => node.id === id) || null;
}
function getParentNode(node) {
  return node.parentId === null ? null : findNodeById(node.parentId);
}
function appendHighlightedText(label, text, query) {
  const index = text.toLocaleLowerCase().indexOf(query);
  if (index < 0) { label.textContent = text; return; }
  label.append(document.createTextNode(text.slice(0,index)));
  const mark = document.createElement('mark');
  mark.textContent = text.slice(index,index+query.length);
  label.append(mark, document.createTextNode(text.slice(index+query.length)));
}
function applySearchHighlights() {
  const matches = new Set(searchResults.map(node => node.id));
  stage.querySelectorAll('.node').forEach(element => {
    element.classList.toggle('is-search-match', !!searchQuery && matches.has(element.dataset.nodeId));
  });
}
function renderSearchList(list) {
  list.replaceChildren();
  list.hidden = !searchQuery;
  if (!searchQuery) return;
  const summary = document.createElement('p');
  summary.className = searchResults.length ? 'search-summary' : 'search-empty';
  summary.textContent = searchResults.length ? `${searchResults.length}件見つかりました` : '一致するノードがありません';
  list.append(summary);
  searchResults.slice(0,MAX_SEARCH_RESULTS).forEach((node,index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'search-result' + (index === searchActiveIndex ? ' is-active' : '');
    button.id = `${list.id}-result-${index}`;
    button.setAttribute('role','option');
    button.setAttribute('aria-selected',String(index === searchActiveIndex));
    button.dataset.nodeId = node.id;
    const label = document.createElement('span');
    label.className = 'search-result-label';
    const name = document.createElement('span');
    name.className = 'search-result-name';
    appendHighlightedText(name,node.text,searchQuery);
    label.append(name);
    const parent = getParentNode(node);
    if (parent) {
      const detail = document.createElement('span');
      detail.className = 'search-result-parent';
      detail.textContent = `親：${parent.text}`;
      label.append(detail);
    }
    button.append(label);
    button.addEventListener('click',()=>chooseSearchResult(node.id));
    list.append(button);
  });
  if (searchResults.length > MAX_SEARCH_RESULTS) {
    const more = document.createElement('p');
    more.className = 'search-more';
    more.textContent = `ほか${searchResults.length-MAX_SEARCH_RESULTS}件`;
    list.append(more);
  }
}
function refreshSearch() {
  searchResults = searchQuery ? nodes.filter(node => node.text.toLocaleLowerCase().includes(searchQuery)) : [];
  if (searchActiveIndex >= searchResults.length) searchActiveIndex = searchResults.length ? searchResults.length-1 : -1;
  searchLists.forEach(renderSearchList);
  applySearchHighlights();
}
function updateSearch(value, source) {
  searchQuery = normalizedSearch(value);
  searchActiveIndex = searchQuery ? 0 : -1;
  searchInputs.forEach(input => { if (input !== source) input.value = value; });
  refreshSearch();
}
function pulseSearchNode(id) {
  clearTimeout(searchHighlightTimer);
  stage.querySelectorAll('.node.is-search-target').forEach(element => element.classList.remove('is-search-target'));
  const element = nodeElement(id);
  if (!element) return;
  element.classList.add('is-search-target');
  searchHighlightTimer = setTimeout(()=>element.classList.remove('is-search-target'),1800);
}
function chooseSearchResult(id) {
  if (!findNodeById(id)) { refreshSearch(); return; }
  selectNode(id);
  centerOnNode(id);
  if (mobile.matches) closeSearch(true);
  pulseSearchNode(id);
  nodeElement(id)?.focus({preventScroll:true});
}
function openSearch() {
  if (editor.open || deleteDialog.open || mapDialog.open || importDialog.open) return;
  mapMenu.hidden = true;
  backupMenu.hidden = true;
  if (mobile.matches) {
    closeDrawer();
    mobileSearchPanel.hidden = false;
    document.querySelector('.app-shell').inert = true;
    mobileSearchInput.focus();
  } else desktopSearchInput.focus();
}
function closeSearch(clear = true) {
  if (clear) {
    searchQuery = '';
    searchActiveIndex = -1;
    searchInputs.forEach(input => { input.value = ''; });
    refreshSearch();
  }
  mobileSearchPanel.hidden = true;
  document.querySelector('.app-shell').inert = false;
  desktopSearchInput.blur();
  mobileSearchInput.blur();
}
function resetSearchState() {
  clearTimeout(searchHighlightTimer);
  closeSearch(true);
}
function moveSearchSelection(delta, input) {
  if (!searchResults.length) return;
  searchActiveIndex = (searchActiveIndex+delta+searchResults.length)%searchResults.length;
  searchLists.forEach(renderSearchList);
  const list = mobile.matches ? mobileSearchResults : desktopSearchResults;
  const option = list.querySelector(`[data-node-id="${CSS.escape(searchResults[searchActiveIndex].id)}"]`);
  input.setAttribute('aria-activedescendant',option?.id || '');
  option?.scrollIntoView({block:'nearest'});
}
searchInputs.forEach(input => {
  input.addEventListener('input',()=>updateSearch(input.value,input));
  input.addEventListener('keydown',event=>{
    if (event.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveSearchSelection(event.key === 'ArrowDown' ? 1 : -1,input);
    } else if (event.key === 'Enter' && searchResults[searchActiveIndex]) {
      event.preventDefault();
      chooseSearchResult(searchResults[searchActiveIndex].id);
    }
  });
});
document.querySelector('[data-action="open-search"]').addEventListener('click',openSearch);
document.querySelector('[data-action="close-search"]').addEventListener('click',()=>{
  closeSearch(true);
  document.querySelector('[data-action="open-search"]').focus();
});
document.addEventListener('keydown',event=>{
  if (event.isComposing || editor.open || deleteDialog.open || mapDialog.open || importDialog.open) return;
  if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'f') {
    event.preventDefault();
    openSearch();
    return;
  }
  if (event.key === 'Escape' && (searchQuery || !mobileSearchPanel.hidden)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    closeSearch(true);
  }
},true);

const mapDialog = document.querySelector('#map-dialog');
const mapForm = document.querySelector('#map-form');
const mapName = document.querySelector('#map-name');
const mapMenu = document.querySelector('#map-menu');
const trashView = document.querySelector('#trash-view');
const trashList = document.querySelector('#trash-list');
let mapAction = null;
let menuMapId = null;
function updateMapTitle() {
  document.querySelector('.map-heading h1').textContent = getActiveMap().title;
  canvas.setAttribute('aria-label', `${getActiveMap().title}のマインドマップ`);
}
function activateMap(id) {
  activeMapId = id;
  const map = getActiveMap();
  nodes = map.nodes;
  viewport = map.viewport;
  ROOT_ID = nodes.find(node => node.parentId === null).id;
  resetSearchState();
  selectedNodeId = null;
  undoStack.length = 0;
  redoStack.length = 0;
  updateHistoryButtons();
  updateMapTitle();
  applyViewport();
  renderNodes();
  renderMapList();
}
function switchMap(id) {
  if (!maps.some(map => map.id === id && map.deletedAt===null) || editor.open || deleteDialog.open || mapDialog.open || importDialog.open) return;
  cancelGestures();
  if (dirty) saveAppData(); // Failure keeps every map in memory; next save retries all.
  const changed = activeMapId !== id;
  if (changed) activateMap(id);
  closeDrawer();
  if (changed) scheduleSave();
}
function renderMapList() {
  const list = document.querySelector('.map-list');
  list.replaceChildren();
  for (const map of getOrderedActiveMaps()) {
    const row = document.createElement('div');
    row.className = 'map-row';
    const button = document.createElement('button');
    button.className = 'map-item' + (map.id === activeMapId ? ' is-selected' : '');
    button.dataset.mapId = map.id;
    button.title = map.title;
    if (map.id === activeMapId) button.setAttribute('aria-current','page');
    button.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-logo"/></svg>';
    const label = document.createElement('span');
    label.textContent = map.title;
    button.append(label);
    if (map.isFavorite) {
      const favorite = document.createElement('span');
      favorite.className = 'map-favorite';
      favorite.textContent = '★';
      favorite.setAttribute('aria-hidden','true');
      button.append(favorite);
    }
    button.addEventListener('click',()=>switchMap(map.id));
    const more = document.createElement('button');
    more.className = 'map-more icon-button';
    more.setAttribute('aria-label',`${map.title}のメニュー`);
    more.setAttribute('aria-haspopup','menu');
    more.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-more"/></svg>';
    more.addEventListener('click',event=>{
      event.stopPropagation();
      menuMapId = map.id;
      mapMenu.querySelector('[data-map-action="favorite"]').textContent = map.isFavorite ? 'お気に入りを解除' : 'お気に入りに追加';
      mapMenu.hidden = false;
      const rect = more.getBoundingClientRect();
      mapMenu.style.left = `${Math.max(8,Math.min(rect.right-170,innerWidth-180))}px`;
      mapMenu.style.top = `${Math.max(8,Math.min(rect.bottom+4,innerHeight-210))}px`;
      mapMenu.querySelector('button').focus();
    });
    row.append(button,more);
    list.append(row);
  }
  const count = getTrashedMaps().length, badge = document.querySelector('#trash-count');
  badge.textContent = String(count);
  badge.hidden = count === 0;
}
function openMapDialog(action,id = null) {
  mapMenu.hidden = true;
  backupMenu.hidden = true;
  if (editor.open || deleteDialog.open || mapDialog.open || importDialog.open) return;
  const map = maps.find(map=>map.id===id);
  if (!['create','empty-trash'].includes(action) && !map) return;
  if ((action === 'delete' && map.deletedAt!==null)
    || (action === 'permanent-delete' && map.deletedAt===null)) return;
  mapAction = {action,id};
  const requiresName = action === 'create' || action === 'rename';
  const destructive = ['delete','permanent-delete','empty-trash'].includes(action);
  const titles = { create:'新しいマップ', rename:'マップ名を変更',
    delete:`「${map?.title}」をゴミ箱へ移動しますか？`,
    'permanent-delete':`「${map?.title}」を完全に削除しますか？`, 'empty-trash':'ゴミ箱を空にしますか？' };
  const descriptions = { delete:'マップの内容はゴミ箱に保持され、後から復元できます。',
    'permanent-delete':'このマップを完全に削除します。この操作は元に戻せません。',
    'empty-trash':'ゴミ箱内のすべてのマップを完全に削除します。この操作は元に戻せません。' };
  document.querySelector('#map-dialog-title').textContent = titles[action];
  document.querySelector('#map-dialog-description').textContent = descriptions[action] || '';
  document.querySelector('#map-name-field').hidden = !requiresName;
  document.querySelector('#map-error').textContent = '';
  mapName.value = map ? map.title : '';
  const submit = document.querySelector('#map-submit');
  submit.textContent = action === 'delete' ? '移動' : action === 'create' ? '作成' : action === 'rename' ? '変更' : '完全に削除';
  submit.classList.toggle('delete-confirm',destructive);
  mapDialog.showModal();
  if (destructive) document.querySelector('[data-action="cancel-map"]').focus();
  else { mapName.focus(); mapName.select(); }
}
function newEmptyMap(title) {
  const now = Date.now();
  return { id:makeMapId(), title, createdAt:now, updatedAt:now, viewport:{x:0,y:0,scale:1},
    isFavorite:false, deletedAt:null,
    nodes:[{id:`node-${crypto.randomUUID()}`,text:'新しいアイデア',parentId:null,x:400,y:270,color:'blue',createdAt:now,updatedAt:now}] };
}
function duplicateMap(id) {
  const source = maps.find(map=>map.id===id && map.deletedAt===null);
  if (!source) return;
  cancelGestures();
  if (dirty) saveAppData();
  const copy = deepCopy(source), now = Date.now();
  copy.id = makeMapId();
  copy.title = source.title.slice(0,95)+'のコピー';
  copy.createdAt = copy.updatedAt = now;
  copy.isFavorite = false;
  copy.deletedAt = null;
  const mapping = new Map(source.nodes.map(node=>[node.id,`node-${crypto.randomUUID()}`]));
  copy.nodes.forEach(node=>{
    if (['study','travel'].includes(node.id)) node.layoutKey = node.id;
    node.id = mapping.get(node.id);
    node.parentId = node.parentId === null ? null : mapping.get(node.parentId);
    node.createdAt = node.updatedAt = now;
  });
  maps.push(copy);
  activateMap(copy.id);
  closeDrawer();
  scheduleSave();
}

function toggleMapFavorite(id) {
  const map = maps.find(map=>map.id===id && map.deletedAt===null);
  if (!map) return false;
  map.isFavorite = !map.isFavorite;
  map.updatedAt = Date.now();
  renderMapList();
  scheduleSave();
  notify(map.isFavorite ? 'お気に入りに追加しました' : 'お気に入りを解除しました');
  return true;
}
function moveMapToTrash(id) {
  const map = maps.find(map=>map.id===id && map.deletedAt===null);
  if (!map) return false;
  cancelGestures();
  if (dirty) saveAppData();
  map.deletedAt = new Date().toISOString();
  map.updatedAt = Date.now();
  if (activeMapId === id) {
    let next = getOrderedActiveMaps()[0];
    if (!next) { next = newEmptyMap('新しいマップ'); maps.push(next); }
    activateMap(next.id);
  } else renderMapList();
  renderTrashList();
  scheduleSave();
  notify('マップをゴミ箱へ移動しました');
  return true;
}
function restoreMapFromTrash(id) {
  const map = maps.find(map=>map.id===id && map.deletedAt!==null);
  if (!map) return false;
  map.deletedAt = null;
  map.updatedAt = Date.now();
  renderMapList();
  renderTrashList();
  scheduleSave();
  notify('マップを復元しました');
  return true;
}
function permanentlyDeleteMap(id) {
  const index = maps.findIndex(map=>map.id===id && map.deletedAt!==null);
  if (index < 0) return false;
  maps.splice(index,1);
  renderMapList();
  renderTrashList();
  scheduleSave();
  notify('マップを完全に削除しました');
  return true;
}
function emptyTrash() {
  if (!getTrashedMaps().length) return false;
  maps = maps.filter(map=>map.deletedAt===null);
  renderMapList();
  renderTrashList();
  scheduleSave();
  notify('ゴミ箱を空にしました');
  return true;
}
function formatTrashDate(value) {
  try { return new Intl.DateTimeFormat('ja-JP',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)); }
  catch (error) { return '削除日時不明'; }
}
function renderTrashList() {
  const trashed = [...getTrashedMaps()].sort((a,b)=>Date.parse(b.deletedAt)-Date.parse(a.deletedAt));
  trashList.replaceChildren();
  if (!trashed.length) {
    const empty = document.createElement('p');
    empty.className = 'trash-empty';
    empty.textContent = 'ゴミ箱は空です';
    trashList.append(empty);
  }
  for (const map of trashed) {
    const row = document.createElement('div');
    row.className = 'trash-row';
    row.dataset.trashMapId = map.id;
    const info = document.createElement('div');
    info.className = 'trash-info';
    const title = document.createElement('strong');
    title.className = 'trash-title';
    title.textContent = map.title;
    const date = document.createElement('span');
    date.className = 'trash-date';
    date.textContent = `削除：${formatTrashDate(map.deletedAt)}`;
    info.append(title,date);
    const restore = document.createElement('button');
    restore.className = 'trash-action';
    restore.dataset.trashAction = 'restore';
    restore.textContent = '復元';
    const remove = document.createElement('button');
    remove.className = 'trash-action is-danger';
    remove.dataset.trashAction = 'permanent-delete';
    remove.textContent = '完全削除';
    row.append(info,restore,remove);
    trashList.append(row);
  }
  document.querySelector('[data-action="empty-trash"]').disabled = trashed.length===0;
  const badge = document.querySelector('#trash-count');
  badge.textContent = String(trashed.length);
  badge.hidden = trashed.length===0;
}
function openTrashView() {
  if (editor.open || deleteDialog.open || mapDialog.open || importDialog.open) return;
  closeDrawer();
  renderTrashList();
  trashView.hidden = false;
  document.querySelector('.app-shell').inert = true;
  trashView.querySelector('.trash-header [data-action="close-trash"]').focus();
}
function closeTrashView() {
  trashView.hidden = true;
  document.querySelector('.app-shell').inert = false;
}
mapForm.addEventListener('submit',event=>{
  event.preventDefault();
  if (!mapAction || event.isComposing) return;
  const {action,id} = mapAction, title = mapName.value.trim();
  if (['create','rename'].includes(action) && !title) { document.querySelector('#map-error').textContent='マップ名を入力してください。'; return; }
  cancelGestures();
  if (dirty) saveAppData();
  if (action === 'create') {
    const map = newEmptyMap(title);
    maps.push(map);
    activateMap(map.id);
  } else if (action === 'rename') {
    const map = maps.find(map=>map.id===id);
    map.title = title;
    map.updatedAt = Date.now();
    updateMapTitle();
    renderMapList();
  } else if (action === 'delete') moveMapToTrash(id);
  else if (action === 'permanent-delete') permanentlyDeleteMap(id);
  else if (action === 'empty-trash') emptyTrash();
  mapDialog.close();
  if (!['permanent-delete','empty-trash'].includes(action)) closeDrawer();
  else document.querySelector('.app-shell').inert = true;
  scheduleSave();
});
mapName.addEventListener('keydown',event=>{
  if (event.key === 'Enter' && (event.isComposing || event.keyCode===229)) event.preventDefault();
});
mapDialog.addEventListener('close',()=>{mapAction=null;});
document.querySelector('[data-action="cancel-map"]').addEventListener('click',()=>mapDialog.close());
document.querySelector('#new-map').addEventListener('click',()=>openMapDialog('create'));
mapMenu.addEventListener('click',event=>{
  const action = event.target.closest('[data-map-action]')?.dataset.mapAction;
  if (!action) return;
  mapMenu.hidden = true;
  if (action === 'duplicate') duplicateMap(menuMapId);
  else if (action === 'favorite') toggleMapFavorite(menuMapId);
  else openMapDialog(action,menuMapId);
});
document.querySelector('[data-action="trash"]').addEventListener('click',openTrashView);
document.querySelectorAll('[data-action="close-trash"]').forEach(button=>button.addEventListener('click',closeTrashView));
trashList.addEventListener('click',event=>{
  const action = event.target.closest('[data-trash-action]')?.dataset.trashAction;
  const id = event.target.closest('[data-trash-map-id]')?.dataset.trashMapId;
  if (action === 'restore') restoreMapFromTrash(id);
  else if (action === 'permanent-delete') openMapDialog('permanent-delete',id);
});
document.querySelector('[data-action="empty-trash"]').addEventListener('click',()=>{
  if (getTrashedMaps().length) openMapDialog('empty-trash');
});
document.addEventListener('click',event=>{
  if (!event.target.closest('#map-menu,.map-more')) mapMenu.hidden = true;
});

const backupMenu = document.querySelector('#backup-menu');
const backupFile = document.querySelector('#backup-file');
const backupButton = document.querySelector('[data-action="more"]');
const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
let pendingImportData = null;
let isExporting = false;
const exportIconCache = new Map();

function exportNodeRect(node) {
  const size = node.id === ROOT_ID ? EXPORT_ROOT_SIZE : EXPORT_NODE_SIZE;
  return { x:node.x, y:node.y, width:size.width, height:size.height,
    left:node.x-size.width/2, right:node.x+size.width/2,
    top:node.y-size.height/2, bottom:node.y+size.height/2,
    halfWidth:size.width/2, halfHeight:size.height/2 };
}

function getMapExportBounds(targetNodes = nodes,padding = EXPORT_PADDING) {
  if (!Array.isArray(targetNodes) || !targetNodes.length) throw Error('empty-map');
  const rects = targetNodes.map(exportNodeRect);
  const left = Math.min(...rects.map(rect=>rect.left))-padding;
  const right = Math.max(...rects.map(rect=>rect.right))+padding;
  const top = Math.min(...rects.map(rect=>rect.top))-padding;
  const bottom = Math.max(...rects.map(rect=>rect.bottom))+padding;
  return { left, right, top, bottom, width:right-left, height:bottom-top };
}

function exportRenderScale(bounds) {
  return Math.max(.1,Math.min(2,MAX_EXPORT_SIDE/bounds.width,MAX_EXPORT_SIDE/bounds.height,
    Math.sqrt(MAX_EXPORT_PIXELS/(bounds.width*bounds.height))));
}

function roundedRectPath(context,x,y,width,height,radius) {
  const r = Math.min(radius,width/2,height/2);
  context.beginPath();
  context.moveTo(x+r,y);
  context.arcTo(x+width,y,x+width,y+height,r);
  context.arcTo(x+width,y+height,x,y+height,r);
  context.arcTo(x,y+height,x,y,r);
  context.arcTo(x,y,x+width,y,r);
  context.closePath();
}

function fitCanvasText(context,text,maxWidth) {
  if (context.measureText(text).width <= maxWidth) return text;
  let value = text;
  while (value.length && context.measureText(`${value}…`).width > maxWidth) value = value.slice(0,-1);
  return value ? `${value}…` : '…';
}

function loadExportIcon(name) {
  if (!name) return Promise.resolve(null);
  if (exportIconCache.has(name)) return exportIconCache.get(name);
  const promise = new Promise(resolve=>{
    const symbol = document.querySelector(`#i-${name}`);
    if (!symbol) { resolve(null); return; }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${symbol.getAttribute('viewBox') || '0 0 24 24'}" fill="none" stroke="#536f94" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${symbol.innerHTML}</svg>`;
    const url = URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
    const image = new Image();
    image.onload = ()=>{ URL.revokeObjectURL(url); resolve(image); };
    image.onerror = ()=>{ URL.revokeObjectURL(url); resolve(null); };
    image.src = url;
  });
  exportIconCache.set(name,promise);
  return promise;
}

async function createMapCanvas(targetMap = getActiveMap()) {
  if (!targetMap || targetMap.deletedAt !== null || !Array.isArray(targetMap.nodes) || !targetMap.nodes.length) throw Error('no-active-map');
  if (document.fonts?.ready) await document.fonts.ready;
  const exportNodes = targetMap.nodes.map(node=>({...node}));
  const bounds = getMapExportBounds(exportNodes);
  const renderScale = exportRenderScale(bounds);
  const canvasElement = document.createElement('canvas');
  canvasElement.width = Math.max(1,Math.ceil(bounds.width*renderScale));
  canvasElement.height = Math.max(1,Math.ceil(bounds.height*renderScale));
  const context = canvasElement.getContext('2d');
  if (!context) throw Error('canvas-unavailable');
  context.fillStyle = '#ffffff';
  context.fillRect(0,0,canvasElement.width,canvasElement.height);
  context.scale(renderScale,renderScale);
  context.translate(-bounds.left,-bounds.top);

  const byId = new Map(exportNodes.map(node=>[node.id,node]));
  context.lineWidth = 2;
  context.lineCap = 'round';
  for (const node of exportNodes) {
    if (node.parentId === null) continue;
    const parentNode = byId.get(node.parentId);
    if (!parentNode) continue;
    const curve = connectionCurve(exportNodeRect(parentNode),exportNodeRect(node));
    context.beginPath();
    context.moveTo(curve.start.x,curve.start.y);
    context.bezierCurveTo(curve.control1.x,curve.control1.y,curve.control2.x,curve.control2.y,curve.end.x,curve.end.y);
    context.strokeStyle = themes[node.color]?.stroke || themes[DEFAULT_NODE_COLOR].stroke;
    context.stroke();
  }

  const icons = new Map(await Promise.all([...new Set(exportNodes.map(node=>node.icon).filter(Boolean))]
    .map(async name=>[name,await loadExportIcon(name)])));
  for (const node of exportNodes) {
    const rect = exportNodeRect(node), root = node.id === ROOT_ID;
    const colors = root
      ? { background:'#ffffff', border:'#5894ed', text:'#344b6c' }
      : exportTheme[node.color] || exportTheme[DEFAULT_NODE_COLOR];
    context.save();
    context.shadowColor = root ? '#548ce81f' : '#35445a0a';
    context.shadowBlur = root ? 14 : 8;
    context.shadowOffsetY = root ? 4 : 3;
    roundedRectPath(context,rect.left,rect.top,rect.width,rect.height,root ? 11 : 10);
    context.fillStyle = colors.background;
    context.fill();
    context.shadowColor = 'transparent';
    context.lineWidth = root ? 2 : 1;
    context.strokeStyle = colors.border;
    context.stroke();
    context.fillStyle = colors.text;
    context.font = `${root ? 650 : 600} ${root ? 17 : 15}px system-ui,-apple-system,"Segoe UI","Noto Sans JP",sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const image = node.icon ? icons.get(node.icon) : null;
    const iconSize = image ? 20 : 0, gap = image ? 9 : 0;
    const label = fitCanvasText(context,node.text,rect.width-20-iconSize-gap);
    const textWidth = context.measureText(label).width;
    const groupWidth = iconSize+gap+textWidth;
    const groupLeft = node.x-groupWidth/2;
    if (image) context.drawImage(image,groupLeft,node.y-iconSize/2,iconSize,iconSize);
    context.fillText(label,groupLeft+iconSize+gap+textWidth/2,node.y+.5);
    context.restore();
  }
  return { canvas:canvasElement, bounds, scale:renderScale };
}

function canvasToBlob(canvasElement,type,quality) {
  return new Promise((resolve,reject)=>canvasElement.toBlob(blob=>blob ? resolve(blob) : reject(Error('blob-failed')),type,quality));
}

function sanitizeFileName(value) {
  const safe = String(value || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'-').replace(/[. ]+$/g,'').trim();
  return (safe || 'mind-map').slice(0,60);
}

function exportFilename(map,extension,date = new Date()) {
  const pad = value=>String(value).padStart(2,'0');
  const day = `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
  return `simple-mind-map-${sanitizeFileName(map.title)}-${day}.${extension}`;
}

function downloadBlob(blob,filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),0);
}

function jpegPdfBlob(jpegBytes,imageWidth,imageHeight) {
  const landscape = imageWidth >= imageHeight;
  const pageWidth = landscape ? 841.89 : 595.28;
  const pageHeight = landscape ? 595.28 : 841.89;
  const margin = 36;
  const ratio = Math.min((pageWidth-margin*2)/imageWidth,(pageHeight-margin*2)/imageHeight);
  const drawWidth = imageWidth*ratio, drawHeight = imageHeight*ratio;
  const drawX = (pageWidth-drawWidth)/2, drawY = (pageHeight-drawHeight)/2;
  const encoder = new TextEncoder(), chunks = [], offsets = [0];
  let length = 0;
  const add = value=>{ const bytes = typeof value === 'string' ? encoder.encode(value) : value; chunks.push(bytes); length += bytes.length; };
  add(new Uint8Array([37,80,68,70,45,49,46,52,10,37,226,227,207,211,10]));
  const object = (number,body)=>{ offsets[number]=length; add(`${number} 0 obj\n${body}\nendobj\n`); };
  object(1,'<< /Type /Catalog /Pages 2 0 R >>');
  object(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(3,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  offsets[4]=length;
  add(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`);
  add(jpegBytes);
  add('\nendstream\nendobj\n');
  const content = `q\n${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ${drawX.toFixed(2)} ${drawY.toFixed(2)} cm\n/Im0 Do\nQ`;
  object(5,`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`);
  const xref = length;
  add(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1,6).map(offset=>`${String(offset).padStart(10,'0')} 00000 n `).join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks,{type:'application/pdf'});
}

function setExportingState(active) {
  isExporting = active;
  backupMenu.setAttribute('aria-busy',String(active));
  backupMenu.querySelectorAll('[data-export-action]').forEach(button=>button.disabled=active);
}

async function exportCurrentMap(format) {
  if (isExporting || !['png','pdf'].includes(format)) return false;
  const targetMap = getActiveMap();
  if (!targetMap || targetMap.deletedAt !== null) { notify('書き出せるマップがありません'); return false; }
  setExportingState(true);
  notify('書き出し中...');
  try {
    const result = await createMapCanvas(targetMap);
    if (format === 'png') {
      const blob = await canvasToBlob(result.canvas,'image/png');
      downloadBlob(blob,exportFilename(targetMap,'png'));
    } else {
      const jpeg = await canvasToBlob(result.canvas,'image/jpeg',.94);
      const blob = jpegPdfBlob(new Uint8Array(await jpeg.arrayBuffer()),result.canvas.width,result.canvas.height);
      downloadBlob(blob,exportFilename(targetMap,'pdf'));
    }
    notify(`${format.toUpperCase()}を書き出しました`);
    return true;
  } catch (error) {
    console.error(`Simple Mind Map: ${format} export failed`,error);
    notify(`${format.toUpperCase()}の書き出しに失敗しました。`);
    return false;
  } finally {
    setExportingState(false);
  }
}

function currentBackupData() {
  return validateAppData({ version:STORAGE_VERSION, maps:deepCopy(maps), activeMapId, updatedAt:Date.now() });
}
function backupFilename(date = new Date()) {
  const pad = value => String(value).padStart(2,'0');
  return `simple-mind-map-backup-${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.json`;
}
function exportBackup() {
  cancelGestures();
  if (dirty) saveAppData();
  try {
    const blob = new Blob([JSON.stringify(currentBackupData(),null,2)],{type:'application/json'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = backupFilename();
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),0);
    notify('バックアップを書き出しました');
  } catch (error) {
    console.error('Simple Mind Map: export failed',error);
    notify('バックアップを書き出せませんでした');
  }
}
function validateImportedBackup(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Number.isInteger(parsed.version)) throw Error('invalid');
  if (parsed.version > STORAGE_VERSION) throw Error('future-version');
  if (parsed.version === 1) return migrateV1ToV2(parsed);
  if (parsed.version === STORAGE_VERSION) return validateAppData(parsed);
  throw Error('unsupported-version');
}
function importErrorMessage(error) {
  if (error.message === 'future-version') return 'このバックアップは現在のアプリより新しいバージョンで作成されています。';
  if (error.message === 'file-too-large') return 'バックアップファイルが大きすぎます（上限10MB）。';
  return 'バックアップファイルを読み込めませんでした。現在のデータは変更されていません。';
}
async function prepareBackupImport(file) {
  if (!file) return;
  try {
    if (file.size > MAX_BACKUP_BYTES) throw Error('file-too-large');
    const parsed = JSON.parse(await file.text());
    pendingImportData = validateImportedBackup(parsed);
    document.querySelector('#import-description').textContent = `現在のマインドマップデータを、バックアップ内の${pendingImportData.maps.length}件のマップで置き換えます。現在のデータは失われる可能性があります。`;
    importDialog.showModal();
    document.querySelector('[data-action="cancel-import"]').focus();
  } catch (error) {
    console.error('Simple Mind Map: import validation failed',error);
    pendingImportData = null;
    backupFile.value = '';
    notify(importErrorMessage(error));
  }
}
function cancelBackupImport() {
  pendingImportData = null;
  backupFile.value = '';
  if (importDialog.open) importDialog.close();
}
function applyBackupImport() {
  if (!pendingImportData) return;
  cancelGestures();
  const previous = { maps, activeMapId, dirty };
  const imported = pendingImportData;
  pendingImportData = null;
  maps = deepCopy(imported.maps);
  activeMapId = imported.activeMapId;
  activateMap(activeMapId);
  dirty = true;
  setSaveStatus('pending');
  if (!saveAppData()) {
    maps = previous.maps;
    activeMapId = previous.activeMapId;
    activateMap(activeMapId);
    dirty = previous.dirty;
    setSaveStatus('error');
    notify('バックアップを保存できなかったため、現在のデータを維持しました');
  } else notify('バックアップを復元しました');
  backupFile.value = '';
  importDialog.close();
}
backupButton.setAttribute('aria-haspopup','menu');
backupButton.addEventListener('click',event=>{
  event.stopPropagation();
  mapMenu.hidden = true;
  backupMenu.hidden = !backupMenu.hidden;
  if (backupMenu.hidden) return;
  const rect = backupButton.getBoundingClientRect();
  backupMenu.style.left = `${Math.max(8,Math.min(rect.right-190,innerWidth-198))}px`;
  backupMenu.style.top = `${Math.max(8,Math.min(rect.bottom+4,innerHeight-286))}px`;
  backupMenu.querySelector('button').focus();
});
backupMenu.addEventListener('click',event=>{
  const backupAction = event.target.closest('[data-backup-action]')?.dataset.backupAction;
  const exportAction = event.target.closest('[data-export-action]')?.dataset.exportAction;
  if (!backupAction && !exportAction) return;
  if (isExporting) return;
  backupMenu.hidden = true;
  if (exportAction) exportCurrentMap(exportAction);
  else if (backupAction === 'export') exportBackup();
  else { backupFile.value=''; backupFile.click(); }
});
backupFile.addEventListener('change',()=>prepareBackupImport(backupFile.files[0]));
document.querySelector('[data-action="cancel-import"]').addEventListener('click',cancelBackupImport);
document.querySelector('[data-action="confirm-import"]').addEventListener('click',applyBackupImport);
importDialog.addEventListener('cancel',event=>{event.preventDefault();cancelBackupImport();});
document.addEventListener('click',event=>{
  if (!event.target.closest('#backup-menu,[data-action="more"]')) backupMenu.hidden = true;
});
const sidebar = document.querySelector('.sidebar');
const drawerOverlay = document.querySelector('#drawer-overlay');
const menuToggle = document.querySelector('[data-action="toggle-sidebar"]');
function closeDrawer() {
  sidebar.classList.remove('is-open');
  drawerOverlay.hidden = true;
  menuToggle.setAttribute('aria-expanded','false');
  document.querySelector('.workspace').inert = false;
  mapMenu.hidden = true;
  backupMenu.hidden = true;
}
menuToggle.setAttribute('aria-expanded','false');
menuToggle.addEventListener('click',()=>{
  if (!mobile.matches) { sidebar.querySelector('#new-map').focus(); return; }
  cancelGestures();
  closeColorPalette();
  backupMenu.hidden = true;
  mapMenu.hidden = true;
  sidebar.classList.add('is-open');
  drawerOverlay.hidden = false;
  menuToggle.setAttribute('aria-expanded','true');
  document.querySelector('.workspace').inert = true;
  sidebar.querySelector('#new-map').focus();
});
drawerOverlay.addEventListener('click',()=>{closeDrawer();menuToggle.focus();});
document.addEventListener('keydown',event=>{
  if (event.key === 'Escape' && !mapDialog.open && !editor.open && !deleteDialog.open && !importDialog.open) {
    if (!trashView.hidden) { closeTrashView(); document.querySelector('[data-action="trash"]').focus(); }
    else if (!backupMenu.hidden) backupMenu.hidden=true;
    else if (!mapMenu.hidden) mapMenu.hidden=true;
    else {closeDrawer();menuToggle.focus();}
  }
});
mobile.addEventListener('change',()=>{if (!mobile.matches) closeDrawer();});

let resizeFrame;
new ResizeObserver(()=>{
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(()=>{
    cancelGestures();
    layoutNodes();
  });
}).observe(stage);
// PWA registration is deliberately separate from map initialization. A failed
// registration never blocks the app, and file:// continues to work as before.
function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !['http:','https:'].includes(location.protocol)) return;
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('./service-worker.js')
      .catch(error=>console.warn('Simple Mind Map: Service Worker registration failed',error));
  },{once:true});
}
registerServiceWorker();

document.documentElement.dataset.appStage = 'pwa';
const restored = loadAppData();
maps = restored.maps;
activeMapId = restored.activeMapId;
activateMap(activeMapId);
updateHistoryButtons();
