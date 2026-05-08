// vision-ai frontend
'use strict';

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

// global state
let currentView = 'objects'; // 'objects' | 'nsfw'
let selectedFile = null;
let currentResult = null;
let currentNsfw = null;
let currentFrame = 0;
let playInterval = null;
let animTimer = null;
let animStart = 0;

// elements
const statusEl = $('#status');
const statusText = $('#statusText');
const modelList = $('#modelList');
const navItems = $$('.nav-item');
const views = $$('.view');

// shared analyzing card
const analyzingCard = $('#analyzingCard');
const scanImg = $('#scanImg');
const scanOverlay = $('#scanOverlay');
const stepsEl = $('#steps');
const progressBar = $('#progressBar');
const hudStatus = $('#hudStatus');
const hudStage = $('#hudStage');
const hudTime = $('#hudTime');

// objects view
const dropZone = $('#dropZone');
const fileInput = $('#fileInput');
const pickBtn = $('#pickBtn');
const analyzeBtn = $('#analyzeBtn');
const filePreview = $('#filePreview');
const uploadCard = $('#uploadCard');
const resultCard = $('#resultCard');
const resultImg = $('#resultImg');
const overlay = $('#overlay');
const newBtn = $('#newBtn');
const description = $('#description');
const objectsList = $('#objectsList');
const scenesList = $('#scenesList');
const statsBox = $('#statsBox');
const resultMeta = $('#resultMeta');
const frameControls = $('#frameControls');
const frameLabel = $('#frameLabel');
const prevFrame = $('#prevFrame');
const nextFrame = $('#nextFrame');
const playFrames = $('#playFrames');

// nsfw view
const dropZoneNsfw = $('#dropZoneNsfw');
const fileInputNsfw = $('#fileInputNsfw');
const pickBtnNsfw = $('#pickBtnNsfw');
const analyzeBtnNsfw = $('#analyzeBtnNsfw');
const filePreviewNsfw = $('#filePreviewNsfw');
const uploadCardNsfw = $('#uploadCardNsfw');
const resultCardNsfw = $('#resultCardNsfw');
const gaugeArc = $('#gaugeArc');
const gaugeNum = $('#gaugeNum');
const gaugeLabel = $('#gaugeLabel');
const verdictPill = $('#verdictPill');
const verdictAdvice = $('#verdictAdvice');
const nsfwCategories = $('#nsfwCategories');
const nsfwImg = $('#nsfwImg');
const blurVeil = $('#blurVeil');
const revealBtn = $('#revealBtn');
const nsfwFramesCard = $('#nsfwFramesCard');
const nsfwFrames = $('#nsfwFrames');
const nsfwSummary = $('#nsfwSummary');
const nsfwMeta = $('#nsfwMeta');
const newBtnNsfw = $('#newBtnNsfw');

const overlayCtx = overlay.getContext('2d');
const scanCtx = scanOverlay.getContext('2d');

// renk paleti
const COLORS = [
  '#00e5ff', '#a855f7', '#22d3ee', '#34d399', '#fbbf24',
  '#f87171', '#60a5fa', '#f472b6', '#a3e635', '#fb923c',
  '#c084fc', '#2dd4bf', '#facc15', '#ef4444', '#3b82f6',
  '#ec4899', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4'
];
const labelColorMap = new Map();
function colorFor(label) {
  if (labelColorMap.has(label)) return labelColorMap.get(label);
  const c = COLORS[labelColorMap.size % COLORS.length];
  labelColorMap.set(label, c);
  return c;
}

// pose links
const POSE_LINKS = [
  ['left_shoulder', 'right_shoulder'],
  ['left_shoulder', 'left_elbow'], ['left_elbow', 'left_wrist'],
  ['right_shoulder', 'right_elbow'], ['right_elbow', 'right_wrist'],
  ['left_shoulder', 'left_hip'], ['right_shoulder', 'right_hip'],
  ['left_hip', 'right_hip'],
  ['left_hip', 'left_knee'], ['left_knee', 'left_ankle'],
  ['right_hip', 'right_knee'], ['right_knee', 'right_ankle'],
  ['nose', 'left_eye'], ['nose', 'right_eye'],
  ['left_eye', 'left_ear'], ['right_eye', 'right_ear']
];

