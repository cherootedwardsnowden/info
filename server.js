// vision-ai backend
// nesne tespit + sahne siniflandirma + vucut keypointleri
// resim, gif ve video destekler

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

ffmpeg.setFfmpegPath(ffmpegPath);

// ffprobe kurulum kontrolu (yoksa otomatik kurar)
let ffprobeReady = false;

function tryRequireFfprobe() {
  // require cache'i temizle ki yeni kurulan paket gorulebilsin
  Object.keys(require.cache).forEach(k => {
    if (k.indexOf('ffprobe-installer') !== -1) delete require.cache[k];
  });
  const mod = require('@ffprobe-installer/ffprobe');
  if (!mod || !mod.path) throw new Error('ffprobe path bulunamadi');
  if (!fs.existsSync(mod.path)) throw new Error('ffprobe binary yok: ' + mod.path);
  return mod.path;
}

function ensureFfprobe() {
  // 1) once mevcut kurulumu dene
  try {
    const p = tryRequireFfprobe();
    ffmpeg.setFfprobePath(p);
    console.log('[init] ffprobe hazir:', p);
    ffprobeReady = true;
    return;
  } catch (e) {
    console.log('[init] ffprobe paketi yok veya bozuk, kuruluyor...');
  }

  // 2) otomatik kurulum
  try {
    execSync('npm install @ffprobe-installer/ffprobe --no-save --no-audit --no-fund', {
      cwd: __dirname,
      stdio: 'inherit',
      timeout: 180000
    });
    const p = tryRequireFfprobe();
    ffmpeg.setFfprobePath(p);
    console.log('[init] ffprobe kuruldu:', p);
    ffprobeReady = true;
  } catch (err) {
    console.warn('[init] ffprobe kurulamadi, fallback frame extractor kullanilacak:', err.message);
    ffprobeReady = false;
  }
}

ensureFfprobe();

// modeller startup'ta yuklenir
const models = { coco: null, mobilenet: null, pose: null, nsfw: null, ready: false };
let tf, cocoSsd, mobilenetLib, poseDetection, nsfwjs;

async function loadModels() {
  console.log('[init] tensorflow-node baslatiliyor...');
  tf = require('@tensorflow/tfjs-node');
  cocoSsd = require('@tensorflow-models/coco-ssd');
  mobilenetLib = require('@tensorflow-models/mobilenet');
  poseDetection = require('@tensorflow-models/pose-detection');
  nsfwjs = require('nsfwjs');

  console.log('[init] coco-ssd model yukleniyor...');
  models.coco = await cocoSsd.load({ base: 'mobilenet_v2' });

  console.log('[init] mobilenet model yukleniyor...');
  models.mobilenet = await mobilenetLib.load({ version: 2, alpha: 1.0 });

  console.log('[init] pose detection model yukleniyor...');
  models.pose = await poseDetection.createDetector(
    poseDetection.SupportedModels.MoveNet,
    { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
  );

  console.log('[init] nsfw model yukleniyor...');
  try {
    models.nsfw = await nsfwjs.load('MobileNetV2');
  } catch (e) {
    console.warn('[init] mobilenetv2 yuklenmedi, default deneniyor:', e.message);
    models.nsfw = await nsfwjs.load();
  }

  models.ready = true;
  console.log('[init] tum modeller hazir (coco-ssd, mobilenet, movenet, nsfwjs)');
}

// turkce nesne sozlugu
const TR = {
  person: 'kisi', bicycle: 'bisiklet', car: 'araba', motorcycle: 'motosiklet',
  airplane: 'ucak', bus: 'otobus', train: 'tren', truck: 'kamyon',
  boat: 'tekne', 'traffic light': 'trafik isigi', 'fire hydrant': 'yangin muslugu',
  'stop sign': 'dur tabelasi', 'parking meter': 'parkmetre', bench: 'bank',
  bird: 'kus', cat: 'kedi', dog: 'kopek', horse: 'at', sheep: 'koyun',
  cow: 'inek', elephant: 'fil', bear: 'ayi', zebra: 'zebra', giraffe: 'zurafa',
  backpack: 'sirt cantasi', umbrella: 'semsiye', handbag: 'el cantasi',
  tie: 'kravat', suitcase: 'bavul', frisbee: 'frizbi', skis: 'kayak',
  snowboard: 'snowboard', 'sports ball': 'top', kite: 'ucurtma',
  'baseball bat': 'beyzbol sopasi', 'baseball glove': 'beyzbol eldiveni',
  skateboard: 'kaykay', surfboard: 'surf tahtasi', 'tennis racket': 'tenis raketi',
  bottle: 'sise', 'wine glass': 'sarap kadehi', cup: 'fincan',
  fork: 'catal', knife: 'bicak', spoon: 'kasik', bowl: 'kase',
  banana: 'muz', apple: 'elma', sandwich: 'sandvic', orange: 'portakal',
  broccoli: 'brokoli', carrot: 'havuc', 'hot dog': 'sosis',
  pizza: 'pizza', donut: 'donut', cake: 'pasta', chair: 'sandalye',
  couch: 'koltuk', 'potted plant': 'saksi bitkisi', bed: 'yatak',
  'dining table': 'yemek masasi', toilet: 'tuvalet', tv: 'televizyon',
  laptop: 'dizustu bilgisayar', mouse: 'fare', remote: 'kumanda',
  keyboard: 'klavye', 'cell phone': 'cep telefonu', microwave: 'mikrodalga',
  oven: 'firin', toaster: 'tost makinesi', sink: 'lavabo',
  refrigerator: 'buzdolabi', book: 'kitap', clock: 'saat', vase: 'vazo',
  scissors: 'makas', 'teddy bear': 'oyuncak ayi', 'hair drier': 'sac kurutma',
  toothbrush: 'dis fircasi'
};

// vucut keypoint isimleri turkce
const KP_TR = {
  nose: 'burun', left_eye: 'sol goz', right_eye: 'sag goz',
  left_ear: 'sol kulak', right_ear: 'sag kulak',
  left_shoulder: 'sol omuz', right_shoulder: 'sag omuz',
  left_elbow: 'sol dirsek', right_elbow: 'sag dirsek',
  left_wrist: 'sol bilek', right_wrist: 'sag bilek',
  left_hip: 'sol kalca', right_hip: 'sag kalca',
  left_knee: 'sol diz', right_knee: 'sag diz',
  left_ankle: 'sol ayak', right_ankle: 'sag ayak'
};

function trName(en) {
  return TR[en] || en;
}

// upload klasoru tmp altinda
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100mb
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    ready: models.ready,
    models: {
      coco: !!models.coco,
      mobilenet: !!models.mobilenet,
      pose: !!models.pose,
      nsfw: !!models.nsfw
    }
  });
});

