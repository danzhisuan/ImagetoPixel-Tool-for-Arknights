// ============================================================
// 图片转 24×24 像素图
// 全部处理都在浏览器本地完成，不上传任何图片。
// ============================================================

const GRID = 24;
const CELL_COUNT = GRID * GRID;

const $ = (id) => document.getElementById(id);

const dropzone = $('dropzone');
const fileInput = $('fileInput');
const originalImg = $('originalImg');
const originalPlaceholder = $('originalPlaceholder');
const fitMode = $('fitMode');
const gridCanvas = $('gridCanvas');
const gridOverlay = $('gridOverlay');
const numberCanvas = $('numberCanvas');
const emptyState = $('emptyState');
const resultArea = $('resultArea');
const exportBtn = $('exportBtn');
const chatLog = $('chatLog');
const chatBox = $('chatBox');
const chatSend = $('chatSend');

const gridCtx = gridCanvas.getContext('2d');
const numCtx = numberCanvas.getContext('2d');

let currentImage = null;   // 当前加载的图片对象
let currentGrid = null;    // 24×24 格子的颜色信息
let currentCounts = [];    // 用到的颜色统计
let objectUrl = null;      // 待释放的临时图片地址

// ---------- 初始化：坐标、网格线 ----------

function init() {
  buildLabels();
  buildOverlay();

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });

  ['dragenter', 'dragover'].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    })
  );
  ['dragleave', 'drop'].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    })
  );
  dropzone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) loadFile(file);
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) loadFile(fileInput.files[0]);
  });

  fitMode.addEventListener('change', reprocess);
  document.addEventListener('paste', onPaste);

  exportBtn.addEventListener('click', exportPng);
  chatSend.addEventListener('click', onChatSend);

  document.querySelectorAll('.grid-box').forEach((box) => {
    const tip = box.querySelector('.tooltip');
    box.addEventListener('mousemove', (e) => onGridHover(e, box, tip));
    box.addEventListener('mouseleave', () => { tip.hidden = true; });
  });
}

function buildLabels() {
  document.querySelectorAll('.grid-wrap').forEach((wrap) => {
    const colLabels = wrap.querySelector('.col-labels');
    const rowLabels = wrap.querySelector('.row-labels');
    for (let i = 1; i <= GRID; i++) {
      const c = document.createElement('span');
      c.textContent = i;
      colLabels.appendChild(c);
      const r = document.createElement('span');
      r.textContent = i;
      rowLabels.appendChild(r);
    }
  });
}

function buildOverlay() {
  const NS = 'http://www.w3.org/2000/svg';
  const addLine = (x1, y1, x2, y2, major) => {
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('stroke', major ? 'rgba(0,0,0,0.30)' : 'rgba(0,0,0,0.13)');
    line.setAttribute('stroke-width', major ? 2 : 1);
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    gridOverlay.appendChild(line);
  };
  for (let i = 1; i < GRID; i++) {
    const major = i % 5 === 0;
    addLine(i, 0, i, GRID, major);
    addLine(0, i, GRID, i, major);
  }
}

// ---------- 图片加载与转换 ----------

function loadFile(file) {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    currentImage = img;
    originalImg.src = objectUrl;
    originalImg.hidden = false;
    originalPlaceholder.hidden = true;
    processImage();
    logChat('bot', '已生成 24×24 图纸 · 共 ' + currentCounts.length + ' 种颜色');
  };
  img.onerror = () => toast('无法读取这张图片，试试 PNG / JPG / WebP 格式');
  img.src = objectUrl;
}

function onPaste(e) {
  const data = e.clipboardData;
  if (!data) return;
  let file = null;
  if (data.items) {
    for (const item of data.items) {
      if (item.type && item.type.startsWith('image/')) {
        file = item.getAsFile();
        if (file) break;
      }
    }
  }
  if (!file && data.files && data.files.length) {
    file = data.files[0];
  }
  if (file && file.type && file.type.startsWith('image/')) {
    e.preventDefault();
    if (document.activeElement === chatBox) {
      chatBox.textContent = '图片已接收';
    }
    logChat('user', '已粘贴图片');
    loadFile(file);
    toast('已粘贴图片');
  }
}