const NSFW_TR = {
  drawing: 'cizim/illustrasyon',
  hentai: 'hentai (anime acik)',
  neutral: 'notr/guvenli',
  porn: 'pornografik',
  sexy: 'mustehcen/cekici'
};

// view switching
navItems.forEach(btn => {
  btn.addEventListener('click', () => {
    const v = btn.dataset.view;
    if (v === currentView) return;
    switchView(v);
  });
});

function switchView(v) {
  currentView = v;
  navItems.forEach(b => b.classList.toggle('active', b.dataset.view === v));
  views.forEach(view => view.hidden = view.dataset.view !== v);
  // analyzing kart her viewde gizlenir, viewe gore icerik gosterilir
  resetAll();
}

// healthcheck
async function checkHealth() {
  try {
    const r = await fetch('/api/health');
    const j = await r.json();
    if (j.ready) {
      statusEl.classList.add('ready');
      statusText.textContent = 'tum modeller hazir';
    } else {
      statusText.textContent = 'modeller yukleniyor...';
      setTimeout(checkHealth, 2000);
    }
    if (j.models) {
      modelList.innerHTML = '';
      const order = ['coco', 'mobilenet', 'pose', 'nsfw'];
      const labels = { coco: 'coco-ssd', mobilenet: 'mobilenet', pose: 'movenet', nsfw: 'nsfwjs' };
      for (const k of order) {
        const p = document.createElement('span');
        p.className = 'model-pill ' + (j.models[k] ? 'ok' : '');
        p.textContent = (j.models[k] ? '+ ' : '. ') + labels[k];
        modelList.appendChild(p);
      }
    }
  } catch (e) {
    statusText.textContent = 'sunucuya baglanilamiyor';
    setTimeout(checkHealth, 3000);
  }
}
checkHealth();

// arkaplan parcaciklari
const partsCanvas = $('#particles');
const pctx = partsCanvas.getContext('2d');
let particles = [];

function resizeParticles() {
  partsCanvas.width = window.innerWidth;
  partsCanvas.height = window.innerHeight;
}
resizeParticles();
window.addEventListener('resize', resizeParticles);

function initParticles() {
  particles = [];
  for (let i = 0; i < 50; i++) {
    particles.push({
      x: Math.random() * partsCanvas.width,
      y: Math.random() * partsCanvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 1.4 + 0.4,
      a: Math.random() * 0.5 + 0.1
    });
  }
}
initParticles();

function tickParticles() {
  pctx.clearRect(0, 0, partsCanvas.width, partsCanvas.height);
  for (const p of particles) {
    p.x += p.vx; p.y += p.vy;
    if (p.x < 0) p.x = partsCanvas.width;
    if (p.x > partsCanvas.width) p.x = 0;
    if (p.y < 0) p.y = partsCanvas.height;
    if (p.y > partsCanvas.height) p.y = 0;
    pctx.beginPath();
    pctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    pctx.fillStyle = 'rgba(0, 229, 255, ' + p.a + ')';
    pctx.fill();
  }
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const dx = particles[i].x - particles[j].x;
      const dy = particles[i].y - particles[j].y;
      const d = Math.sqrt(dx*dx + dy*dy);
      if (d < 110) {
        pctx.beginPath();
        pctx.moveTo(particles[i].x, particles[i].y);
        pctx.lineTo(particles[j].x, particles[j].y);
        pctx.strokeStyle = 'rgba(0, 229, 255, ' + (0.07 * (1 - d/110)) + ')';
        pctx.lineWidth = 0.5;
        pctx.stroke();
      }
    }
  }
  requestAnimationFrame(tickParticles);
}
tickParticles();

// dosya secme - objects view
pickBtn.addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => {
  if (e.target.files[0]) prepareFile(e.target.files[0], 'objects');
});
analyzeBtn.addEventListener('click', () => {
  if (selectedFile) runAnalysis(selectedFile, 'objects');
});

setupDragDrop(dropZone, 'objects');