// videodan/giften kareler cikar
async function extractFrames(inputPath, count = 6) {
  const outDir = path.join(os.tmpdir(), 'va-' + crypto.randomBytes(6).toString('hex'));
  fs.mkdirSync(outDir, { recursive: true });

  const collect = () => fs.readdirSync(outDir)
    .filter(f => /\.(png|jpg|jpeg)$/i.test(f))
    .sort()
    .map(f => path.join(outDir, f));

  // 1) ffprobe varsa: net dagitilmis kareler (screenshots metodu)
  if (ffprobeReady) {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .on('error', err => {
          console.error('[ffmpeg] screenshots hatasi:', err.message);
          reject(err);
        })
        .on('end', () => resolve({ frames: collect(), dir: outDir }))
        .screenshots({
          count,
          folder: outDir,
          filename: 'frame-%03i.png',
          size: '720x?'
        });
    });
  }

  // 2) ffprobe yoksa fallback: select filter ile esit araliklarla kare al
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        '-vf', "select='not(mod(n\\," + Math.max(1, Math.floor(15)) + "))',scale=720:-1",
        '-vsync', 'vfr',
        '-frames:v', String(count),
        '-q:v', '2'
      ])
      .output(path.join(outDir, 'frame-%03d.png'))
      .on('error', err => {
        console.error('[ffmpeg] fallback hatasi:', err.message);
        reject(err);
      })
      .on('end', () => resolve({ frames: collect(), dir: outDir }))
      .run();
  });
}

