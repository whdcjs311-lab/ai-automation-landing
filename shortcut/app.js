/* ============================================================
   숏컷 — shorts studio
   canvas renderer · caption engine · TTS · web export
   ============================================================ */
(() => {
'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const round1 = (v) => Math.round(v * 10) / 10;
const W = 1080, H = 1920;

/* ---------------- storage (sandbox-safe) ---------------- */
const memStore = new Map();
const store = {
  get(k) { return memStore.has(k) ? memStore.get(k) : null; },
  set(k, v) { memStore.set(k, v); }
};

/* ---------------- toast ---------------- */
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2400);
}

/* ---------------- constants ---------------- */
const SAMPLE_SCRIPT =
  '책상이 어지러우면 집중력부터 무너집니다. 3일만 버티면 습관이 됩니다. ' +
  '첫째, 책상 위에는 지금 쓰는 것만 남기세요. 둘째, 서랍에 넣을 것은 오늘 안 쓸 물건입니다. ' +
  '셋째, 충전기는 한 곳에만 두세요. 넷째, 자기 전 10분만 정리하세요. ' +
  '이 네 가지만 지켜도 아침이 달라집니다. 오늘부터 10분, 시작해 보세요.';

const HOOK_PRESETS = [
  '99%가 모르는 사실',
  '이거 모르면 3년 손해',
  '3초만 보세요',
  '저장해 두세요',
  '지금 바로 해보세요',
  '아무도 안 알려준 방법',
  '내가 30년 동안 산 세상이 전부 거짓말이었다',
  '여자친구 집에 인사하러 갔다가 소름 돋는 걸 봤다'
];

/* ---- 영화 요약(영화미슐랭 스타일) 프리셋 ---- */
const MOVIE_TITLE_PRESETS = [
  '30년 인생이 전부 거짓말이었던 남자',
  '입이 가벼우면 안 되는 이유',
  '마지막 10분에 뒤집히는 영화',
  '결말을 알고도 다시 보는 영화'
];

const MOVIE_SCRIPT =
  '내가 30년 동안 산 세상이, 전부 촬영장이었다.\n' +
  '어느 날, 하늘에서 조명이 떨어졌다.\n' +
  '가로등엔 시리우스라는 별 이름이 적혀 있었다.\n' +
  '죽은 아버지가, 배 위에서 다시 걸어왔다.\n' +
  '아내는 광고 문구를 읊었고, 이웃은 매일 같은 인사를 했다.\n' +
  '폭풍이 모든 걸 삼켰지만, 키를 놓지 않았다.\n' +
  '그때, 하늘에 구멍이 뚫렸다.\n' +
  '이건 쇼야. 목소리가 들려왔다.\n' +
  '전 세계가 내 인생을 보고 있었다.\n' +
  '마지막 문 앞에서 그는 말했다. 좋은 아침, 좋은 오후, 좋은 밤!\n' +
  '그리고 문을 열고 나갔다. 스스로 고른 세상으로.';

/* 강조색 프리셋 — 영화 요약 · 스릴러 무드 */
const MOOD_PRESETS = [
  { id: 'lime', name: '시네마 라임', color: '#d8ff3e', ink: '#101014' },
  { id: 'thriller', name: '스릴러 레드', color: '#ff4d4d', ink: '#ffffff' },
  { id: 'mystery', name: '미스터리 시안', color: '#4de1ff', ink: '#101014' },
  { id: 'amber', name: '필름 앰버', color: '#ffb03a', ink: '#101014' },
  { id: 'blood', name: '딥 블러드', color: '#c1121f', ink: '#ffffff' },
  { id: 'ice', name: '콜드 화이트', color: '#eef2f7', ink: '#101014' }
];

const LANGS = {
  ko: { label: '한국어', flag: '🇰🇷', tts: 'ko-KR' },
  ja: { label: '日本語', flag: '🇯🇵', tts: 'ja-JP' },
  en: { label: 'English', flag: '🇺🇸', tts: 'en-US' },
  es: { label: 'Español', flag: '🇪🇸', tts: 'es-ES' }
};

const TEMPLATES = [
  { id: 'movie', name: '영화 요약', d: { font: 'Black Han Sans', size: 78, pos: 'bottom', anim: 'pop', hookStyle: 'box', capBox: true, stroke: true, align: 'center', accent: '#d8ff3e', showTitle: true, emph: 'last' } },
  { id: 'news', name: '속보형', d: { font: 'Black Han Sans', size: 64, pos: 'bottom', anim: 'pop', hookStyle: 'box', capBox: true, stroke: false, align: 'center', accent: '#d8ff3e' } },
  { id: 'karaoke', name: '카라오케', d: { font: 'Black Han Sans', size: 78, pos: 'center', anim: 'karaoke', hookStyle: 'plain', capBox: false, stroke: true, align: 'center', accent: '#d8ff3e' } },
  { id: 'pen', name: '형광펜', d: { font: 'Pretendard', size: 60, pos: 'bottom', anim: 'karaoke', hookStyle: 'underline', capBox: false, stroke: false, align: 'left', accent: '#ffd43b' } },
  { id: 'minimal', name: '미니멀', d: { font: 'Pretendard', size: 48, pos: 'bottom', anim: 'fade', hookStyle: 'plain', capBox: false, stroke: false, align: 'left', accent: '#d8ff3e' } },
  { id: 'meme', name: '밈 클래식', d: { font: 'Black Han Sans', size: 66, pos: 'top', anim: 'none', hookStyle: 'box', capBox: false, stroke: true, align: 'center', accent: '#ffffff' } },
  { id: 'pop', name: '팝 블록', d: { font: 'Do Hyeon', size: 70, pos: 'center', anim: 'pop', hookStyle: 'box', capBox: true, stroke: false, align: 'center', accent: '#ff6b4a' } }
];

const PRESETS = {
  night: { name: '네온 나이트', from: '#141a3f', to: '#07070c', mid: '#3a1660', glow: ['#4f6bff', '#c44bff'] },
  sunset: { name: '선셋', from: '#ff7a3d', to: '#2a0812', mid: '#c81e5b', glow: ['#ffb35c', '#ff3d6d'] },
  mint: { name: '민트', from: '#0f4a46', to: '#040d0d', mid: '#12706a', glow: ['#5ff0d0', '#1fa79b'] },
  mono: { name: '그래파이트', from: '#2b2b33', to: '#050506', mid: '#17171c', glow: ['#6b6b78', '#2e2e36'] },
  crimson: { name: '크림슨', from: '#4a0d16', to: '#0b0204', mid: '#8a1224', glow: ['#ff3d5a', '#8a1230'] },
  ocean: { name: '딥 오션', from: '#06314f', to: '#02070d', mid: '#0b5f7a', glow: ['#2fd0ff', '#137a9c'] }
};

const STOPWORDS = new Set(['그리고','하지만','그래서','이거','저거','것은','것을','있습니다','합니다','입니다','진짜','정말','너무','우리','여러분','때문에','하는','있는','되는','이런','그런','저런']);

/* ---------------- state ---------------- */
const state = {
  step: 'source',
  name: '오늘의 쇼츠 01',
  lang: 'ko',
  script: SAMPLE_SCRIPT,
  hook: '99%가 모르는 정리 습관',
  title: '',
  captions: [],
  selected: 0,
  design: {
    template: 'news',
    font: 'Black Han Sans',
    size: 64,
    textColor: '#ffffff',
    accent: '#d8ff3e',
    boxColor: '#0b0b0e',
    pos: 'bottom',
    align: 'center',
    anim: 'pop',
    hookStyle: 'box',
    capBox: true,
    stroke: false,
    progressBar: true,
    showHook: true,
    showTitle: false,
    emph: 'none',
    watermark: '@my_channel'
  },
  bg: {
    mode: 'preset', preset: 'night', dim: 28, blur: 0, grain: true, vignette: true,
    mediaURL: null, mediaType: null, el: null,
    images: [], ken: 10, kenURLs: []
  },
  audio: {
    voiceURI: '', rate: 1.05, follow: false,
    voiceURL: null, voiceName: '', voiceVol: 1,
    bgmURL: null, bgmName: '', bgmVol: 0.35, muted: false
  },
  langs: [{ code: 'ko', label: '한국어', flag: '🇰🇷', script: SAMPLE_SCRIPT, hook: '99%가 모르는 정리 습관', captions: [] }]
};

/* ---------------- dom refs ---------------- */
const els = {
  preview: $('#preview'),
  pctx: $('#preview').getContext('2d'),
  exportPreview: $('#exportPreview'),
  ectx: $('#exportPreview').getContext('2d'),
  playBtn: $('#playBtn'),
  scrubWrap: $('#scrubWrap'),
  scrubFill: $('#scrubFill'),
  scrubHead: $('#scrubHead'),
  timeNow: $('#timeNow'),
  timeTotal: $('#timeTotal'),
  capList: $('#capList'),
  timeline: $('#timelineTrack'),
  stageCount: $('#stageCount'),
  panelTitle: $('#panelTitle'),
  panelEyebrow: $('#panelEyebrow'),
  panelDesc: $('#panelDesc'),
  scriptInput: $('#scriptInput'),
  hookInput: $('#hookInput'),
  langScript: $('#langScript'),
  specDuration: $('#specDuration')
};

/* ============================================================
   CAPTION ENGINE
   ============================================================ */
function splitScript(text, maxChars = 16) {
  const clean = String(text || '').replace(/\r/g, '').replace(/\u00a0/g, ' ').trim();
  if (!clean) return [];

  const rawParts = [];
  clean.split(/\n+/).forEach((para) => {
    const sentences = para.split(/(?<=[.!?…])\s+|(?<=다\.)\s+|(?<=요\.)\s+|(?<=죠\.)\s+/g);
    sentences.forEach((s) => { if (s && s.trim()) rawParts.push(s.trim()); });
  });

  const chunks = [];
  rawParts.forEach((sentence) => {
    if (sentence.length <= maxChars) { chunks.push(sentence); return; }
    const words = sentence.split(/\s+/);
    let line = '';
    words.forEach((word) => {
      if (!line) {
        if (word.length <= maxChars) { line = word; return; }
        // very long word: hard split
        for (let i = 0; i < word.length; i += maxChars) {
          const piece = word.slice(i, i + maxChars);
          if (piece.length === maxChars) chunks.push(piece);
          else line = piece;
        }
        return;
      }
      if ((line + ' ' + word).length <= maxChars) { line += ' ' + word; return; }
      chunks.push(line);
      if (word.length <= maxChars) line = word;
      else {
        for (let i = 0; i < word.length; i += maxChars) {
          const piece = word.slice(i, i + maxChars);
          if (piece.length === maxChars) chunks.push(piece);
          else line = piece;
        }
      }
    });
    if (line) chunks.push(line);
  });

  return chunks
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((text) => ({ text, dur: round1(clamp(text.length * 0.135, 1.0, 3.6)) }));
}

