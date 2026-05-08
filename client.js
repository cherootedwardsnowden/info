// vision-ai frontend
'use strict';

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

const dropZone = $('#dropZone');
const fileInput = $('#fileInput');
const pickBtn = $('#pickBtn');
const uploadCard = $('#uploadCard');
const analyzingCard = $('#analyzingCard');
const resultCard = $('#resultCard');
const scanImg = $('#scanImg');
const scanOverlay = $('#scanOverlay');
const stepsEl = $('#steps');
const progressBar = $('#progressBar');
const hudStatus = $('#hudStatus');
const hudStage = $('#hudStage');
const hudTime = $('#hudTime');
const statusEl = $('#status');
const statusText = $('#statusText');
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

const overlayCtx = overlay.getContext('2d');
const scanCtx = scanOverlay.getContext('2d');

// state
let currentResult = null;
let currentFrame = 0;
let playInterval = null;

// renk paleti (her sinif farkli renk)
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

// keypoint baglantilari (movenet 17 nokta)
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

// healthcheck
async function checkHealth() {
  try {
    const r = await fetch('/api/health');
    const j = await r.json();
    if (j.ready) {
      statusEl.classList.add('ready');
      statusText.textContent = 'modeller hazir';
    } else {
      statusText.textContent = 'modeller yukleniyor...';
      setTimeout(checkHealth, 2000);
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
  for (let i = 0; i < 60; i++) {
    particles.push({
      x: Math.random() * partsCanvas.width,
      y: Math.random() * partsCanvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 1.5 + 0.5,
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
  // baglanti cizgileri
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const dx = particles[i].x - particles[j].x;
      const dy = particles[i].y - particles[j].y;
      const d = Math.sqrt(dx*dx + dy*dy);
      if (d < 120) {
        pctx.beginPath();
        pctx.moveTo(particles[i].x, particles[i].y);
        pctx.lineTo(particles[j].x, particles[j].y);
        pctx.strokeStyle = 'rgba(0, 229, 255, ' + (0.08 * (1 - d/120)) + ')';
        pctx.lineWidth = 0.5;
        pctx.stroke();
      }
    }
  }
  requestAnimationFrame(tickParticles);
}
tickParticles();

// dosya secme
pickBtn.addEventListener('click', e => {
  e.stopPropagation();
  fileInput.click();
});
dropZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', e => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
});

['dragenter', 'dragover'].forEach(ev =>
  dropZone.addEventListener(ev, e => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('drag-over');
  })
);
['dragleave', 'drop'].forEach(ev =>
  dropZone.addEventListener(ev, e => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');
  })
);

dropZone.addEventListener('drop', e => {
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});

// pano yapistir
window.addEventListener('paste', e => {
  if (uploadCard.hidden) return;
  const items = e.clipboardData?.items || [];
  for (const it of items) {
    if (it.kind === 'file') {
      const f = it.getAsFile();
      if (f) handleFile(f);
      break;
    }
  }
});

// dosya yukleme + analiz
async function handleFile(file) {
  if (!file) return;
  const isMedia = file.type.startsWith('image/') || file.type.startsWith('video/');
  if (!isMedia) {
    alert('lutfen resim, gif veya video dosyasi secin');
    return;
  }
  if (file.size > 100 * 1024 * 1024) {
    alert('dosya 100mb dan buyuk olamaz');
    return;
  }

  // onizleme yukle
  const isVideo = file.type.startsWith('video/');
  const objUrl = URL.createObjectURL(file);

  // tarayici sahnesinde gostermek icin: gif/image kullan, video icin ilk kareyi al
  if (isVideo) {
    // video icin ilk kareyi bir img yerine canvasla cikartmak yerine sadece video etiketi gostermek istemiyoruz
    // basitlik icin scanner img'a video kullanmiyoruz, video poster gibi gosteriyoruz
    const v = document.createElement('video');
    v.src = objUrl;
    v.muted = true; v.playsInline = true;
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

  // upload card -> analyzing card
  uploadCard.hidden = true;
  analyzingCard.hidden = false;
  resultCard.hidden = true;

  // animasyon baslat
  startAnalyzeAnimation();

  // sunucuya gonder
  const fd = new FormData();
  fd.append('media', file);

  const startedAt = Date.now();

  try {
    setStep('upload', 'done');
    setStep('frames', 'active');
    hudStage.textContent = 'kareler';

    const res = await fetch('/api/analyze', { method: 'POST', body: fd });

    setStep('frames', 'done');
    setStep('detect', 'active');
    hudStage.textContent = 'tespit';

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'sunucu hatasi' }));
      throw new Error(err.error || 'analiz basarisiz');
    }

    const data = await res.json();

    setStep('detect', 'done');
    setStep('classify', 'active');
    hudStage.textContent = 'sahne';
    await sleep(150);

    setStep('classify', 'done');
    setStep('pose', 'active');
    hudStage.textContent = 'vucut';
    await sleep(150);

    setStep('pose', 'done');
    setStep('describe', 'active');
    hudStage.textContent = 'yazim';
    await sleep(150);

    setStep('describe', 'done');
    progressBar.style.width = '100%';

    const took = ((Date.now() - startedAt) / 1000).toFixed(1);
    hudTime.textContent = took + 's';
    await sleep(400);

    showResult(data);
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