// tek bir kareyi/resmi analiz et
async function analyzeImage(buffer) {
  let tensor;
  try {
    tensor = tf.node.decodeImage(buffer, 3, undefined, false);
    if (tensor.shape.length === 4) {
      const sq = tensor.squeeze([0]);
      tensor.dispose();
      tensor = sq;
    }
    const [h, w] = tensor.shape;

    // coco-ssd: bounding boxlu nesne tespiti
    const cocoRaw = await models.coco.detect(tensor, 30, 0.3);

    // mobilenet: genel sahne siniflandirma
    const sceneRaw = await models.mobilenet.classify(tensor, 5);

    // movenet: vucut keypointleri (kisi varsa)
    let posesRaw = [];
    try {
      posesRaw = await models.pose.estimatePoses(tensor, { maxPoses: 1 });
    } catch (e) {
      posesRaw = [];
    }

    return {
      width: w,
      height: h,
      objects: cocoRaw.map(c => ({
        label: c.class,
        labelTr: trName(c.class),
        score: Number(c.score.toFixed(3)),
        bbox: c.bbox.map(n => Math.round(n))
      })),
      scene: sceneRaw.map(s => ({
        label: s.className,
        score: Number(s.probability.toFixed(3))
      })),
      poses: posesRaw.map(p => ({
        score: Number((p.score || 0).toFixed(3)),
        keypoints: (p.keypoints || []).map(k => ({
          name: k.name,
          nameTr: KP_TR[k.name] || k.name,
          x: Math.round(k.x),
          y: Math.round(k.y),
          score: Number((k.score || 0).toFixed(3))
        }))
      }))
    };
  } finally {
    if (tensor) {
      try { tensor.dispose(); } catch (e) {}
    }
  }
}

// nsfw siniflandirma (tek goruntu)
async function analyzeNsfwImage(buffer) {
  let tensor;
  try {
    tensor = tf.node.decodeImage(buffer, 3, undefined, false);
    if (tensor.shape.length === 4) {
      const sq = tensor.squeeze([0]);
      tensor.dispose();
      tensor = sq;
    }
    const preds = await models.nsfw.classify(tensor);
    const m = { drawing: 0, hentai: 0, neutral: 0, porn: 0, sexy: 0 };
    for (const p of preds) {
      const k = (p.className || '').toLowerCase();
      if (k in m) m[k] = p.probability;
    }
    return m;
  } finally {
    if (tensor) {
      try { tensor.dispose(); } catch (e) {}
    }
  }
}

// kategori sozlugu turkce
const NSFW_TR = {
  drawing: 'cizim/illustrasyon',
  hentai: 'hentai (anime acik)',
  neutral: 'notr/guvenli',
  porn: 'pornografik',
  sexy: 'mustehcen/cekici'
};

// nsfw karar mantiği
function buildNsfwSummary(perFrame) {
  const cats = ['drawing', 'hentai', 'neutral', 'porn', 'sexy'];
  const max = {}, avg = {};
  for (const c of cats) {
    let mx = 0, sm = 0;
    for (const f of perFrame) {
      const v = f[c] || 0;
      if (v > mx) mx = v;
      sm += v;
    }
    max[c] = mx;
    avg[c] = perFrame.length > 0 ? sm / perFrame.length : 0;
  }

  const explicit = max.porn + max.hentai;
  const sexy = max.sexy;
  const safe = max.neutral + max.drawing;

  let nsfwScore;
  // 1 - guvenli olasilik (her zaman 0..1 arasi)
  const safeFrame = Math.max(...perFrame.map(f => (f.neutral || 0) + (f.drawing || 0)));
  nsfwScore = Math.max(0, Math.min(1, 1 - safeFrame));

  let level, label, color, advice;
  if (max.porn >= 0.5 || max.hentai >= 0.6) {
    level = 'high';
    label = 'ACIK ICERIK / NSFW';
    color = '#f87171';
    advice = 'goruntude pornografik veya cok acik icerik yuksek olasilikla mevcut.';
  } else if (explicit >= 0.4 || sexy >= 0.7) {
    level = 'medium';
    label = 'RISKLI ICERIK';
    color = '#fb923c';
    advice = 'goruntude mustehcen/risk tasiyan icerik bulunuyor olabilir, dikkatli inceleyin.';
  } else if (sexy >= 0.35 || explicit >= 0.2) {
    level = 'low';
    label = 'HAFIF MUSTEHCEN';
    color = '#fbbf24';
    advice = 'goruntu tamamen masum olmayabilir, hafif duzeyde sakincali sinyaller var.';
  } else {
    level = 'safe';
    label = 'GUVENLI ICERIK';
    color = '#34d399';
    advice = 'goruntu guvenli olarak siniflandirildi, belirgin nsfw sinyali yok.';
  }

  // risk yuzdesi (kullanici icin temiz sunum)
  const riskPercent = Math.round(nsfwScore * 100);

  // en riskli kareyi bul
  let topFrameIdx = 0, topFrameScore = -1;
  for (let i = 0; i < perFrame.length; i++) {
    const f = perFrame[i];
    const s = (f.porn || 0) + (f.hentai || 0) + (f.sexy || 0) * 0.5;
    if (s > topFrameScore) { topFrameScore = s; topFrameIdx = i; }
  }

  // kategori dagilim aciklamasi
  const sortedMax = cats.map(c => ({ k: c, v: max[c] })).sort((a, b) => b.v - a.v);
  const top3 = sortedMax.slice(0, 3).map(x => NSFW_TR[x.k] + ' %' + Math.round(x.v * 100));

  return {
    nsfwScore,
    riskPercent,
    level,
    label,
    color,
    advice,
    explicit: Math.min(1, explicit),
    sexy,
    safe: Math.min(1, safe),
    categoriesMax: max,
    categoriesAvg: avg,
    topCategories: top3,
    topFrameIndex: topFrameIdx,
    frameCount: perFrame.length,
    summary: 'risk skoru %' + riskPercent + ' ' + label.toLowerCase() + '. ' + advice +
      ' bastaki kategoriler: ' + top3.join(', ') + '.'
  };
}