function totalDuration() {
  return state.captions.reduce((sum, c) => sum + (Number(c.dur) || 0), 0);
}

function captionStart(index) {
  let sum = 0;
  for (let i = 0; i < index; i++) sum += Number(state.captions[i].dur) || 0;
  return sum;
}

function activeCaptionIndex(t) {
  let acc = 0;
  for (let i = 0; i < state.captions.length; i++) {
    acc += Number(state.captions[i].dur) || 0;
    if (t < acc) return i;
  }
  return Math.max(0, state.captions.length - 1);
}

/* ============================================================
   CANVAS RENDER
   ============================================================ */
let noiseCanvas = null;
function getNoise() {
  if (noiseCanvas) return noiseCanvas;
  noiseCanvas = document.createElement('canvas');
  noiseCanvas.width = 280; noiseCanvas.height = 280;
  const nctx = noiseCanvas.getContext('2d');
  const img = nctx.createImageData(280, 280);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v;
    img.data[i + 3] = 16 + Math.random() * 26;
  }
  nctx.putImageData(img, 0, 0);
  noiseCanvas.pattern = null;
  return noiseCanvas;
}

function paintPreset(ctx, key, t) {
  const p = PRESETS[key] || PRESETS.night;
  const g = ctx.createLinearGradient(0, 0, W * 0.7, H);
  g.addColorStop(0, p.from);
  g.addColorStop(0.55, p.mid);
  g.addColorStop(1, p.to);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const gx = W * (0.32 + 0.03 * Math.sin(t * 0.25));
  const gy = H * (0.3 + 0.02 * Math.cos(t * 0.2));
  const rg = ctx.createRadialGradient(gx, gy, 0, gx, gy, W * 0.8);
  rg.addColorStop(0, hexA(p.glow[0], 0.55));
  rg.addColorStop(0.45, hexA(p.glow[0], 0.12));
  rg.addColorStop(1, 'transparent');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, W, H);

  const rg2 = ctx.createRadialGradient(W * 0.85, H * 0.72, 0, W * 0.85, H * 0.72, W * 0.7);
  rg2.addColorStop(0, hexA(p.glow[1], 0.42));
  rg2.addColorStop(1, 'transparent');
  ctx.fillStyle = rg2;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // graphic rings
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,.07)';
  ctx.lineWidth = 2;
  const cx = W * 0.7, cy = H * 0.42;
  [240, 380, 520].forEach((r, i) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(-50, H * 0.68);
  ctx.lineTo(W + 50, H * 0.55);
  ctx.stroke();
  ctx.restore();
}

function hexA(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function drawCover(ctx, el) {
  const ew = el.videoWidth || el.naturalWidth || el.width;
  const eh = el.videoHeight || el.naturalHeight || el.height;
  if (!ew || !eh) return false;
  const scale = Math.max(W / ew, H / eh);
  const dw = ew * scale, dh = eh * scale;
  ctx.drawImage(el, (W - dw) / 2, (H - dh) / 2, dw, dh);
  return true;
}

/* 켄번즈: 컷 안에서 천천히 밀고 당기는 줌 + 좌우 드리프트 */
function drawKen(ctx, el, progress, dir) {
  const ew = el.videoWidth || el.naturalWidth || el.width;
  const eh = el.videoHeight || el.naturalHeight || el.height;
  if (!ew || !eh) return false;
  const k = clamp(progress, 0, 1);
  const amount = clamp(Number(state.bg.ken) || 0, 0, 20) / 100;
  const scale = Math.max(W / ew, H / eh) * (1 + amount * k);
  const dw = ew * scale, dh = eh * scale;
  const driftX = dir * W * 0.012 * (k - 0.5);
  const driftY = -H * 0.010 * (k - 0.5);
  ctx.drawImage(el, (W - dw) / 2 + driftX, (H - dh) / 2 + driftY, dw, dh);
  return true;
}

/* 이미지 컷이 바뀌는 시간 = 자막 N등분 경계 */
function slideSegments(count) {
  const total = Math.max(0.1, totalDuration());
  const n = Math.max(1, count || 1);
  const capN = state.captions.length;
  const bounds = [0];
  for (let i = 1; i < n; i++) {
    if (capN >= n) {
      const at = Math.floor((capN * i) / n);
      bounds.push(captionStart(clamp(at, 0, capN - 1)));
    } else {
      bounds.push((total * i) / n);
    }
  }
  return bounds.map((s, i) => ({ start: s, end: i === n - 1 ? total : bounds[i + 1] }));
}

function paintSlides(ctx, bg, t) {
  const imgs = bg.images || [];
  if (!imgs.length) return false;
  const segs = slideSegments(imgs.length);
  let idx = 0;
  for (let i = 0; i < segs.length; i++) if (t >= segs[i].start) idx = i;
  const seg = segs[idx];
  const span = Math.max(0.001, seg.end - seg.start);
  const p = clamp((t - seg.start) / span, 0, 1);
  const fade = Math.min(0.45, span * 0.35);
  if (idx > 0 && t - seg.start < fade) {
    const prev = imgs[(idx - 1) % imgs.length];
    if (prev && prev.el) drawKen(ctx, prev.el, 1, (idx - 1) % 2 === 0 ? 1 : -1);
  }
  const alpha = idx > 0 ? clamp((t - seg.start) / fade, 0, 1) : 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  drawKen(ctx, imgs[idx].el, p, idx % 2 === 0 ? 1 : -1);
  ctx.restore();
  return true;
}

function paintBackground(ctx, bg, t) {
  if (bg.mode === 'slides' && paintSlides(ctx, bg, t)) return;
  let painted = false;
  if (bg.mode === 'media' && bg.el) {
    if (bg.mediaType === 'video') {
      if (bg.el.readyState >= 2) painted = drawCover(ctx, bg.el);
    } else {
      painted = drawCover(ctx, bg.el);
    }
  }
  if (!painted) {
    ctx.fillStyle = '#07070a';
    ctx.fillRect(0, 0, W, H);
    paintPreset(ctx, bg.preset, t);
  }
}

/* ---- caption layout cache ---- */
let layoutCache = { key: '', lines: [], widths: [] };

function wrapLines(text, font, maxWidth) {
  const key = font + '|' + maxWidth + '|' + text;
  if (layoutCache.key === key) return layoutCache;

  const ctx = els.pctx;
  ctx.save();
  ctx.font = font;
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';

  const pushChars = (line) => {
    const chars = [];
    let x = 0;
    for (const ch of line) {
      const w = ctx.measureText(ch).width;
      chars.push({ ch, x, w });
      x += w;
    }
    lines.push({ text: line, chars, width: x });
  };

  words.forEach((word) => {
    const candidate = current ? current + ' ' + word : word;
    if (ctx.measureText(candidate).width <= maxWidth) { current = candidate; return; }
    if (current) { pushChars(current); current = ''; }
    if (ctx.measureText(word).width <= maxWidth) { current = word; return; }
    // hard break a very long word
    let buf = '';
    for (const ch of word) {
      if (ctx.measureText(buf + ch).width > maxWidth && buf) { pushChars(buf); buf = ''; }
      buf += ch;
    }
    current = buf;
  });
  if (current) pushChars(current);
  ctx.restore();

  layoutCache = { key, lines };
  return layoutCache;
}

function captionFont(design, size) {
  const weight = design.font === 'Pretendard' ? 800 : 400;
  return `${weight} ${size}px "${design.font}", "Pretendard Variable", sans-serif`;
}

let lastActiveIdx = -1;

function drawScene(ctx, o) {
  const { design, bg, t, caption, total } = o;
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  // background
  ctx.save();
  if (bg.blur) ctx.filter = `blur(${bg.blur}px)`;
  paintBackground(ctx, bg, t);
  ctx.restore();

  // dim
  if (bg.dim) {
    ctx.fillStyle = `rgba(0,0,0,${(bg.dim / 100) * 0.88})`;
    ctx.fillRect(0, 0, W, H);
  }
  // vignette
  if (bg.vignette) {
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, H * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.62)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }
  // grain
  if (bg.grain) {
    const n = getNoise();
    if (!n.pattern) n.pattern = ctx.createPattern(n, 'repeat');
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = n.pattern;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // fixed top title (영화 요약 스타일)
  let titleBottom = 0;
  if (design.showTitle && o.title) titleBottom = drawTitle(ctx, o.title, design);

  // hook
  if (design.showHook && o.hook && t < 4.2) {
    const alpha = clamp((4.2 - t) / 0.5, 0, 1);
    drawHook(ctx, o.hook, design, alpha, titleBottom);
  }

  // caption
  const start = o.capStart;
  const dur = Math.max(0.2, o.capDur);
  const p = clamp((t - start) / dur, 0, 1);
  if (caption) drawCaption(ctx, caption, design, t, start, dur, p);

  // progress bar
  if (design.progressBar && total > 0.1) {
    const barY = H - 168, barX = 90, barW = W - 180;
    ctx.fillStyle = 'rgba(255,255,255,.17)';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, 7, 4);
    ctx.fill();
    ctx.fillStyle = design.accent;
    ctx.beginPath();
    ctx.roundRect(barX, barY, Math.max(6, barW * clamp(t / total, 0, 1)), 7, 4);
    ctx.fill();
  }

  // watermark
  if (design.watermark) {
    ctx.save();
    ctx.font = '600 28px "Pretendard Variable", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.62)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(design.watermark, W / 2, H - 232);
    ctx.restore();
  }

  ctx.restore();
}

function drawTitle(ctx, title, design) {
  const tag = '영화 요약';
  const tagFont = '800 26px "Pretendard Variable", "Pretendard", sans-serif';
  const size = 74;
  const font = `400 ${size}px "Black Han Sans", "Pretendard Variable", sans-serif`;
  const layout = wrapLines(String(title), font, 900);
  const lineH = size * 1.18;
  ctx.save();
  // 상단 스크림 — 밝은 컷에서도 타이틀이 읽히게
  const scrim = ctx.createLinearGradient(0, 0, 0, 620);
  scrim.addColorStop(0, 'rgba(0,0,0,.62)');
  scrim.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, W, 620);

  ctx.font = tagFont;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(tag).width + 46;
  const chipY = 176;
  ctx.fillStyle = design.accent;
  ctx.beginPath();
  ctx.roundRect((W - tw) / 2, chipY, tw, 50, 25);
  ctx.fill();
  ctx.fillStyle = '#101014';
  ctx.fillText(tag, W / 2, chipY + 25);

  let y = chipY + 50 + 26;
  ctx.font = font;
  layout.lines.forEach((line, i) => {
    const ly = y + lineH * (i + 0.5);
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(0,0,0,.78)';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeText(line.text, W / 2, ly);
    ctx.fillStyle = design.textColor;
    ctx.fillText(line.text, W / 2, ly);
  });
  ctx.restore();
  return y + lineH * layout.lines.length;
}