// dosya secme - nsfw view
pickBtnNsfw.addEventListener('click', e => { e.stopPropagation(); fileInputNsfw.click(); });
dropZoneNsfw.addEventListener('click', () => fileInputNsfw.click());
fileInputNsfw.addEventListener('change', e => {
  if (e.target.files[0]) prepareFile(e.target.files[0], 'nsfw');
});
analyzeBtnNsfw.addEventListener('click', () => {
  if (selectedFile) runAnalysis(selectedFile, 'nsfw');
});

setupDragDrop(dropZoneNsfw, 'nsfw');

function setupDragDrop(zone, mode) {
  ['dragenter', 'dragover'].forEach(ev =>
    zone.addEventListener(ev, e => {
      e.preventDefault(); e.stopPropagation();
      zone.classList.add('drag-over');
    })
  );
  ['dragleave', 'drop'].forEach(ev =>
    zone.addEventListener(ev, e => {
      e.preventDefault(); e.stopPropagation();
      zone.classList.remove('drag-over');
    })
  );
  zone.addEventListener('drop', e => {
    if (e.dataTransfer.files[0]) prepareFile(e.dataTransfer.files[0], mode);
  });
}

// pano yapistir
window.addEventListener('paste', e => {
  // sadece upload card acikken
  const objActive = currentView === 'objects' && !uploadCard.hidden;
  const nsfwActive = currentView === 'nsfw' && !uploadCardNsfw.hidden;
  if (!objActive && !nsfwActive) return;
  const items = e.clipboardData?.items || [];
  for (const it of items) {
    if (it.kind === 'file') {
      const f = it.getAsFile();
      if (f) prepareFile(f, currentView);
      break;
    }
  }
});

// dosya hazirla (analiz baslatmadan onizleme goster)
function prepareFile(file, mode) {
  if (!file) return;
  if (!file.type.match(/^(image|video)/)) {
    alert('lutfen resim, gif veya video secin');
    return;
  }
  if (file.size > 100 * 1024 * 1024) {
    alert('dosya 100mb dan buyuk olamaz');
    return;
  }
  selectedFile = file;

  const targetPreview = mode === 'nsfw' ? filePreviewNsfw : filePreview;
  const targetBtn = mode === 'nsfw' ? analyzeBtnNsfw : analyzeBtn;

  const objUrl = URL.createObjectURL(file);
  const isVideo = file.type.startsWith('video/');
  const sizeKb = (file.size / 1024).toFixed(0);
  const sizeStr = sizeKb > 1024 ? (sizeKb / 1024).toFixed(1) + ' mb' : sizeKb + ' kb';

  let thumbHtml;
  if (isVideo) {
    thumbHtml = '<video src="' + objUrl + '" class="file-preview-thumb" muted playsinline></video>';
  } else {
    thumbHtml = '<img src="' + objUrl + '" class="file-preview-thumb">';
  }

  targetPreview.innerHTML = thumbHtml +
    '<div class="file-preview-info">' +
      '<div class="name">' + escapeHtml(file.name) + '</div>' +
      '<div class="meta">' + (file.type || 'bilinmeyen') + ' &middot; ' + sizeStr + '</div>' +
    '</div>' +
    '<button class="file-clear" id="fileClearBtn" title="kaldir">x</button>';

  targetPreview.hidden = false;
  targetBtn.hidden = false;

  const clearBtn = targetPreview.querySelector('#fileClearBtn');
  clearBtn.addEventListener('click', e => {
    e.stopPropagation();
    selectedFile = null;
    targetPreview.hidden = true;
    targetPreview.innerHTML = '';
    targetBtn.hidden = true;
    if (mode === 'nsfw') fileInputNsfw.value = '';
    else fileInput.value = '';
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// asil analiz
async function runAnalysis(file, mode) {
  // scanner img
  const isVideo = file.type.startsWith('video/');
  const objUrl = URL.createObjectURL(file);

  if (isVideo) {
    const v = document.createElement('video');
    v.src = objUrl; v.muted = true; v.playsInline = true;
    await new Promise(r => v.addEventListener('loadeddata', r, { once: true }));
    v.currentTime = Math.min(0.2, (v.duration || 1) * 0.1);
    await new Promise(r => v.addEventListener('seeked', r, { once: true }));
    const c = document.createElement('canvas');
    c.width = v.videoWidth || 640;
    c.height = v.videoHeight || 360;
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    scanImg.src = c.toDataURL('image/jpeg', 0.7);
  } else {
    scanImg.src = objUrl;
  }

  // ekrani gec
  uploadCard.hidden = true;
  uploadCardNsfw.hidden = true;
  resultCard.hidden = true;
  resultCardNsfw.hidden = true;
  analyzingCard.hidden = false;

  startAnalyzeAnimation();

  const fd = new FormData();
  fd.append('media', file);

  const endpoint = mode === 'nsfw' ? '/api/nsfw' : '/api/analyze';
  const startedAt = Date.now();

  try {
    setStep('upload', 'done');
    setStep('frames', 'active');
    hudStage.textContent = 'kareler';

    const res = await fetch(endpoint, { method: 'POST', body: fd });

    setStep('frames', 'done');
    setStep('detect', 'active');
    hudStage.textContent = mode === 'nsfw' ? 'nsfw' : 'tespit';

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'sunucu hatasi' }));
      throw new Error(err.error || 'analiz basarisiz');
    }

    const data = await res.json();

    setStep('detect', 'done');
    setStep('classify', 'active');
    hudStage.textContent = 'siniflandirma';
    await sleep(120);
    setStep('classify', 'done');
    setStep('pose', 'active');
    hudStage.textContent = mode === 'nsfw' ? 'kategori' : 'vucut';
    await sleep(120);
    setStep('pose', 'done');
    setStep('describe', 'active');
    hudStage.textContent = 'karar';
    await sleep(150);
    setStep('describe', 'done');
    progressBar.style.width = '100%';

    const took = ((Date.now() - startedAt) / 1000).toFixed(1);
    hudTime.textContent = took + 's';
    await sleep(350);

    if (mode === 'nsfw') showNsfwResult(data);
    else showObjectResult(data);
  } catch (err) {
    console.error(err);
    alert('hata: ' + err.message);
    resetAll();
  }
}