function onChatSend() {
  if (chatBox.textContent.trim()) {
    logChat('bot', '请直接粘贴图片，我会自动生成 24×24 图纸');
  }
  chatBox.textContent = '';
  chatBox.focus();
  resultArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function logChat(role, text) {
  const msg = document.createElement('div');
  msg.className = 'chat-msg ' + role;
  msg.textContent = text;
  chatLog.appendChild(msg);
  chatLog.scrollTop = chatLog.scrollHeight;
  while (chatLog.children.length > 50) {
    chatLog.firstChild.remove();
  }
}

function reprocess() {
  if (currentImage) processImage();
}

function processImage() {
  const img = currentImage;
  const canvas = document.createElement('canvas');
  canvas.width = GRID;
  canvas.height = GRID;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  // 白底，避免透明像素变成黑色
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, GRID, GRID);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (fitMode.value === 'contain') {
    const scale = Math.min(GRID / img.naturalWidth, GRID / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    ctx.drawImage(img, (GRID - w) / 2, (GRID - h) / 2, w, h);
  } else {
    ctx.drawImage(img, 0, 0, GRID, GRID);
  }

  const data = ctx.getImageData(0, 0, GRID, GRID).data;
  const grid = [];
  for (let i = 0; i < CELL_COUNT; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    grid.push({ r, g, b, hex: rgbToHex(r, g, b) });
  }

  for (const cell of grid) {
    const match = nearestPalette(cell);
    cell.code = match.code;
    cell.name = match.name;
    cell.hex = match.hex;
    cell.r = match.r;
    cell.g = match.g;
    cell.b = match.b;
  }

  currentGrid = grid;
  renderAll();
}

function renderAll() {
  renderGrid();
  renderNumberGrid();
  currentCounts = computeCounts();
}

function renderGrid() {
  const imageData = gridCtx.createImageData(GRID, GRID);
  currentGrid.forEach((cell, i) => {
    imageData.data[i * 4] = cell.r;
    imageData.data[i * 4 + 1] = cell.g;
    imageData.data[i * 4 + 2] = cell.b;
    imageData.data[i * 4 + 3] = 255;
  });
  gridCtx.putImageData(imageData, 0, 0);

  emptyState.hidden = true;
  resultArea.hidden = false;
  exportBtn.disabled = false;
}

function renderNumberGrid() {
  const cell = 40;
  numCtx.clearRect(0, 0, numberCanvas.width, numberCanvas.height);
  numCtx.textAlign = 'center';
  numCtx.textBaseline = 'middle';
  numCtx.font = 'bold 20px sans-serif';

  currentGrid.forEach((c, i) => {
    const x = (i % GRID) * cell;
    const y = Math.floor(i / GRID) * cell;
    numCtx.fillStyle = c.hex;
    numCtx.fillRect(x, y, cell, cell);
    const lum = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
    numCtx.fillStyle = lum > 150 ? '#1f1f1f' : '#ffffff';
    numCtx.fillText(c.code, x + cell / 2, y + cell / 2 + 1);
  });

  numCtx.strokeStyle = 'rgba(0,0,0,0.25)';
  numCtx.lineWidth = 1;
  for (let i = 1; i < GRID; i++) {
    const major = i % 5 === 0;
    numCtx.lineWidth = major ? 2 : 1;
    numCtx.beginPath();
    numCtx.moveTo(i * cell, 0);
    numCtx.lineTo(i * cell, GRID * cell);
    numCtx.stroke();
    numCtx.beginPath();
    numCtx.moveTo(0, i * cell);
    numCtx.lineTo(GRID * cell, i * cell);
    numCtx.stroke();
  }
}

function computeCounts() {
  const counts = new Map();
  for (const cell of currentGrid) {
    counts.set(cell.code, (counts.get(cell.code) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

// ---------- 色卡匹配 ----------

function nearestPalette({ r, g, b }) {
  let best = null;
  let bestDist = Infinity;
  for (const color of PALETTE) {
    const pr = parseInt(color.hex.slice(1, 3), 16);
    const pg = parseInt(color.hex.slice(3, 5), 16);
    const pb = parseInt(color.hex.slice(5, 7), 16);
    const dist = colorDistance(r, g, b, pr, pg, pb);
    if (dist < bestDist) {
      bestDist = dist;
      best = { ...color, r: pr, g: pg, b: pb };
    }
  }
  return best;
}

// 红均值加权距离，比普通 RGB 距离更接近人眼感受
function colorDistance(r1, g1, b1, r2, g2, b2) {
  const rMean = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return (
    (2 + rMean / 256) * dr * dr +
    4 * dg * dg +
    (2 + (255 - rMean) / 256) * db * db
  );
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

// ---------- 导出 ----------

function exportPng() {
  const cell = 40;
  const canvas = document.createElement('canvas');
  canvas.width = GRID * cell;
  canvas.height = GRID * cell * 2;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawExportGrid(ctx, 0, false);
  drawExportGrid(ctx, GRID * cell, true);

  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = '像素图纸-24x24.png';
  a.click();
  toast('图纸已导出');
}

function drawExportGrid(ctx, offsetY, withNumbers) {
  const cell = 40;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 20px sans-serif';

  currentGrid.forEach((c, i) => {
    const x = (i % GRID) * cell;
    const y = Math.floor(i / GRID) * cell + offsetY;
    ctx.fillStyle = c.hex;
    ctx.fillRect(x, y, cell, cell);
    if (withNumbers) {
      const lum = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
      ctx.fillStyle = lum > 150 ? '#1f1f1f' : '#ffffff';
      ctx.fillText(c.code, x + cell / 2, y + cell / 2 + 1);
    }
  });

  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  for (let i = 1; i < GRID; i++) {
    ctx.lineWidth = i % 5 === 0 ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(i * cell, offsetY);
    ctx.lineTo(i * cell, offsetY + GRID * cell);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, offsetY + i * cell);
    ctx.lineTo(GRID * cell, offsetY + i * cell);
    ctx.stroke();
  }
}

// ---------- 悬停查看格子 ----------

function onGridHover(e, box, tip) {
  if (!currentGrid) return;
  const rect = box.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const col = Math.min(GRID - 1, Math.max(0, Math.floor((x / rect.width) * GRID)));
  const row = Math.min(GRID - 1, Math.max(0, Math.floor((y / rect.height) * GRID)));
  const cell = currentGrid[row * GRID + col];
  tip.textContent = '第' + (row + 1) + '行 第' + (col + 1) + '列 · ' + cell.code + ' ' + cell.name;
  tip.style.left = x + 'px';
  tip.style.top = y + 'px';
  tip.hidden = false;
}

// ---------- 提示 ----------

function toast(message) {
  const el = document.querySelector('.toast');
  if (el) el.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

init();