function drawHook(ctx, hook, design, alpha, offsetTop = 0) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const size = 40;
  const font = `800 ${size}px "Pretendard Variable", "Pretendard", sans-serif`;
  const layout = wrapLines(hook, font, 820);
  const lineH = size * 1.35;
  const blockH = layout.lines.length * lineH;
  const top = offsetTop ? offsetTop + 40 : 250;

  if (design.hookStyle === 'box') {
    const boxW = Math.min(900, Math.max(...layout.lines.map((l) => l.width)) + 76);
    const boxH = blockH + 34;
    const bx = (W - boxW) / 2;
    ctx.fillStyle = design.accent;
    ctx.beginPath();
    ctx.roundRect(bx, top - 12, boxW, boxH, 16);
    ctx.fill();
    ctx.fillStyle = design.accent === '#ffffff' ? '#101014' : '#101014';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    layout.lines.forEach((line, i) => {
      ctx.font = font;
      ctx.fillText(line.text, W / 2, top - 12 + 17 + lineH * (i + 0.5));
    });
    // small tag
    ctx.font = '700 20px "Pretendard Variable", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.textAlign = 'left';
    ctx.fillText('HOOK', bx, top - 34);
  } else {
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,.6)';
    ctx.shadowBlur = 24;
    layout.lines.forEach((line, i) => {
      ctx.fillStyle = design.textColor;
      ctx.fillText(line.text, W / 2, top + lineH * (i + 0.5));
    });
    ctx.shadowBlur = 0;
    if (design.hookStyle === 'underline') {
      const lw = Math.max(...layout.lines.map((l) => l.width));
      ctx.fillStyle = design.accent;
      ctx.beginPath();
      ctx.roundRect((W - lw) / 2, top + blockH + 2, lw, 8, 4);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawCaption(ctx, caption, design, t, start, dur, progress) {
  const size = design.size;
  const font = captionFont(design, size);
  const maxWidth = 880;
  const layout = wrapLines(String(caption), font, maxWidth);
  const lineH = size * 1.28;
  const blockH = layout.lines.length * lineH;

  let blockTop;
  if (design.pos === 'top') blockTop = 470;
  else if (design.pos === 'center') blockTop = (H - blockH) / 2;
  else blockTop = H - 400 - blockH;

  // entry animation
  const inP = clamp((t - start + 0.15) / 0.2, 0, 1);
  let scale = 1, alpha = 1;
  if (design.anim === 'pop') {
    scale = 0.9 + 0.1 * (1 - Math.pow(1 - inP, 3)) + 0.015 * Math.sin(inP * Math.PI);
    alpha = clamp(inP * 1.6, 0, 1);
  } else if (design.anim === 'fade') {
    alpha = inP;
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(W / 2, blockTop + blockH / 2);
  ctx.scale(scale, scale);
  ctx.translate(-W / 2, -(blockTop + blockH / 2));

  // background box
  if (design.capBox) {
    const maxLineW = Math.max(...layout.lines.map((l) => l.width));
    const padX = 42, padY = 26;
    const boxW = Math.min(W - 100, maxLineW + padX * 2);
    const boxH = blockH + padY * 2;
    const bx = design.align === 'left' ? 90 - padX : (W - boxW) / 2;
    ctx.fillStyle = hexA(design.boxColor, 0.86);
    ctx.beginPath();
    ctx.roundRect(bx, blockTop - padY, boxW, boxH, 22);
    ctx.fill();
  }

  const highlight = design.anim === 'karaoke';
  const totalChars = layout.lines.reduce((n, l) => n + l.chars.length, 0);
  const reveal = Math.ceil(progress * totalChars * 1.35);
  let charCursor = 0;

  // 핵심 단어 강조 (영화 요약 템플릿)
  let emphWord = '';
  if (design.emph && design.emph !== 'none') {
    const words = String(caption).replace(/[,.!?'"”’…]/g, ' ').split(/\s+/).filter(Boolean);
    if (words.length) emphWord = design.emph === 'first' ? words[0] : words[words.length - 1];
  }

  layout.lines.forEach((line, i) => {
    const y = blockTop + lineH * (i + 0.5);
    const x = design.align === 'left' ? 90 : (W - line.width) / 2;

    let emphAt = -1;
    if (emphWord) {
      const plain = line.text;
      const at = design.emph === 'first' ? plain.indexOf(emphWord) : plain.lastIndexOf(emphWord);
      if (at === 0 || (at > 0 && plain[at - 1] === ' ')) emphAt = at;
    }

    if (design.stroke) {
      ctx.font = font;
      ctx.lineWidth = size * 0.16;
      ctx.strokeStyle = 'rgba(0,0,0,.92)';
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.strokeText(line.text, x, y);
    } else if (!design.capBox) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.55)';
      ctx.shadowBlur = 22;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = design.textColor;
      ctx.font = font;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(line.text, x, y);
      ctx.restore();
    }

    ctx.font = font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    let cx = x;
    for (const c of line.chars) {
      let color = design.textColor;
      if (highlight) {
        color = charCursor < reveal ? design.accent : hexA(design.textColor, 0.42);
      } else if (emphAt >= 0 && charCursor >= emphAt && charCursor < emphAt + emphWord.length) {
        color = design.accent;
      }
      ctx.fillStyle = color;
      if (c.ch !== ' ') ctx.fillText(c.ch, cx, y);
      cx += c.w;
      charCursor++;
    }
  });

  ctx.restore();
}

/* ============================================================
   MAIN PREVIEW
   ============================================================ */
let t = 0;

function currentCaption() {
  if (!state.captions.length) return null;
  return state.captions[clamp(activeCaptionIndex(t), 0, state.captions.length - 1)];
}

function renderPreview() {
  const total = totalDuration();
  let idx = activeCaptionIndex(t);
  let capStart = captionStart(idx);
  let capDur = Number(state.captions[idx]?.dur) || 0;

  drawScene(els.pctx, {
    design: state.design,
    bg: state.bg,
    hook: state.hook,
    title: state.title,
    caption: state.captions[idx] ? state.captions[idx].text : '',
    t, total, capStart, capDur
  });
  updatePlayhead(idx);
}

function updatePlayhead(idx) {
  const total = totalDuration();
  const pct = total > 0 ? clamp(t / total, 0, 1) : 0;
  els.scrubFill.style.width = (pct * 100) + '%';
  els.scrubHead.style.left = (pct * 100) + '%';
  els.timeNow.textContent = fmtTime(t);
  els.timeTotal.textContent = fmtTime(total);
  els.specDuration.textContent = round1(total) + '초';

  if (idx !== lastActiveIdx) {
    lastActiveIdx = idx;
    $$('.tl-block').forEach((b, i) => b.classList.toggle('is-on', i === idx));
    $$('.cap-item').forEach((r, i) => r.classList.toggle('is-on', i === idx));
    const block = els.timeline.children[idx];
    const track = els.timeline;
    if (block && track.scrollWidth > track.clientWidth) {
      const left = block.offsetLeft;
      const right = left + block.offsetWidth;
      if (left < track.scrollLeft || right > track.scrollLeft + track.clientWidth) {
        track.scrollLeft = Math.max(0, left - 24);
      }
    }
    // TTS follow
    if (isPlaying && state.audio.follow && state.captions[idx]) {
      speak(state.captions[idx].text);
    }
  }
}

function fmtTime(sec) {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${String(m).padStart(2, '0')}:${rest.toFixed(1).padStart(4, '0')}`;
}

/* ============================================================
   PLAYBACK
   ============================================================ */
let isPlaying = false;
let rafId = null;
let lastTs = 0;

const bgmEl = new Audio();
bgmEl.loop = true;
bgmEl.preload = 'auto';
const voiceEl = new Audio();
voiceEl.preload = 'auto';

function play() {
  if (!state.captions.length) { toast('먼저 대본으로 자막을 만들어 주세요'); return; }
  const total = totalDuration();
  if (t >= total - 0.02) t = 0;
  isPlaying = true;
  els.playBtn.classList.add('is-playing');
  els.playBtn.setAttribute('aria-label', '일시정지');
  syncAudio(true);
  if (state.audio.follow && state.captions[activeCaptionIndex(t)]) {
    speak(state.captions[activeCaptionIndex(t)].text);
  }
  lastTs = performance.now();
  rafId = requestAnimationFrame(tick);
}

function tick(ts) {
  if (!isPlaying) return;
  const dt = Math.min(0.1, (ts - lastTs) / 1000);
  lastTs = ts;
  t += dt;
  const total = totalDuration();
  if (t >= total) {
    t = total;
    renderPreview();
    pause();
    t = 0;
    setTimeout(renderPreview, 320);
    return;
  }
  renderPreview();
  rafId = requestAnimationFrame(tick);
}

function pause() {
  isPlaying = false;
  els.playBtn.classList.remove('is-playing');
  els.playBtn.setAttribute('aria-label', '재생');
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  syncAudio(false);
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

function togglePlay() { isPlaying ? pause() : play(); }

function seek(sec) {
  t = clamp(sec, 0, Math.max(0.001, totalDuration()));
  renderPreview();
  if (isPlaying) syncAudio(true);
}

function syncBgVideo(shouldPlay) {
  if (state.bg.mode !== 'media' || state.bg.mediaType !== 'video' || !state.bg.el) return;
  const v = state.bg.el;
  if (!shouldPlay) { v.pause(); return; }
  const dur = v.duration || 1;
  const target = t % dur;
  if (Math.abs(v.currentTime - target) > 0.5) v.currentTime = target;
  v.play().catch(() => {});
}

function syncAudio(shouldPlay) {
  syncBgVideo(shouldPlay);
  if (state.audio.bgmURL) {
    if (shouldPlay) {
      if (Math.abs(bgmEl.currentTime - (t % Math.max(0.1, bgmEl.duration || 30))) > 0.4) {
        bgmEl.currentTime = t % Math.max(0.1, bgmEl.duration || 30);
      }
      bgmEl.play().catch(() => {});
    } else bgmEl.pause();
  }
  if (state.audio.voiceURL) {
    if (shouldPlay) {
      voiceEl.currentTime = clamp(t, 0, voiceEl.duration || 999);
      voiceEl.play().catch(() => {});
    } else voiceEl.pause();
  }
}

function applyAudioVolumes() {
  bgmEl.volume = state.audio.muted ? 0 : state.audio.bgmVol;
  voiceEl.volume = state.audio.muted ? 0 : state.audio.voiceVol;
}

/* ============================================================
   TTS
   ============================================================ */
let voices = [];
function loadVoices() {
  if (!('speechSynthesis' in window)) return;
  voices = speechSynthesis.getVoices();
  const sel = $('#voiceSelect');
  const langInfo = LANGS[state.lang];
  const pref = voices.filter((v) => v.lang.toLowerCase().startsWith(langInfo.tts.slice(0, 2).toLowerCase()));
  const list = pref.length ? pref : voices;
  sel.innerHTML = '';
  if (!list.length) {
    const opt = document.createElement('option');
    opt.textContent = '사용 가능한 음성 없음';
    opt.value = '';
    sel.append(opt);
    return;
  }
  list.forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v.voiceURI;
    opt.textContent = `${v.name} (${v.lang})`;
    sel.append(opt);
  });
  if (state.audio.voiceURI && list.some((v) => v.voiceURI === state.audio.voiceURI)) {
    sel.value = state.audio.voiceURI;
  } else {
    sel.value = list[0].voiceURI;
    state.audio.voiceURI = list[0].voiceURI;
  }
}
if ('speechSynthesis' in window) {
  speechSynthesis.onvoiceschanged = loadVoices;
}

function speak(text) {
  if (!('speechSynthesis' in window) || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = voices.find((x) => x.voiceURI === state.audio.voiceURI);
  if (v) u.voice = v;
  u.rate = state.audio.rate;
  u.lang = LANGS[state.lang]?.tts || 'ko-KR';
  u.volume = state.audio.muted ? 0 : 1;
  speechSynthesis.speak(u);
}

/* ============================================================
   UI RENDERERS
   ============================================================ */
function renderAll() {
  renderCaptions();
  renderTimeline();
  renderStageMeta();
  renderLangList();
  updateDesignUI();
  saveLater();
  renderPreview();
}

function renderStageMeta() {
  els.stageCount.textContent = `자막 ${state.captions.length}개 · ${round1(totalDuration())}초`;
  $('#capCount').textContent = state.captions.length;
  $('#capTotal').textContent = round1(totalDuration()).toFixed(1) + '초';
  els.specDuration.textContent = round1(totalDuration()) + '초';
}

function renderCaptions() {
  const list = els.capList;
  list.innerHTML = '';
  if (!state.captions.length) {
    const empty = document.createElement('p');
    empty.className = 'timeline-hint';
    empty.textContent = '아직 자막이 없습니다. 대본을 넣고 자동 분할을 눌러 보세요.';
    list.append(empty);
    return;
  }
  state.captions.forEach((cap, i) => {
    const row = document.createElement('div');
    row.className = 'cap-item' + (i === state.selected ? ' is-on' : '');
    row.innerHTML = `
      <span class="cap-idx">${String(i + 1).padStart(2, '0')}</span>
      <textarea rows="1" spellcheck="false"></textarea>
      <span style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">
        <input class="cap-dur" type="number" min="0.4" max="8" step="0.1" value="${Number(cap.dur).toFixed(1)}" aria-label="표시 시간" />
        <button class="cap-del" type="button" aria-label="삭제">×</button>
      </span>`;
    const ta = row.querySelector('textarea');
    ta.value = cap.text;
    const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(110, ta.scrollHeight) + 'px'; };
    requestAnimationFrame(grow);
    ta.addEventListener('input', () => {
      cap.text = ta.value;
      layoutCache.key = '';
      grow();
      renderTimeline();
      renderStageMeta();
      renderPreview();
      saveLater();
    });
    ta.addEventListener('focus', () => { state.selected = i; seekSafe(i); });
    row.querySelector('.cap-dur').addEventListener('change', (e) => {
      cap.dur = round1(clamp(Number(e.target.value) || 2, 0.4, 8));
      e.target.value = cap.dur.toFixed(1);
      renderTimeline();
      renderStageMeta();
      renderPreview();
      saveLater();
    });
    row.querySelector('.cap-del').addEventListener('click', () => {
      state.captions.splice(i, 1);
      state.selected = clamp(i, 0, Math.max(0, state.captions.length - 1));
      renderAll();
    });
    row.addEventListener('click', (e) => {
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
      state.selected = i;
      seekSafe(i);
      $$('.cap-item').forEach((r, ri) => r.classList.toggle('is-on', ri === i));
    });
    list.append(row);
  });
}

function seekSafe(i) {
  t = captionStart(i);
  renderPreview();
}

function renderTimeline() {
  const track = els.timeline;
  track.innerHTML = '';
  const total = totalDuration();
  if (!state.captions.length) {
    track.innerHTML = '<span class="tl-empty">자막을 만들면 여기에 표시됩니다</span>';
    return;
  }
  state.captions.forEach((cap, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tl-block' + (i === activeCaptionIndex(t) ? ' is-on' : '');
    b.style.flex = `${Math.max(0.4, Number(cap.dur) || 1)} 1 0px`;
    b.innerHTML = `<b>${escapeHtml(cap.text)}</b><i>${Number(cap.dur).toFixed(1)}s</i>`;
    b.title = cap.text;
    b.addEventListener('click', () => {
      state.selected = i;
      seekSafe(i);
      renderCaptions();
    });
    track.append(b);
  });
  track.scrollLeft = 0;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function updateDesignUI() {
  const d = state.design;
  $('#fontSelect').value = d.font;
  $('#fontSize').value = d.size;
  $('#fontSizeOut').textContent = d.size;
  $('#textColor').value = d.textColor;
  $('#accentColor').value = d.accent;
  $('#boxColor').value = d.boxColor;
  $('#alignSelect').value = d.align;
  $('#animSelect').value = d.anim;
  $('#hookStyle').value = d.hookStyle;
  $('#capBox').checked = d.capBox;
  $('#capStroke').checked = d.stroke;
  $('#progressBar').checked = d.progressBar;
  $('#showHook').checked = d.showHook;
  if ($('#showTitle')) $('#showTitle').checked = Boolean(d.showTitle);
  if ($('#emphSelect')) $('#emphSelect').value = d.emph || 'none';
  $('#watermark').value = d.watermark;
  $$('#posSeg button').forEach((b) => b.classList.toggle('is-on', b.dataset.pos === d.pos));
  $$('.tpl-card').forEach((c) => c.classList.toggle('is-on', c.dataset.tpl === d.template));
  layoutCache.key = '';
}

/* ---------------- background grid ---------------- */
function renderBgGrid() {
  const grid = $('#bgGrid');
  grid.innerHTML = '';
  Object.entries(PRESETS).forEach(([key, p]) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'bg-card' + (state.bg.mode === 'preset' && state.bg.preset === key ? ' is-on' : '');
    card.dataset.bg = key;
    const cv = document.createElement('canvas');
    cv.width = 180; cv.height = 240;
    const c = cv.getContext('2d');
    c.save(); c.scale(180 / W, 240 / H);
    paintPreset(c, key, 0);
    c.restore();
    // darken like the phone
    c.fillStyle = 'rgba(0,0,0,.18)';
    c.fillRect(0, 0, 180, 240);
    card.append(cv);
    const label = document.createElement('span');
    label.textContent = p.name;
    card.append(label);
    card.addEventListener('click', () => {
      state.bg.mode = 'preset';
      state.bg.preset = key;
      state.bg.mediaURL = null;
      state.bg.el = null;
      $('#fileRow').hidden = true;
      $$('.bg-card').forEach((x) => x.classList.toggle('is-on', x.dataset.bg === key));
      renderPreview();
      saveLater();
    });
    grid.append(card);
  });
}

/* ---------------- accent mood presets ---------------- */
function renderMoodRow() {
  const wrap = $('#moodRow');
  if (!wrap) return;
  wrap.innerHTML = '';
  MOOD_PRESETS.forEach((m) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mood-chip' + (state.design.accent.toLowerCase() === m.color.toLowerCase() ? ' is-on' : '');
    b.innerHTML = `<i style="background:${m.color}"></i><span>${m.name}</span>`;
    b.addEventListener('click', () => {
      state.design.accent = m.color;
      $('#accentColor').value = m.color;
      designChanged();
      renderMoodRow();
    });
    wrap.append(b);
  });
}

/* ---------------- title presets ---------------- */
function renderTitlePresets() {
  const wrap = $('#titlePresets');
  if (!wrap) return;
  wrap.innerHTML = '';
  MOVIE_TITLE_PRESETS.forEach((t) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t;
    b.addEventListener('click', () => {
      state.title = t;
      $('#titleInput').value = t;
      $('#titleCount').textContent = `${t.length} / 24`;
      if (!state.design.showTitle) {
        state.design.showTitle = true;
        state.design.showHook = false;
        $('#showTitle').checked = true;
        $('#showHook').checked = false;
      }
      renderPreview();
      saveLater();
    });
    wrap.append(b);
  });
}

/* ---------------- template grid ---------------- */
function renderTplGrid() {
  const grid = $('#tplGrid');
  grid.innerHTML = '';
  TEMPLATES.forEach((tpl) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'tpl-card' + (state.design.template === tpl.id ? ' is-on' : '');
    card.dataset.tpl = tpl.id;
    const cv = document.createElement('canvas');
    cv.width = 144; cv.height = 256;
    const c = cv.getContext('2d');
    c.save(); c.scale(144 / W, 256 / H);
    const design = { ...state.design, ...tpl.d, textColor: '#ffffff', boxColor: '#0b0b0e', progressBar: false, showHook: true, watermark: '' };
    design.size = Math.max(60, Math.min(96, design.size * 1.25));
    drawScene(c, {
      design,
      bg: { ...state.bg, mode: 'preset', preset: 'night', grain: true, vignette: true, dim: 30 },
      hook: '3초 만에',
      title: tpl.id === 'movie' ? '30년 인생이 전부 거짓말이었던 남자' : '',
      caption: '이게 진짜 방법',
      t: 1.2, total: 10, capStart: 0, capDur: 2.4
    });
    c.restore();
    card.append(cv);
    const label = document.createElement('span');
    label.textContent = tpl.name;
    card.append(label);
    card.addEventListener('click', () => {
      applyTemplate(tpl.id);
      renderTplGrid();
    });
    grid.append(card);
  });
}

function applyTemplate(id) {
  const tpl = TEMPLATES.find((x) => x.id === id);
  if (!tpl) return;
  state.design = { ...state.design, ...tpl.d, template: id };
  layoutCache.key = '';
  updateDesignUI();
  renderPreview();
  saveLater();
  toast(`‘${tpl.name}’ 템플릿 적용`);
}

/* ---------------- language ---------------- */
function renderLangList() {
  const wrap = $('#langList');
  wrap.innerHTML = '';
  state.langs.forEach((l) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lang-item' + (l.code === state.lang ? ' is-on' : '');
    b.innerHTML = `<span class="lang-flag">${l.flag}</span><span class="lang-name">${l.label}</span><span class="lang-sub">${l.captions.length ? l.captions.length + '개 자막' : '비어 있음'}</span>`;
    b.addEventListener('click', () => switchLang(l.code));
    wrap.append(b);
  });

  const cur = currentLangObj();
  $('#langEditorTitle').textContent = `${cur.label} 대본`;
  $('#langVoiceHint').textContent = `TTS: ${LANGS[cur.code].tts}`;
  if (document.activeElement !== $('#langScript')) $('#langScript').value = cur.script || '';
  if (document.activeElement !== $('#langHook')) $('#langHook').value = cur.hook || '';
}

function currentLangObj() {
  return state.langs.find((l) => l.code === state.lang) || state.langs[0];
}

function syncCurrentLang() {
  const l = currentLangObj();
  l.script = state.script;
  l.hook = state.hook;
  l.captions = state.captions.map((c) => ({ ...c }));
}

function switchLang(code) {
  if (code === state.lang) return;
  pause();
  syncCurrentLang();
  state.lang = code;
  const l = currentLangObj();
  state.script = l.script || '';
  state.hook = l.hook || '';
  state.captions = (l.captions || []).map((c) => ({ ...c }));
  state.selected = 0;
  t = 0;
  els.scriptInput.value = state.script;
  els.hookInput.value = state.hook;
  loadVoices();
  renderAll();
  renderLangList();
  queueFontSync();
  toast(`${l.label} 버전으로 전환`);
}

function addLang() {
  const order = ['ja', 'en', 'es'];
  const next = order.find((c) => !state.langs.some((l) => l.code === c));
  if (!next) { toast('추가할 수 있는 언어를 모두 열었습니다'); return; }
  const meta = LANGS[next];
  state.langs.push({ code: next, label: meta.label, flag: meta.flag, script: '', hook: '', captions: [] });
  switchLang(next);
  toast(`${meta.label} 버전을 추가했습니다. 대본을 붙여넣으세요`);
}

/* ============================================================
   FONT SYNC (Korean subsets load on demand)
   ============================================================ */
let fontTimer = null;
const CAPTION_FONTS = ['Black Han Sans', 'Pretendard Variable', 'Do Hyeon', 'Jua', 'Noto Serif KR'];

function syncFontsForText(text) {
  if (!text || !document.fonts) return Promise.resolve();
  const jobs = CAPTION_FONTS.map((f) => {
    const weight = f === 'Pretendard Variable' ? 800 : 400;
    return document.fonts.load(`${weight} 64px "${f}"`, text).catch(() => {});
  });
  return Promise.all(jobs);
}

function queueFontSync() {
  clearTimeout(fontTimer);
  fontTimer = setTimeout(async () => {
    const text = state.captions.map((c) => c.text).join(' ') + ' ' + (state.hook || '') + ' 이게 진짜 방법 3초 만에 HOOK';
    await syncFontsForText(text);
    layoutCache.key = '';
    renderPreview();
    renderTplGrid();
  }, 220);
}

/* ============================================================
   AI SCRIPT (Gemini 프록시 · /api/gemini)
   ============================================================ */
const AI_DEFAULT_API = 'https://ai-automation-landing-kohl.vercel.app/api/gemini';
// 응답이 막힌 모델(503·404)은 건너뛰고 다음 모델로 넘어간다.
// 앞쪽 모델이 대기열이 길 때가 있어, 지금 잘 응답하는 모델을 먼저 둔다.
const AI_MODELS = [
  'gemini-3-flash-preview',
  'gemini-3.8-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.6-flash'
];

const AI_TONES = {
  cinematic: {
    label: '영화 요약',
    rule: '1인칭 몰입 시점으로 영화를 요약한다. 오프닝 첫 문장은 반전을 예고하는 강한 한 문장, 마지막 문장은 여운을 남긴다. 스포일러를 포함해도 된다.'
  },
  thriller: {
    label: '스릴러 반전',
    rule: '스릴러·미스터리 반전을 강조한다. 소름 돋는 디테일을 먼저 깔고 마지막에 뒤집는다. 1인칭으로 지금 겪는 일처럼 쓴다.'
  },
  info: {
    label: '정보형',
    rule: '핵심 정보를 짧은 문장으로 빠르게 전달한다. 숫자와 구체적 사실을 넣고 마지막에 행동을 제안한다.'
  },
  story: {
    label: '사연 · 감동',
    rule: '한 사람의 사연을 1인칭으로 담담하게 들려주고 마지막에 감정을 터뜨린다.'
  }
};

function aiApiUrl() {
  const fromQuery = new URLSearchParams(location.search).get('api');
  const fromField = $('#aiApi') ? $('#aiApi').value.trim() : '';
  if (fromField && /^https?:\/\//i.test(fromField)) return fromField;
  if (fromQuery && /^https?:\/\//i.test(fromQuery)) return fromQuery;
  return AI_DEFAULT_API;
}

function aiPrompt(topic, tone, lines) {
  const t = AI_TONES[tone] || AI_TONES.cinematic;
  return [
    '너는 한국 유튜브 쇼츠 채널의 대본 작가다. 아래 주제로 30초 세로 쇼츠 대본을 쓴다.',
    `주제: ${topic}`,
    `톤: ${t.label}. ${t.rule}`,
    `분량: 정확히 ${lines}문장. 한 문장은 12~24자 안팎의 짧은 구어체.`,
    '형식 규칙:',
    '- 상단 고정 타이틀은 18자 이내, 호기심을 자극하는 명사형.',
    '- 훅은 24자 이내 한 문장. 3초 안에 손가락을 멈추게 하는 말.',
    '- 대본은 문장마다 줄바꿈. 따옴표·이모지·해설 금지.',
    '아래 JSON 형식만 출력한다. 다른 말은 쓰지 않는다.',
    '{"title":"상단 고정 타이틀","hook":"3초 후킹 한 문장","script":"문장1\\n문장2\\n..."}'
  ].join('\n');
}

async function callGemini(prompt) {
  const api = aiApiUrl();
  const pinned = ($('#aiModel')?.value || '').trim();
  const models = pinned && pinned !== 'auto' ? [pinned] : AI_MODELS;
  let lastError = 'AI 서버에 연결하지 못했습니다';

  const stateEl = $('#aiState');
  for (const model of models) {
    if (stateEl) stateEl.textContent = `생성 중 · ${model.replace('gemini-', '').replace('-flash', '')}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30000);
      try {
        const res = await fetch(api, {
          signal: ctrl.signal,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.95,
              responseMimeType: 'application/json',
              maxOutputTokens: 2048
            }
          })
        });
        const data = await res.json().catch(() => null);
        const code = (data && data.error && data.error.code) || res.status;
        if (res.ok && data) {
          const parts = data?.candidates?.[0]?.content?.parts || [];
          const text = parts.map((p) => p.text || '').join('').trim();
          if (text) return { text, model };
          lastError = 'AI가 빈 응답을 보냈습니다';
        } else {
          lastError = (data && data.error && data.error.message) || `HTTP ${res.status}`;
          // 모델이 사라졌거나 잘못된 요청이면 다음 모델로
          if (code === 404 || code === 400 || code === 403) break;
          if (code !== 503 && code !== 429 && code !== 500) break;
          await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
        }
      } catch (err) {
        lastError = err && err.name === 'AbortError'
          ? 'AI 응답이 늦어 시간 초과'
          : '네트워크 오류: ' + (err && err.message ? err.message : 'unknown');
      } finally {
        clearTimeout(timer);
      }
    }
  }
  throw new Error(lastError);
}