// ortam aciklamasi uret
function describeScene(allObjects, allScenesPerFrame, hasPose) {
  const counts = {};
  for (const obj of allObjects) {
    if (obj.score < 0.4) continue;
    counts[obj.labelTr] = (counts[obj.labelTr] || 0) + 1;
  }

  // her kare icindeki maks sayiyi al (ayni nesne tekrar sayilmasin)
  const maxCounts = {};
  for (const frameObjs of allScenesPerFrame.framesObjs || []) {
    const fc = {};
    for (const o of frameObjs) {
      if (o.score < 0.4) continue;
      fc[o.labelTr] = (fc[o.labelTr] || 0) + 1;
    }
    for (const [k, v] of Object.entries(fc)) {
      maxCounts[k] = Math.max(maxCounts[k] || 0, v);
    }
  }

  const items = Object.entries(maxCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([name, n]) => n > 1 ? `${n} adet ${name}` : `bir ${name}`);

  const sceneVotes = {};
  for (const sceneList of allScenesPerFrame.framesScenes || []) {
    for (const s of (sceneList || []).slice(0, 2)) {
      const key = s.label.split(',')[0].trim().toLowerCase();
      sceneVotes[key] = (sceneVotes[key] || 0) + s.score;
    }
  }
  const topScenes = Object.entries(sceneVotes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);

  let desc = '';
  if (items.length > 0) {
    desc += 'goruntude ' + items.join(', ') + ' tespit edildi. ';
  } else {
    desc += 'tanimli buyuk nesne tespit edilmedi. ';
  }
  if (topScenes.length > 0) {
    desc += 'genel ortam izlenimi: ' + topScenes.join(' / ') + '. ';
  }
  if (hasPose) {
    desc += 'goruntude insan figuru tespit edildi ve vucut iskelet noktalari isaretlendi.';
  }
  return desc.trim();
}

// ana analiz endpointi
app.post('/api/analyze', upload.single('media'), async (req, res) => {
  if (!models.ready) {
    return res.status(503).json({ error: 'modeller henuz yuklenmedi, biraz bekleyin' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'dosya yuklenmedi' });
  }

  const filePath = req.file.path;
  const mime = req.file.mimetype || '';
  const isVideo = mime.startsWith('video/');
  const isGif = mime === 'image/gif';
  const isImage = mime.startsWith('image/') && !isGif;

  const cleanups = [filePath];

  try {
    let frameResults = [];

    if (isImage) {
      console.log('[analyze] resim:', req.file.originalname, mime);
      const buf = fs.readFileSync(filePath);
      const analysis = await analyzeImage(buf);
      const dataUrl = 'data:' + mime + ';base64,' + buf.toString('base64');
      frameResults.push({
        frameIndex: 0,
        frameImage: dataUrl,
        ...analysis
      });
    } else if (isVideo || isGif) {
      console.log('[analyze]', isGif ? 'gif:' : 'video:', req.file.originalname, mime);
      const { frames, dir } = await extractFrames(filePath, 8);
      cleanups.push(dir);

      if (frames.length === 0) {
        return res.status(400).json({ error: 'video/giften kare cikarilamadi' });
      }

      for (let i = 0; i < frames.length; i++) {
        const buf = fs.readFileSync(frames[i]);
        const analysis = await analyzeImage(buf);
        const dataUrl = 'data:image/png;base64,' + buf.toString('base64');
        frameResults.push({
          frameIndex: i,
          frameImage: dataUrl,
          ...analysis
        });
      }
    } else {
      return res.status(400).json({ error: 'desteklenmeyen format: ' + mime });
    }

    const allObjects = frameResults.flatMap(f => f.objects);
    const framesObjs = frameResults.map(f => f.objects);
    const framesScenes = frameResults.map(f => f.scene);
    const hasPose = frameResults.some(f =>
      f.poses.length > 0 && f.poses[0].keypoints.some(k => k.score > 0.4)
    );
    const description = describeScene(allObjects, { framesObjs, framesScenes }, hasPose);

    const uniqueLabels = new Set(allObjects.filter(o => o.score >= 0.4).map(o => o.labelTr));

    res.json({
      mediaType: isImage ? 'image' : (isGif ? 'gif' : 'video'),
      mime,
      frames: frameResults,
      description,
      stats: {
        frameCount: frameResults.length,
        totalDetections: allObjects.filter(o => o.score >= 0.4).length,
        uniqueClasses: uniqueLabels.size,
        hasPerson: hasPose,
        topClasses: Array.from(uniqueLabels).slice(0, 20)
      }
    });
  } catch (err) {
    console.error('[analyze] hata:', err);
    res.status(500).json({ error: err.message || 'analiz hatasi' });
  } finally {
    for (const p of cleanups) {
      try {
        const st = fs.statSync(p);
        if (st.isDirectory()) fs.rmSync(p, { recursive: true, force: true });
        else fs.unlinkSync(p);
      } catch (e) {}
    }
  }
});