let animTimer = null;
let animStart = 0;
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

// scanner overlay efekti
function drawScanFx() {
  const w = scanOverlay.offsetWidth;
  const h = scanOverlay.offsetHeight;
  if (!w || !h) return;
  scanOverlay.width = w;
  scanOverlay.height = h;
  scanCtx.clearRect(0, 0, w, h);

  // rastgele tarama kutucuklari
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
  scanCtx.clearRect(0, 0, scanOverlay.width, scanOverlay.height);
}

// sonuc goster
function showResult(data) {
  stopAnalyzeAnimation();
  hudStatus.textContent = 'tamamlandi';
  currentResult = data;
  currentFrame = 0;
  labelColorMap.clear();

  analyzingCard.hidden = true;
  resultCard.hidden = false;

  // meta
  const fc = data.frames.length;
  const mtype = data.mediaType === 'image' ? 'resim' : (data.mediaType === 'gif' ? 'gif' : 'video');
  resultMeta.textContent = mtype + ' &middot; ' + fc + ' kare analiz edildi';
  resultMeta.innerHTML = mtype + ' &middot; ' + fc + ' kare analiz edildi';

  // istatistikler
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

  // aciklama
  description.textContent = data.description;

  // frame controls
  if (fc > 1) {
    frameControls.hidden = false;
  } else {
    frameControls.hidden = true;
  }

  renderFrame(0);
}

function renderFrame(idx) {
  if (!currentResult) return;
  const frames = currentResult.frames;
  if (idx < 0) idx = frames.length - 1;
  if (idx >= frames.length) idx = 0;
  currentFrame = idx;
  const f = frames[idx];

  frameLabel.textContent = 'kare ' + (idx + 1) + '/' + frames.length;

  resultImg.onload = () => {
    drawOverlay(f);
    renderObjectsList(f);
    renderScenesList(f);
  };
  resultImg.src = f.frameImage;

  // resim cache'liyse onload tetiklenmeyebilir
  if (resultImg.complete && resultImg.naturalWidth > 0) {
    drawOverlay(f);
    renderObjectsList(f);
    renderScenesList(f);
  }
}

function drawOverlay(frame) {
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

  // bounding box ler
  for (const obj of frame.objects) {
    if (obj.score < 0.4) continue;
    const [x, y, w, h] = obj.bbox;
    const c = colorFor(obj.label);
    drawBox(overlayCtx, x*sx, y*sy, w*sx, h*sy, c, obj.labelTr, obj.score);
  }

  // pose keypointleri
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
  // koseli kutu
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.strokeRect(x, y, w, h);
  ctx.shadowBlur = 0;

  // koseler
  const cs = 14;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x, y + cs); ctx.lineTo(x, y); ctx.lineTo(x + cs, y);
  ctx.moveTo(x + w - cs, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + cs);
  ctx.moveTo(x, y + h - cs); ctx.lineTo(x, y + h); ctx.lineTo(x + cs, y + h);
  ctx.moveTo(x + w - cs, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - cs);
  ctx.stroke();

  // hafif dolgu
  ctx.fillStyle = color + '22';
  ctx.fillRect(x, y, w, h);

  // etiket
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
      + '<span class="name">' + obj.labelTr + '</span>'
      + '<span class="conf">' + Math.round(obj.score * 100) + '%</span>';
    row.addEventListener('mouseenter', () => highlightBox(obj, frame));
    row.addEventListener('mouseleave', () => drawOverlay(frame));
    objectsList.appendChild(row);
  }
}

function highlightBox(target, frame) {
  drawOverlay(frame);
  const dispW = resultImg.clientWidth;
  const natW = frame.width;
  const sx = dispW / natW;
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
    r.innerHTML = '<span class="name" style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + name + '</span>'
      + '<span class="bar"><span style="width:' + pct + '%"></span></span>'
      + '<span class="pct">' + pct + '%</span>';
    scenesList.appendChild(r);
  }
}

// frame kontrolleri
prevFrame.addEventListener('click', () => renderFrame(currentFrame - 1));
nextFrame.addEventListener('click', () => renderFrame(currentFrame + 1));
playFrames.addEventListener('click', () => {
  if (playInterval) {
    clearInterval(playInterval);
    playInterval = null;
    playFrames.textContent = '▶';
  } else {
    playFrames.textContent = '⏸';
    playInterval = setInterval(() => renderFrame(currentFrame + 1), 600);
  }
});

newBtn.addEventListener('click', resetAll);

function resetAll() {
  if (playInterval) { clearInterval(playInterval); playInterval = null; }
  playFrames.textContent = '▶';
  stopAnalyzeAnimation();
  currentResult = null;
  fileInput.value = '';
  uploadCard.hidden = false;
  analyzingCard.hidden = true;
  resultCard.hidden = true;
}

// resize
window.addEventListener('resize', () => {
  if (currentResult) {
    const f = currentResult.frames[currentFrame];
    if (f) drawOverlay(f);
  }
});