function parseAiResult(raw) {
  let text = String(raw || '').trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  let obj = null;
  try { obj = JSON.parse(text); } catch { obj = null; }
  if (!obj) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) { try { obj = JSON.parse(match[0]); } catch { obj = null; } }
  }
  if (obj && (obj.script || obj.title || obj.hook)) {
    const script = Array.isArray(obj.script) ? obj.script.join('\n') : String(obj.script || '');
    return {
      title: String(obj.title || '').replace(/^["'“”]|["'“”]$/g, '').trim(),
      hook: String(obj.hook || '').replace(/^["'“”]|["'“”]$/g, '').trim(),
      script: script.trim()
    };
  }
  const rows = text.split(/\n+/).map((s) => s.replace(/^[-*\d.\s]+/, '').trim()).filter(Boolean);
  return { title: '', hook: rows[0] || '', script: rows.slice(1).join('\n') || text };
}

async function generateScript() {
  const topic = ($('#aiTopic').value || '').trim();
  if (!topic) {
    toast('영화 제목이나 주제를 먼저 입력해 주세요');
    $('#aiTopic').focus();
    return;
  }
  const btn = $('#aiGenBtn');
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = '생성 중…';
  $('#aiState').textContent = 'AI가 대본을 쓰고 있어요';
  try {
    const tone = $('#aiTone').value;
    const lines = Number($('#aiLines').value) || 11;
    const { text, model } = await callGemini(aiPrompt(topic, tone, lines));
    const r = parseAiResult(text);
    if (r.title) {
      state.title = r.title.slice(0, 24);
      $('#titleInput').value = state.title;
      $('#titleCount').textContent = `${state.title.length} / 24`;
      if (!state.design.showTitle) {
        state.design.showTitle = true;
        $('#showTitle').checked = true;
      }
    }
    if (r.hook) {
      state.hook = r.hook.slice(0, 40);
      els.hookInput.value = state.hook;
      $('#hookCount').textContent = `${state.hook.length} / 40`;
    }
    if (r.script) {
      state.script = r.script;
      els.scriptInput.value = r.script;
      doSplit(false);
    }
    refreshMeta();
    $('#aiState').textContent = `완성 · ${state.captions.length}개 자막 (${model})`;
    toast('AI 대본을 채웠습니다');
  } catch (err) {
    $('#aiState').textContent = '실패 — 다시 시도';
    toast('AI 생성 실패: ' + (err && err.message ? err.message : '다시 시도해 주세요'));
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

/* ============================================================
   META / HASHTAGS
   ============================================================ */
function buildMeta() {
  const hook = state.hook || '';
  const caps = state.captions.map((c) => c.text);
  const body = caps.slice(0, 2).join(' ');
  const head = state.title ? `${state.title} | ` : hook ? `${hook} | ` : '';
  const title = head + (caps[0] || state.name);
  const words = caps.join(' ').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
  const freq = {};
  words.forEach((w) => { freq[w] = (freq[w] || 0) + 1; });
  const keywords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([w]) => '#' + w.replace(/\s/g, ''));
  const base = ['#shorts', '#쇼츠', '#숏폼', '#유튜브쇼츠'];
  const tags = [...new Set([...base, ...keywords])].slice(0, 8);
  return {
    title: title.slice(0, 90),
    desc: `${hook}\n\n${body}\n\n${tags.join(' ')}`
  };
}

function refreshMeta() {
  const m = buildMeta();
  $('#metaTitle').value = m.title;
  $('#metaDesc').value = m.desc;
}

/* ============================================================
   EXPORT
   ============================================================ */
let recorder = null;
let exportRaf = null;
let exportStart = 0;
let exportCancelled = false;
let exportChunks = [];
let exportStream = null;
let exportAudioCtx = null;
let exportNodes = [];
let resultURL = null;

function pickMime() {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ];
  if (!window.MediaRecorder) return '';
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';
}

function initFormatLabel() {
  const mime = pickMime();
  const el = $('#specFormat');
  if (!mime) { el.textContent = '지원 안 됨'; return; }
  el.textContent = mime.includes('mp4') ? 'MP4 (H.264)' : 'WebM (VP9)';
}

function buildAudioGraph() {
  const tracks = [];
  if (!state.audio.bgmURL && !state.audio.voiceURL) return tracks;
  try {
    exportAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const dest = exportAudioCtx.createMediaStreamDestination();
    const master = exportAudioCtx.createGain();
    master.gain.value = 1;
    master.connect(dest);
    master.connect(exportAudioCtx.destination);

    if (state.audio.bgmURL) {
      const a = new Audio(state.audio.bgmURL);
      a.loop = true;
      a.crossOrigin = 'anonymous';
      const src = exportAudioCtx.createMediaElementSource(a);
      const g = exportAudioCtx.createGain();
      g.gain.value = state.audio.bgmVol;
      src.connect(g).connect(master);
      exportNodes.push({ el: a, gain: g });
    }
    if (state.audio.voiceURL) {
      const v = new Audio(state.audio.voiceURL);
      v.crossOrigin = 'anonymous';
      const vsrc = exportAudioCtx.createMediaElementSource(v);
      const vg = exportAudioCtx.createGain();
      vg.gain.value = state.audio.voiceVol;
      vsrc.connect(vg).connect(master);
      exportNodes.push({ el: v, gain: vg });
    }
    tracks.push(...dest.stream.getAudioTracks());
    if (exportAudioCtx.state === 'suspended') exportAudioCtx.resume();
  } catch (err) {
    console.warn('audio graph failed', err);
  }
  return tracks;
}

async function exportVideo() {
  if (recorder) return;
  const total = totalDuration();
  if (!state.captions.length) {
    toast('먼저 대본으로 자막을 만들어 주세요');
    setStep('script');
    return;
  }
  const mime = pickMime();
  if (!mime) { toast('이 브라우저에서는 영상 내보내기를 지원하지 않습니다'); return; }
  if (!els.preview.captureStream) { toast('영상 녹화를 지원하지 않는 브라우저입니다. 크롬에서 열어 주세요'); return; }

  pause();
  exportCancelled = false;
  exportChunks = [];
  t = 0;
  renderPreview();

  $('#exportModal').hidden = false;
  $('#renderPct').textContent = '0%';
  $('#renderStatus').textContent = '렌더링을 준비하고 있어요';
  $('#exportBar').style.width = '0%';
  $('#exportProgress').hidden = false;
  $('#exportPct').textContent = '0%';
  $('#exportStatus').textContent = '렌더링 준비 중…';

  // video track
  const canvasStream = els.preview.captureStream(30);
  const audioTracks = buildAudioGraph();
  exportStream = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);

  let options = { videoBitsPerSecond: 9_000_000 };
  try {
    recorder = new MediaRecorder(exportStream, { ...options, mimeType: mime });
  } catch (e) {
    try { recorder = new MediaRecorder(exportStream, options); }
    catch (e2) { toast('녹화기를 시작할 수 없습니다'); closeExport(); return; }
  }

  recorder.ondataavailable = (e) => { if (e.data && e.data.size) exportChunks.push(e.data); };
  recorder.onstop = () => {
    if (exportCancelled) { cleanupExport(); return; }
    const type = recorder.mimeType || mime;
    const blob = new Blob(exportChunks, { type });
    const ext = type.includes('mp4') ? 'mp4' : 'webm';
    const name = slug(state.name) + '-' + state.lang + '.' + ext;
    resultURL = URL.createObjectURL(blob);
    const video = $('#resultVideo');
    video.src = resultURL;
    const link = $('#saveVideoLink');
    link.href = resultURL;
    link.download = name;
    $('#resultMeta').textContent = `${ext.toUpperCase()} · 1080×1920 · ${(blob.size / 1048576).toFixed(1)}MB · ${round1(totalDuration())}초`;
    $('#exportResult').hidden = false;
    $('#exportActions').hidden = true;
    $('#exportModal').querySelector('.render-overlay').hidden = true;
    $('#exportModal').querySelector('.render-frame').hidden = true;
    $('#exportModal').querySelector('.modal-note').hidden = true;
    $('#exportModal').querySelector('.modal-head h2').textContent = '영상이 완성됐어요';
    $('#exportModal').querySelector('.modal-head .eyebrow').textContent = 'READY';
    $('#renderStatus').textContent = '완성. 파일을 저장하세요';
    // best-effort auto download (may be blocked after async render)
    downloadBlob(blob, name);
    cleanupExport();
  };

  recorder.start(1000);
  exportStart = performance.now();

  // reset result
  if (resultURL) { URL.revokeObjectURL(resultURL); resultURL = null; }
  $('#exportResult').hidden = true;
  $('#exportActions').hidden = false;
  $('#exportModal').querySelector('.render-frame').hidden = false;
  $('#exportModal').querySelector('.modal-note').hidden = false;
  $('#exportModal').querySelector('.modal-head h2').textContent = '영상으로 굽는 중';
  $('#exportModal').querySelector('.modal-head .eyebrow').textContent = 'RENDER';
  $('#resultVideo').removeAttribute('src');
  $('#resultVideo').load();
  $('#exportModal').querySelector('.render-overlay').hidden = false;

  // reset media
  if (state.bg.mode === 'media' && state.bg.mediaType === 'video' && state.bg.el) {
    state.bg.el.currentTime = 0;
    state.bg.el.play().catch(() => {});
  }
  exportNodes.forEach(({ el, gain }) => {
    el.currentTime = 0;
    el.play().catch(() => {});
  });

  exportLoop(performance.now());

  function exportLoop(now) {
    if (!recorder || recorder.state === 'inactive') return;
    const elapsed = (now - exportStart) / 1000;
    const prog = clamp(elapsed / total, 0, 1);
    t = Math.min(elapsed, total);
    renderPreview();
    // mini preview mirror
    drawMiniExport();
    $('#exportBar').style.width = (prog * 100).toFixed(1) + '%';
    $('#exportPct').textContent = Math.round(prog * 100) + '%';
    $('#renderPct').textContent = Math.round(prog * 100) + '%';
    $('#exportStatus').textContent = prog < 0.99 ? '프레임 렌더링 중…' : '파일 마무리 중…';
    $('#renderStatus').textContent = prog < 0.99 ? '프레임을 그리고 있어요' : '파일을 묶고 있어요';

    if (elapsed >= total + 0.25) {
      try { recorder.stop(); } catch {}
      return;
    }
    exportRaf = requestAnimationFrame(exportLoop);
  }
}

function drawMiniExport() {
  const c = els.exportPreview;
  const ctx = els.ectx;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.drawImage(els.preview, 0, 0, c.width, c.height);
}

function cleanupExport() {
  if (exportRaf) cancelAnimationFrame(exportRaf);
  exportRaf = null;
  exportNodes.forEach(({ el }) => { try { el.pause(); } catch {} });
  exportNodes = [];
  try { exportStream?.getTracks().forEach((tr) => tr.stop()); } catch {}
  exportStream = null;
  if (exportAudioCtx) { exportAudioCtx.close().catch(() => {}); exportAudioCtx = null; }
  recorder = null;
  if (state.bg.mode === 'media' && state.bg.mediaType === 'video' && state.bg.el) state.bg.el.pause();
}

function closeExport() {
  $('#exportModal').hidden = true;
  $('#exportProgress').hidden = true;
  $('#exportResult').hidden = true;
  cleanupExport();
}

function cancelExport() {
  exportCancelled = true;
  try { recorder?.stop(); } catch {}
  closeExport();
}

/* ============================================================
   DOWNLOADS
   ============================================================ */
function slug(s) {
  return (s || 'shorts').trim().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}-]/gu, '').slice(0, 40) || 'shorts';
}