function setStep(name, state) {
  const li = stepsEl.querySelector('[data-step="' + name + '"]');
  if (!li) return;
  li.classList.remove('active', 'done');
  if (state) li.classList.add(state);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function startAnalyzeAnimation() {
  animStart = Date.now();
  progressBar.style.width = '5%';
  hudStatus.textContent = 'aktif';
  hudStage.textContent = 'baslatiliyor';
  $$('.steps li').forEach(li => li.classList.remove('active', 'done'));

  if (animTimer) clearInterval(animTimer);
  let pct = 5;
  animTimer = setInterval(() => {
    pct = Math.min(pct + Math.random() * 4, 95);
    progressBar.style.width = pct + '%';
    const elapsed = ((Date.now() - animStart) / 1000).toFixed(1);
    hudTime.textContent = elapsed + 's';
    drawScanFx();
  }, 200);
}

function drawScanFx() {
  const w = scanOverlay.offsetWidth;
  const h = scanOverlay.offsetHeight;
  if (!w || !h) return;
  scanOverlay.width = w;
  scanOverlay.height = h;
  scanCtx.clearRect(0, 0, w, h);

  const t = (Date.now() - animStart) / 1000;
  scanCtx.strokeStyle = 'rgba(0, 229, 255, 0.5)';
  scanCtx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    const x = (Math.sin(t + i) * 0.3 + 0.5) * w;
    const y = (Math.cos(t * 0.7 + i) * 0.3 + 0.5) * h;
    const sz = 30 + Math.sin(t + i) * 10;
    scanCtx.strokeRect(x - sz/2, y - sz/2, sz, sz);
  }
}

function stopAnalyzeAnimation() {
  if (animTimer) { clearInterval(animTimer); animTimer = null; }
  if (scanCtx && scanOverlay.width) scanCtx.clearRect(0, 0, scanOverlay.width, scanOverlay.height);
}