// nsfw analiz endpointi
app.post('/api/nsfw', upload.single('media'), async (req, res) => {
  if (!models.ready) {
    return res.status(503).json({ error: 'modeller henuz yuklenmedi, biraz bekleyin' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'dosya yuklenmedi' });
  }

  const filePath = req.file.path;
  const mime = req.file.mimetype || '';
  const isVideo = mime.startsWith('video/');
  const isGif = mime === 'image/gif';
  const isImage = mime.startsWith('image/') && !isGif;

  const cleanups = [filePath];

  try {
    let perFrame = [];

    if (isImage) {
      console.log('[nsfw] resim:', req.file.originalname, mime);
      const buf = fs.readFileSync(filePath);
      const m = await analyzeNsfwImage(buf);
      const dataUrl = 'data:' + mime + ';base64,' + buf.toString('base64');
      perFrame.push({ frameIndex: 0, frameImage: dataUrl, ...m });
    } else if (isVideo || isGif) {
      console.log('[nsfw]', isGif ? 'gif:' : 'video:', req.file.originalname, mime);
      const { frames, dir } = await extractFrames(filePath, 8);
      cleanups.push(dir);

      if (frames.length === 0) {
        return res.status(400).json({ error: 'video/giften kare cikarilamadi' });
      }

      for (let i = 0; i < frames.length; i++) {
        const buf = fs.readFileSync(frames[i]);
        const m = await analyzeNsfwImage(buf);
        const dataUrl = 'data:image/png;base64,' + buf.toString('base64');
        perFrame.push({ frameIndex: i, frameImage: dataUrl, ...m });
      }
    } else {
      return res.status(400).json({ error: 'desteklenmeyen format: ' + mime });
    }

    const summary = buildNsfwSummary(perFrame);

    res.json({
      mediaType: isImage ? 'image' : (isGif ? 'gif' : 'video'),
      mime,
      frames: perFrame.map(f => ({
        frameIndex: f.frameIndex,
        frameImage: f.frameImage,
        scores: {
          drawing: Number(f.drawing.toFixed(4)),
          hentai: Number(f.hentai.toFixed(4)),
          neutral: Number(f.neutral.toFixed(4)),
          porn: Number(f.porn.toFixed(4)),
          sexy: Number(f.sexy.toFixed(4))
        }
      })),
      summary
    });
  } catch (err) {
    console.error('[nsfw] hata:', err);
    res.status(500).json({ error: err.message || 'analiz hatasi' });
  } finally {
    for (const p of cleanups) {
      try {
        const st = fs.statSync(p);
        if (st.isDirectory()) fs.rmSync(p, { recursive: true, force: true });
        else fs.unlinkSync(p);
      } catch (e) {}
    }
  }
});

const PORT = process.env.PORT || 3000;

loadModels()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log('[server] dinleniyor: http://0.0.0.0:' + PORT);
    });
  })
  .catch(err => {
    console.error('[fatal] model yuklenemedi:', err);
    process.exit(1);
  });

process.on('unhandledRejection', err => {
  console.error('[unhandledRejection]', err);
});