function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function buildSRT() {
  const stamp = (s) => {
    const hh = String(Math.floor(s / 3600)).padStart(2, '0');
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(Math.floor(s % 60)).padStart(2, '0');
    const ms = String(Math.round((s % 1) * 1000)).padStart(3, '0');
    return `${hh}:${mm}:${ss},${ms}`;
  };
  let acc = 0;
  return state.captions.map((c, i) => {
    const start = acc;
    const end = acc + Number(c.dur);
    acc = end;
    return `${i + 1}\n${stamp(start)} --> ${stamp(end)}\n${c.text}\n`;
  }).join('\n');
}

function exportJSON() {
  syncCurrentLang();
  const data = {
    app: 'shortcut-studio', version: 2, savedAt: new Date().toISOString(),
    name: state.name, lang: state.lang, title: state.title,
    design: state.design,
    bg: { ...state.bg, el: undefined, images: [] },
    audio: { ...state.audio },
    langs: state.langs
  };
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), slug(state.name) + '.json');
  toast('프로젝트 파일을 저장했습니다');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('복사했습니다');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.append(ta);
    ta.select();
    try { document.execCommand('copy'); toast('복사했습니다'); } catch { toast('복사에 실패했습니다'); }
    ta.remove();
  }
}

/* ============================================================
   MEDIA
   ============================================================ */