// ===== object result =====
function showObjectResult(data) {
  stopAnalyzeAnimation();
  hudStatus.textContent = 'tamamlandi';
  currentResult = data;
  currentFrame = 0;
  labelColorMap.clear();

  analyzingCard.hidden = true;
  resultCard.hidden = false;

  const fc = data.frames.length;
  const mtype = data.mediaType === 'image' ? 'resim' : (data.mediaType === 'gif' ? 'gif' : 'video');
  resultMeta.innerHTML = mtype + ' &middot; ' + fc + ' kare analiz edildi';

  statsBox.innerHTML = '';
  const stats = [
    { num: data.stats.totalDetections, lbl: 'tespit' },
    { num: data.stats.uniqueClasses, lbl: 'farkli sinif' },
    { num: data.stats.frameCount, lbl: 'kare' },
    { num: data.stats.hasPerson ? 'var' : 'yok', lbl: 'insan' }
  ];
  for (const s of stats) {
    const d = document.createElement('div');
    d.className = 'stat-box';
    d.innerHTML = '<div class="num">' + s.num + '</div><div class="lbl">' + s.lbl + '</div>';
    statsBox.appendChild(d);
  }

  description.textContent = data.description;

  frameControls.hidden = fc <= 1;
  renderObjectFrame(0);
}

function renderObjectFrame(idx) {
  if (!currentResult) return;
  const frames = currentResult.frames;
  if (idx < 0) idx = frames.length - 1;
  if (idx >= frames.length) idx = 0;
  currentFrame = idx;
  const f = frames[idx];

  frameLabel.textContent = 'kare ' + (idx + 1) + '/' + frames.length;

  resultImg.onload = () => {
    drawObjectOverlay(f);
    renderObjectsList(f);
    renderScenesList(f);
  };
  resultImg.src = f.frameImage;
  if (resultImg.complete && resultImg.naturalWidth > 0) {
    drawObjectOverlay(f);
    renderObjectsList(f);
    renderScenesList(f);
  }
}

function drawObjectOverlay(frame) {
  const dispW = resultImg.clientWidth;
  const dispH = resultImg.clientHeight;
  const natW = frame.width || resultImg.naturalWidth;
  const natH = frame.height || resultImg.naturalHeight;
  if (!dispW || !dispH || !natW || !natH) return;

  overlay.width = dispW;
  overlay.height = dispH;
  overlay.style.width = dispW + 'px';
  overlay.style.height = dispH + 'px';

  const sx = dispW / natW;
  const sy = dispH / natH;

  overlayCtx.clearRect(0, 0, dispW, dispH);

  for (const obj of frame.objects) {
    if (obj.score < 0.4) continue;
    const [x, y, w, h] = obj.bbox;
    const c = colorFor(obj.label);
    drawBox(overlayCtx, x*sx, y*sy, w*sx, h*sy, c, obj.labelTr, obj.score);
  }

  for (const pose of frame.poses) {
    if (pose.score < 0.2) continue;
    const kpMap = {};
    for (const k of pose.keypoints) kpMap[k.name] = k;

    overlayCtx.strokeStyle = '#a855f7';
    overlayCtx.lineWidth = 2;
    overlayCtx.shadowColor = '#a855f7';
    overlayCtx.shadowBlur = 8;
    for (const [a, b] of POSE_LINKS) {
      const ka = kpMap[a], kb = kpMap[b];
      if (!ka || !kb || ka.score < 0.3 || kb.score < 0.3) continue;
      overlayCtx.beginPath();
      overlayCtx.moveTo(ka.x * sx, ka.y * sy);
      overlayCtx.lineTo(kb.x * sx, kb.y * sy);
      overlayCtx.stroke();
    }
    overlayCtx.shadowBlur = 0;

    for (const k of pose.keypoints) {
      if (k.score < 0.3) continue;
      overlayCtx.beginPath();
      overlayCtx.arc(k.x * sx, k.y * sy, 4, 0, Math.PI * 2);
      overlayCtx.fillStyle = '#a855f7';
      overlayCtx.fill();
      overlayCtx.strokeStyle = '#fff';
      overlayCtx.lineWidth = 1.5;
      overlayCtx.stroke();
    }
  }
}