function loadMediaFiles(files) {
  const list = Array.from(files || []).filter(Boolean);
  if (!list.length) return;
  const video = list.find((f) => f.type.startsWith('video'));
  if (video) { loadMedia(video); return; }
  const images = list.filter((f) => f.type.startsWith('image'));
  if (!images.length) return;
  if (images.length > 1) state.bg.images = [];
  images.forEach(addSlideFile);
  state.bg.mode = 'slides';
  state.bg.mediaURL = null;
  state.bg.el = null;
  $('#fileRow').hidden = true;
  $$('.bg-card').forEach((x) => x.classList.remove('is-on'));
  renderSlides();
  renderPreview();
  saveLater();
  toast(`이미지 ${state.bg.images.length}컷 · 자막 구간에 맞춰 자동 전환`);
}

function addSlideFile(file) {
  if (!file || !file.type.startsWith('image')) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => { renderSlides(); renderPreview(); };
  img.src = url;
  state.bg.images.push({ url, el: img, name: file.name });
  state.bg.mode = 'slides';
}

function renderSlides() {
  const strip = $('#slideStrip');
  const block = $('#slideBlock');
  if (!strip || !block) return;
  const imgs = state.bg.images || [];
  block.hidden = imgs.length === 0;
  const count = $('#slideCount');
  if (count) count.textContent = String(imgs.length);
  strip.innerHTML = '';
  imgs.forEach((it, i) => {
    const cell = document.createElement('div');
    cell.className = 'slide-cell';
    cell.style.backgroundImage = `url(${it.url})`;
    cell.innerHTML = `<span class="slide-no">${i + 1}</span><button class="slide-x" type="button" aria-label="컷 삭제">×</button>`;
    cell.querySelector('.slide-x').addEventListener('click', (e) => {
      e.stopPropagation();
      state.bg.images.splice(i, 1);
      if (!state.bg.images.length) {
        state.bg.mode = 'preset';
        renderBgGrid();
      }
      renderSlides();
      renderPreview();
      saveLater();
    });
    strip.append(cell);
  });
  if (imgs.length) {
    const segs = slideSegments(imgs.length);
    const last = segs[segs.length - 1];
    strip.dataset.span = `${round1(segs[0].end - segs[0].start)}초~${round1(last.end - last.start)}초`;
  }
}

function loadMedia(file) {
  if (!file) return;
  const isVideo = file.type.startsWith('video');
  const url = URL.createObjectURL(file);
  if (isVideo) {
    const v = document.createElement('video');
    v.src = url;
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.crossOrigin = 'anonymous';
    v.addEventListener('loadeddata', () => {
      state.bg.mode = 'media';
      state.bg.mediaType = 'video';
      state.bg.mediaURL = url;
      state.bg.el = v;
      if (isPlaying) v.play().catch(() => {});
      renderPreview();
      saveLater();
    });
    v.load();
  } else {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      state.bg.mode = 'media';
      state.bg.mediaType = 'image';
      state.bg.mediaURL = url;
      state.bg.el = img;
      renderPreview();
      saveLater();
    };
    img.src = url;
  }

  $('#fileRow').hidden = false;
  $('#fileName').textContent = file.name;
  $('#fileType').textContent = isVideo ? '동영상 배경' : '이미지 배경';
  $$('.bg-card').forEach((x) => x.classList.remove('is-on'));
  state.bg.images = [];
  renderSlides();
  const thumb = $('#fileThumb');
  if (!isVideo) thumb.style.backgroundImage = `url(${url})`;
  else thumb.style.background = 'linear-gradient(135deg,#2a2a34,#101014)';
}

function loadAudio(kind, file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  if (kind === 'voice') {
    state.audio.voiceURL = url;
    state.audio.voiceName = file.name;
    voiceEl.src = url;
    voiceEl.volume = state.audio.voiceVol;
    $('#voiceDropText').textContent = file.name;
  } else {
    state.audio.bgmURL = url;
    state.audio.bgmName = file.name;
    bgmEl.src = url;
    bgmEl.volume = state.audio.bgmVol;
    $('#bgmDropText').textContent = file.name;
  }
  saveLater();
}

/* ============================================================
   STEPS
   ============================================================ */
const STEP_META = {
  source: { title: '소스', eyebrow: 'STEP 01', desc: '배경이 될 영상이나 이미지를 올리고 톤을 잡으세요.' },
  script: { title: '대본 · 자막', eyebrow: 'STEP 02', desc: '대본을 붙여넣으면 2초 단위 자막으로 쪼개집니다.' },
  design: { title: '디자인', eyebrow: 'STEP 03', desc: '캡컷 스타일 템플릿을 고르고 폰트와 색을 다듬으세요.' },
  audio: { title: '보이스 · BGM', eyebrow: 'STEP 04', desc: 'AI 보이스로 미리듣고, 나레이션 파일을 얹으세요.' },
  lang: { title: '다국어', eyebrow: 'STEP 05', desc: '같은 디자인으로 언어만 바꿔 채널을 확장하세요.' },
  publish: { title: '내보내기', eyebrow: 'STEP 06', desc: '9:16 영상으로 굽고 업로드 체크리스트를 확인하세요.' }
};

function setStep(step, scroll = true) {
  state.step = step;
  $$('.step-item').forEach((b) => b.classList.toggle('is-active', b.dataset.step === step));
  $$('.panel').forEach((p) => p.classList.toggle('is-active', p.dataset.panel === step));
  const meta = STEP_META[step];
  els.panelTitle.textContent = meta.title;
  els.panelEyebrow.textContent = meta.eyebrow;
  els.panelDesc.textContent = meta.desc;
  if (step === 'publish') refreshMeta();
  if (step === 'lang') renderLangList();
  const body = $('.inspector-body');
  if (body) body.scrollTop = 0;
  if (scroll && window.innerWidth <= 980) {
    $('.inspector')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/* ============================================================
   SAVE / LOAD
   ============================================================ */
let saveTimer;
function saveLater() {
  clearTimeout(saveTimer);
  $('#saveState').textContent = '저장 중…';
  saveTimer = setTimeout(() => {
    syncCurrentLang();
    const data = {
      v: 2, name: state.name, lang: state.lang, title: state.title, design: state.design,
      bg: { ...state.bg, el: undefined, images: [] },
      audio: { ...state.audio, voiceURL: null, bgmURL: null },
      langs: state.langs
    };
    store.set('shortcut-project', JSON.stringify(data));
    $('#saveState').textContent = '임시 저장됨';
  }, 500);
}

function restoreProject() {
  const raw = store.get('shortcut-project');
  if (!raw) return false;
  try {
    const d = JSON.parse(raw);
    if (!d || !d.langs) return false;
    state.name = d.name || state.name;
    state.title = d.title || '';
    state.design = { ...state.design, ...d.design };
    state.bg = { ...state.bg, ...d.bg, el: null, mediaURL: null };
    state.bg.mode = 'preset';
    state.audio = { ...state.audio, ...d.audio, voiceURL: null, bgmURL: null };
    state.langs = d.langs;
    state.lang = d.lang || 'ko';
    const l = currentLangObj();
    state.script = l.script || SAMPLE_SCRIPT;
    state.hook = l.hook || state.hook;
    state.captions = (l.captions || []).map((c) => ({ ...c }));
    return state.captions.length > 0;
  } catch { return false; }
}

/* ============================================================
   BINDINGS
   ============================================================ */
function bind() {
  // steps
  $$('.step-item').forEach((b) => b.addEventListener('click', () => setStep(b.dataset.step)));

  // project name
  $('#projectName').addEventListener('input', (e) => {
    state.name = e.target.value || '제목 없는 쇼츠';
    saveLater();
  });

  // play / scrub
  els.playBtn.addEventListener('click', togglePlay);
  els.scrubWrap.addEventListener('click', (e) => {
    const r = els.scrubWrap.getBoundingClientRect();
    seek(((e.clientX - r.left) / r.width) * totalDuration());
  });
  $('#resetPlayBtn').addEventListener('click', () => { pause(); seek(0); });
  $('#toggleSafeBtn').addEventListener('click', (e) => {
    const on = $('#safeArea').classList.toggle('on');
    e.currentTarget.setAttribute('aria-pressed', String(on));
  });
  $('#muteBtn').addEventListener('click', (e) => {
    state.audio.muted = !state.audio.muted;
    e.currentTarget.setAttribute('aria-pressed', String(state.audio.muted));
    applyAudioVolumes();
    if (state.audio.muted && 'speechSynthesis' in window) speechSynthesis.cancel();
  });

  // source
  const drop = $('#mediaDrop');
  const input = $('#mediaInput');
  drop.addEventListener('click', () => input.click());
  input.addEventListener('change', (e) => { loadMediaFiles(e.target.files); input.value = ''; });
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
  drop.addEventListener('drop', (e) => {
    loadMediaFiles(e.dataTransfer.files);
  });
  $('#addSlideBtn').addEventListener('click', () => input.click());
  $('#clearSlidesBtn').addEventListener('click', () => {
    state.bg.images = [];
    state.bg.mode = 'preset';
    renderSlides();
    renderPreview();
    saveLater();
  });
  $('#kentRange').addEventListener('input', (e) => {
    state.bg.ken = Number(e.target.value);
    $('#kentOut').textContent = state.bg.ken + '%';
    renderPreview();
    saveLater();
  });
  $('#removeMedia').addEventListener('click', () => {
    state.bg.mode = 'preset';
    state.bg.el = null;
    state.bg.mediaURL = null;
    state.bg.images = [];
    $('#fileRow').hidden = true;
    $('#mediaInput').value = '';
    renderSlides();
    renderBgGrid();
    renderPreview();
    saveLater();
  });

  $('#dimRange').addEventListener('input', (e) => {
    state.bg.dim = Number(e.target.value);
    $('#dimOut').textContent = state.bg.dim + '%';
    renderPreview(); saveLater();
  });
  $('#blurRange').addEventListener('input', (e) => {
    state.bg.blur = Number(e.target.value);
    $('#blurOut').textContent = state.bg.blur + 'px';
    renderPreview(); saveLater();
  });
  $('#grainToggle').addEventListener('change', (e) => { state.bg.grain = e.target.checked; renderPreview(); saveLater(); });
  $('#vignetteToggle').addEventListener('change', (e) => { state.bg.vignette = e.target.checked; renderPreview(); saveLater(); });

  // script
  $('#titleInput').addEventListener('input', (e) => {
    state.title = e.target.value;
    $('#titleCount').textContent = `${e.target.value.length} / 24`;
    if (e.target.value && !state.design.showTitle) {
      state.design.showTitle = true;
      $('#showTitle').checked = true;
    }
    renderPreview();
    saveLater();
  });
  $('#movieSampleBtn').addEventListener('click', () => {
    applyTemplate('movie');
    state.title = MOVIE_TITLE_PRESETS[0];
    state.hook = '내가 30년 동안 산 세상이 전부 촬영장이었다';
    state.script = MOVIE_SCRIPT;
    els.scriptInput.value = MOVIE_SCRIPT;
    els.hookInput.value = state.hook;
    $('#titleInput').value = state.title;
    $('#titleCount').textContent = `${state.title.length} / 24`;
    $('#hookCount').textContent = `${state.hook.length} / 40`;
    state.design.showTitle = true;
    state.design.showHook = false;
    $('#showTitle').checked = true;
    $('#showHook').checked = false;
    doSplit(true);
  });
  $('#aiGenBtn').addEventListener('click', generateScript);
  $('#aiTopic').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); generateScript(); }
  });
  $('#showTitle').addEventListener('change', (e) => {
    state.design.showTitle = e.target.checked;
    if (e.target.checked && !state.title) toast('상단 타이틀 문구를 입력해 주세요');
    designChanged();
  });
  $('#hookInput').addEventListener('input', (e) => {
    state.hook = e.target.value;
    $('#hookCount').textContent = `${e.target.value.length} / 40`;
    renderPreview(); saveLater();
    renderTplGrid();
    queueFontSync();
  });
  $('#scriptInput').addEventListener('input', (e) => {
    state.script = e.target.value;
    saveLater();
  });
  $('#splitBtn').addEventListener('click', () => doSplit(false));
  $('#oneClickBtn').addEventListener('click', () => doSplit(true));
  $('#sampleScriptBtn').addEventListener('click', () => {
    state.script = SAMPLE_SCRIPT;
    els.scriptInput.value = SAMPLE_SCRIPT;
    $('#hookInput').value = state.hook = '99%가 모르는 정리 습관';
    $('#hookCount').textContent = `${state.hook.length} / 40`;
    doSplit(true);
  });
  $('#addCapBtn').addEventListener('click', () => {
    const idx = state.captions.length;
    state.captions.push({ text: '새 자막을 입력하세요', dur: 2 });
    state.selected = idx;
    renderAll();
    const items = $$('.cap-item textarea');
    items[items.length - 1]?.focus();
  });
  $('#clearCapsBtn').addEventListener('click', () => {
    state.captions = [];
    renderAll();
    toast('자막을 비웠습니다');
  });

  // design
  $('#fontSelect').addEventListener('change', (e) => {
    state.design.font = e.target.value;
    designChanged();
  });
  $('#fontSize').addEventListener('input', (e) => {
    state.design.size = Number(e.target.value);
    $('#fontSizeOut').textContent = state.design.size;
    designChanged(true);
  });
  ['textColor', 'accentColor', 'boxColor'].forEach((id) => {
    $('#' + id).addEventListener('input', (e) => {
      state.design[id] = e.target.value;
      designChanged();
      if (id === 'accentColor') renderMoodRow();
    });
  });
  $('#alignSelect').addEventListener('change', (e) => { state.design.align = e.target.value; designChanged(); });
  $('#animSelect').addEventListener('change', (e) => { state.design.anim = e.target.value; designChanged(); });
  $('#hookStyle').addEventListener('change', (e) => { state.design.hookStyle = e.target.value; designChanged(); });
  $$('#posSeg button').forEach((b) => b.addEventListener('click', () => {
    state.design.pos = b.dataset.pos;
    $$('#posSeg button').forEach((x) => x.classList.toggle('is-on', x === b));
    designChanged();
  }));
  [['capBox', 'capBox'], ['capStroke', 'stroke'], ['progressBar', 'progressBar'], ['showHook', 'showHook']].forEach(([id, key]) => {
    $('#' + id).addEventListener('change', (e) => { state.design[key] = e.target.checked; designChanged(); });
  });
  if ($('#emphSelect')) $('#emphSelect').addEventListener('change', (e) => {
    state.design.emph = e.target.value;
    designChanged();
  });
  $('#watermark').addEventListener('input', (e) => { state.design.watermark = e.target.value; renderPreview(); saveLater(); });

  // audio
  $('#voiceSelect').addEventListener('change', (e) => {
    state.audio.voiceURI = e.target.value;
    saveLater();
  });
  $('#ttsRate').addEventListener('input', (e) => {
    state.audio.rate = Number(e.target.value);
    $('#ttsRateOut').textContent = state.audio.rate.toFixed(2) + 'x';
    saveLater();
  });
  $('#ttsFollow').addEventListener('change', (e) => {
    state.audio.follow = e.target.checked;
    if (!e.target.checked && 'speechSynthesis' in window) speechSynthesis.cancel();
    saveLater();
  });
  $('#speakCurrentBtn').addEventListener('click', () => {
    const cap = state.captions[activeCaptionIndex(t)];
    if (cap) speak(cap.text);
    else toast('자막이 없습니다');
  });
  $('#voiceInput').addEventListener('change', (e) => loadAudio('voice', e.target.files[0]));
  $('#bgmInput').addEventListener('change', (e) => loadAudio('bgm', e.target.files[0]));
  $('#voiceVol').addEventListener('input', (e) => {
    state.audio.voiceVol = Number(e.target.value) / 100;
    $('#voiceVolOut').textContent = e.target.value + '%';
    applyAudioVolumes(); saveLater();
  });
  $('#bgmVol').addEventListener('input', (e) => {
    state.audio.bgmVol = Number(e.target.value) / 100;
    $('#bgmVolOut').textContent = e.target.value + '%';
    applyAudioVolumes(); saveLater();
  });
  $('#voiceDrop').addEventListener('click', () => $('#voiceInput').click());
  $('#bgmDrop').addEventListener('click', () => $('#bgmInput').click());

  // lang
  $('#addLangBtn').addEventListener('click', addLang);
  $('#langScript').addEventListener('input', (e) => {
    currentLangObj().script = e.target.value;
    saveLater();
  });
  $('#langHook').addEventListener('input', (e) => {
    currentLangObj().hook = e.target.value;
    if (state.lang === currentLangObj().code) {
      state.hook = e.target.value;
      $('#hookInput').value = e.target.value;
      $('#hookCount').textContent = `${e.target.value.length} / 40`;
      renderPreview();
    }
    saveLater();
  });
  $('#applyLangBtn').addEventListener('click', () => {
    const l = currentLangObj();
    const text = $('#langScript').value.trim();
    if (!text) { toast('대본을 먼저 붙여넣어 주세요'); return; }
    l.script = text;
    l.hook = $('#langHook').value.trim();
    l.captions = splitScript(text, Number($('#maxChars').value));
    if (state.lang === currentLangObj().code) {
      state.script = text;
      state.hook = l.hook;
      state.captions = l.captions.map((c) => ({ ...c }));
      state.selected = 0;
      els.scriptInput.value = text;
      els.hookInput.value = l.hook;
      $('#hookCount').textContent = `${(l.hook || '').length} / 40`;
      t = 0;
    }
    renderAll();
    renderLangList();
    queueFontSync();
    toast(`${l.label} 자막 ${l.captions.length}개 생성`);
  });

  // publish
  $('#exportBtn').addEventListener('click', exportVideo);
  $('#exportTopBtn').addEventListener('click', () => { setStep('publish'); setTimeout(exportVideo, 280); });
  $('#srtBtn').addEventListener('click', () => {
    downloadBlob(new Blob([buildSRT()], { type: 'text/plain;charset=utf-8' }), slug(state.name) + '-' + state.lang + '.srt');
    toast('SRT 자막을 저장했습니다');
  });
  $('#jsonBtn').addEventListener('click', exportJSON);
  $('#copyScriptBtn').addEventListener('click', () => copyText(state.captions.map((c) => c.text).join('\n')));
  $('#copyMetaBtn').addEventListener('click', () => copyText(`[제목]\n${$('#metaTitle').value}\n\n[설명]\n${$('#metaDesc').value}`));
  $('#regenMetaBtn').addEventListener('click', refreshMeta);

  $$('#uploadChecks input').forEach((cb) => cb.addEventListener('change', updateCheckCount));
  $('#cancelExport').addEventListener('click', cancelExport);
  $('#cancelExportBtn').addEventListener('click', cancelExport);
  $('#finishExport').addEventListener('click', closeExport);
  $('#closeExportModal').addEventListener('click', cancelExport);

  // help
  $('#helpBtn').addEventListener('click', () => { $('#helpModal').hidden = false; });
  $('#closeHelpModal').addEventListener('click', () => { $('#helpModal').hidden = true; });
  $('#helpStartBtn').addEventListener('click', () => { $('#helpModal').hidden = true; setStep('script'); $('#scriptInput').focus(); });
  $('#helpModal').addEventListener('click', (e) => { if (e.target.id === 'helpModal') e.target.hidden = true; });
  // exporting is not cancelled by an accidental backdrop click

  // save project
  $('#saveProjectBtn').addEventListener('click', exportJSON);

  // keyboard
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    if (e.code === 'ArrowRight') {
      const i = activeCaptionIndex(t);
      seek(captionStart(Math.min(state.captions.length - 1, i + 1)));
    }
    if (e.code === 'ArrowLeft') {
      const i = activeCaptionIndex(t);
      seek(captionStart(Math.max(0, i - 1)));
    }
  });

  // hooks
  const hp = $('#hookPresets');
  HOOK_PRESETS.forEach((h) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = h;
    b.addEventListener('click', () => {
      state.hook = h;
      $('#hookInput').value = h;
      $('#hookCount').textContent = `${h.length} / 40`;
      renderPreview(); renderTplGrid(); saveLater();
    });
    hp.append(b);
  });

  // resize guard for canvas context
  window.addEventListener('resize', renderPreview);
}