function drawBox(ctx, x, y, w, h, color, label, score) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.strokeRect(x, y, w, h);
  ctx.shadowBlur = 0;

  const cs = 14;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x, y + cs); ctx.lineTo(x, y); ctx.lineTo(x + cs, y);
  ctx.moveTo(x + w - cs, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + cs);
  ctx.moveTo(x, y + h - cs); ctx.lineTo(x, y + h); ctx.lineTo(x + cs, y + h);
  ctx.moveTo(x + w - cs, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - cs);
  ctx.stroke();

  ctx.fillStyle = color + '22';
  ctx.fillRect(x, y, w, h);

  const text = label + ' ' + Math.round(score * 100) + '%';
  ctx.font = 'bold 13px -apple-system, sans-serif';
  const tw = ctx.measureText(text).width + 14;
  const th = 22;
  let ly = y - th;
  if (ly < 0) ly = y + 2;
  ctx.fillStyle = color;
  ctx.fillRect(x, ly, tw, th);
  ctx.fillStyle = '#000';
  ctx.fillText(text, x + 7, ly + 15);
}

function renderObjectsList(frame) {
  objectsList.innerHTML = '';
  const items = frame.objects.filter(o => o.score >= 0.3).sort((a, b) => b.score - a.score);
  if (items.length === 0) {
    objectsList.innerHTML = '<div class="muted small" style="padding:8px">bu karede tespit yok</div>';
    return;
  }
  for (const obj of items) {
    const row = document.createElement('div');
    row.className = 'obj-row';
    const c = colorFor(obj.label);
    row.innerHTML = '<span class="col" style="background:' + c + ';box-shadow:0 0 8px ' + c + '"></span>'
      + '<span class="name">' + escapeHtml(obj.labelTr) + '</span>'
      + '<span class="conf">' + Math.round(obj.score * 100) + '%</span>';
    row.addEventListener('mouseenter', () => highlightBox(obj, frame));
    row.addEventListener('mouseleave', () => drawObjectOverlay(frame));
    objectsList.appendChild(row);
  }
}

function highlightBox(target, frame) {
  drawObjectOverlay(frame);
  const dispW = resultImg.clientWidth;
  const sx = dispW / frame.width;
  const sy = resultImg.clientHeight / frame.height;
  const [x, y, w, h] = target.bbox;
  overlayCtx.save();
  overlayCtx.strokeStyle = '#fff';
  overlayCtx.lineWidth = 3;
  overlayCtx.shadowColor = colorFor(target.label);
  overlayCtx.shadowBlur = 20;
  overlayCtx.strokeRect(x * sx, y * sy, w * sx, h * sy);
  overlayCtx.restore();
}

function renderScenesList(frame) {
  scenesList.innerHTML = '';
  const top = frame.scene.slice(0, 5);
  for (const s of top) {
    const r = document.createElement('div');
    r.className = 'scene-row';
    const pct = Math.round(s.score * 100);
    const name = s.label.split(',')[0].trim();
    r.innerHTML = '<span class="name">' + escapeHtml(name) + '</span>'
      + '<span class="bar"><span style="width:' + pct + '%"></span></span>'
      + '<span class="pct">' + pct + '%</span>';
    scenesList.appendChild(r);
  }
}

prevFrame.addEventListener('click', () => renderObjectFrame(currentFrame - 1));
nextFrame.addEventListener('click', () => renderObjectFrame(currentFrame + 1));
playFrames.addEventListener('click', () => {
  if (playInterval) {
    clearInterval(playInterval);
    playInterval = null;
    playFrames.textContent = '▶';
  } else {
    playFrames.textContent = '⏸';
    playInterval = setInterval(() => renderObjectFrame(currentFrame + 1), 600);
  }
});

newBtn.addEventListener('click', resetAll);