function designChanged(sizeOnly = false) {
  layoutCache.key = '';
  if (!sizeOnly) renderTplGrid();
  renderPreview();
  saveLater();
}

function updateCheckCount() {
  const boxes = $$('#uploadChecks input');
  const n = boxes.filter((b) => b.checked).length;
  $('#checkCount').textContent = `${n} / ${boxes.length}`;
}

function doSplit(oneClick) {
  const text = els.scriptInput.value.trim() || state.script;
  if (!text) { toast('대본을 먼저 입력해 주세요'); return; }
  state.script = text;
  state.captions = splitScript(text, Number($('#maxChars').value));
  state.selected = 0;
  t = 0;
  lastActiveIdx = -1;
  renderAll();
  queueFontSync();
  if (oneClick) {
    toast(`자막 ${state.captions.length}개 · ${round1(totalDuration())}초 완성`);
    setTimeout(() => { play(); }, 260);
  } else {
    toast(`${state.captions.length}개 자막으로 분할했습니다`);
  }
}

/* ============================================================
   INIT
   ============================================================ */
async function init() {
  bind();
  renderBgGrid();
  renderTplGrid();
  initFormatLabel();

  const restored = restoreProject();
  if (!restored) {
    state.captions = splitScript(state.script, 16);
    state.langs[0].captions = state.captions.map((c) => ({ ...c }));
  }

  $('#projectName').value = state.name;
  els.scriptInput.value = state.script;
  els.hookInput.value = state.hook;
  $('#hookCount').textContent = `${state.hook.length} / 40`;
  $('#titleInput').value = state.title || '';
  $('#titleCount').textContent = `${(state.title || '').length} / 24`;
  $('#showTitle').checked = Boolean(state.design.showTitle);
  if ($('#aiApi')) $('#aiApi').value = aiApiUrl();
  renderMoodRow();
  renderTitlePresets();
  renderSlides();
  $('#dimRange').value = state.bg.dim;
  $('#dimOut').textContent = state.bg.dim + '%';
  $('#blurRange').value = state.bg.blur;
  $('#blurOut').textContent = state.bg.blur + 'px';
  $('#grainToggle').checked = state.bg.grain;
  $('#vignetteToggle').checked = state.bg.vignette;
  $('#ttsRate').value = state.audio.rate;
  $('#ttsRateOut').textContent = state.audio.rate.toFixed(2) + 'x';
  $('#ttsFollow').checked = state.audio.follow;
  $('#voiceVol').value = Math.round(state.audio.voiceVol * 100);
  $('#bgmVol').value = Math.round(state.audio.bgmVol * 100);
  $('#voiceVolOut').textContent = Math.round(state.audio.voiceVol * 100) + '%';
  $('#bgmVolOut').textContent = Math.round(state.audio.bgmVol * 100) + '%';
  applyAudioVolumes();

  // preload caption fonts for canvas
  try {
    const sample = state.captions.map((c) => c.text).join(' ') + ' ' + state.hook +
      ' 이게 진짜 방법 3초 만에 HOOK ABC 0123';
    await Promise.all([
      syncFontsForText(sample),
      document.fonts.load('800 40px "Pretendard Variable"', sample),
      document.fonts.load('600 28px "Pretendard Variable"', sample),
      document.fonts.ready
    ]);
    layoutCache.key = '';
    renderTplGrid();
  } catch {}

  updateDesignUI();
  renderAll();
  renderLangList();
  loadVoices();
  setStep('script', false);
  refreshMeta();
  updateCheckCount();

  // first-visit hint
  if (!store.get('shortcut-visited')) {
    store.set('shortcut-visited', '1');
  }
}

init();
})();