// ===== nsfw result =====
function showNsfwResult(data) {
  stopAnalyzeAnimation();
  hudStatus.textContent = 'tamamlandi';
  currentNsfw = data;

  analyzingCard.hidden = true;
  resultCardNsfw.hidden = false;

  const s = data.summary;
  const fc = data.frames.length;
  const mtype = data.mediaType === 'image' ? 'resim' : (data.mediaType === 'gif' ? 'gif' : 'video');
  nsfwMeta.innerHTML = mtype + ' &middot; ' + fc + ' kare analiz edildi &middot; en riskli kare: #' + (s.topFrameIndex + 1);

  // gauge
  const circ = 2 * Math.PI * 92; // r=92, c~578
  const filled = Math.round(s.nsfwScore * circ);
  // animate from 0 to filled
  gaugeArc.setAttribute('stroke-dasharray', '0 ' + circ);
  setTimeout(() => {
    gaugeArc.setAttribute('stroke-dasharray', filled + ' ' + circ);
  }, 80);

  gaugeNum.textContent = s.riskPercent + '%';
  gaugeLabel.textContent = s.label.toLowerCase();

  // verdict pill
  verdictPill.className = 'verdict-pill ' + s.level;
  verdictPill.textContent = s.label;
  verdictAdvice.textContent = s.advice;

  // kategoriler (max degerleri)
  const cats = ['porn', 'hentai', 'sexy', 'drawing', 'neutral'];
  nsfwCategories.innerHTML = '';
  for (const k of cats) {
    const v = s.categoriesMax[k] || 0;
    const pct = Math.round(v * 100);
    const row = document.createElement('div');
    row.className = 'cat-row';
    row.innerHTML =
      '<span class="cat-name">' + NSFW_TR[k] + '</span>' +
      '<span class="cat-bar ' + k + '"><span style="width:' + pct + '%"></span></span>' +
      '<span class="cat-pct ' + k + '">' + pct + '%</span>';
    nsfwCategories.appendChild(row);
  }

  // en riskli kare onizlemesi
  const topFrame = data.frames[s.topFrameIndex];
  showNsfwFrame(topFrame, s.level);

  // kare seridi (video/gif)
  if (fc > 1) {
    nsfwFramesCard.hidden = false;
    nsfwFrames.innerHTML = '';
    data.frames.forEach((f, i) => {
      const sc = f.scores;
      const risk = (sc.porn + sc.hentai) + sc.sexy * 0.5;
      const lvl = risk >= 0.5 ? 'high' : risk >= 0.3 ? 'medium' : risk >= 0.15 ? 'low' : 'safe';
      const pct = Math.round(Math.min(1, risk) * 100);
      const div = document.createElement('div');
      div.className = 'frame-thumb' + (i === s.topFrameIndex ? ' selected' : '');
      div.innerHTML = '<img src="' + f.frameImage + '"><span class="badge ' + lvl + '">' + pct + '%</span>';
      div.addEventListener('click', () => {
        $$('.frame-thumb').forEach(t => t.classList.remove('selected'));
        div.classList.add('selected');
        showNsfwFrame(f, lvl === 'safe' ? 'safe' : lvl);
      });
      nsfwFrames.appendChild(div);
    });
  } else {
    nsfwFramesCard.hidden = true;
  }

  // karar metni
  nsfwSummary.textContent = s.summary;
}

function showNsfwFrame(frame, level) {
  nsfwImg.src = frame.frameImage;
  // yuksek riskte bulanikla
  if (level === 'high') {
    blurVeil.hidden = false;
  } else {
    blurVeil.hidden = true;
  }
}

revealBtn.addEventListener('click', () => {
  blurVeil.hidden = true;
});

newBtnNsfw.addEventListener('click', resetAll);

// ===== reset =====
function resetAll() {
  if (playInterval) { clearInterval(playInterval); playInterval = null; }
  playFrames.textContent = '▶';
  stopAnalyzeAnimation();
  selectedFile = null;
  currentResult = null;
  currentNsfw = null;
  fileInput.value = '';
  fileInputNsfw.value = '';
  filePreview.hidden = true;
  filePreview.innerHTML = '';
  filePreviewNsfw.hidden = true;
  filePreviewNsfw.innerHTML = '';
  analyzeBtn.hidden = true;
  analyzeBtnNsfw.hidden = true;
  analyzingCard.hidden = true;
  resultCard.hidden = true;
  resultCardNsfw.hidden = true;

  if (currentView === 'nsfw') {
    uploadCardNsfw.hidden = false;
    uploadCard.hidden = true;
  } else {
    uploadCard.hidden = false;
    uploadCardNsfw.hidden = true;
  }
}

// resize: object overlay yeniden ciz
window.addEventListener('resize', () => {
  if (currentResult) {
    const f = currentResult.frames[currentFrame];
    if (f) drawObjectOverlay(f);
  }
});

// ilk render
resetAll();
