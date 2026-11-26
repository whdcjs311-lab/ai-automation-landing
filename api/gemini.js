// LOOK AI · 무료 AI 서버 (Vercel Serverless Function)
// 브라우저가 Gemini API 키 없이도 진짜 AI 분석·코디 이미지 생성을 쓰도록 대신 호출하는 프록시입니다.
// 키는 오직 환경변수 process.env.GEMINI_API_KEY 에서만 읽습니다. 코드·응답·로그에 키를 남기지 않습니다.

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-3.8-flash";

// look/index.html 이 쓰는 모델만 통과 (그 외 모델은 과금·오남용 방지를 위해 차단)
// 2026-11 기준 Gemini 모델 코드이며, 앞의 5개가 무료 티어 텍스트·이미지 분석 모델입니다.
const ALLOWED_MODELS = new Set([
  "gemini-3.8-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3-flash-preview",
  "gemini-3.1-pro-preview",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  // 이미지 생성 계열(유료 티어 전용)
  "gemini-3.1-flash-image",
  "gemini-3.1-flash-lite-image",
  "gemini-3-pro-image",
  "gemini-2.5-flash-image",
  "gemini-2.5-flash-image-preview",
]);

// 브라우저가 보낸 본문 중 Google API 로 넘길 필드만 골라 전달
const FIELDS = [
  "contents",
  "systemInstruction",
  "system_instruction",
  "generationConfig",
  "generation_config",
  "safetySettings",
  "safety_settings",
  "tools",
  "toolConfig",
  "tool_config",
];

const MAX_BODY_BYTES = 4 * 1024 * 1024; // Vercel 요청 한도(4.5MB) 이내
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 40; // 같은 인스턴스에서 IP 당 1분 40회 (따뜻한 인스턴스 기준 완만한 보호)

const hits = new Map();

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

function cors(req, res) {
  const origin = req.headers.origin;
  const host = req.headers.host || "";
  let allow = null;
  if (!origin) {
    allow = "*"; // 같은 출처·비브라우저 요청
  } else {
    try {
      const u = new URL(origin);
      const extra = String(process.env.ALLOWED_ORIGINS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (u.host === host) allow = origin;
      else if (extra.includes(u.origin)) allow = origin;
      else if (
        ["github.io", "vercel.app", "localhost", "127.0.0.1"].some(
          (h) => u.hostname === h || u.hostname.endsWith("." + h)
        )
      )
        allow = origin;
    } catch (e) {
      allow = null;
    }
  }
  if (allow) {
    res.setHeader("Access-Control-Allow-Origin", allow);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function clientIp(req) {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || (req.socket && req.socket.remoteAddress) || "";
}

function overRate(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 1000) hits.clear();
  return list.length > RATE_LIMIT;
}

function parseBody(req) {
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      return null;
    }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  return body;
}

function pickModel(raw) {
  const model = String(raw || DEFAULT_MODEL)
    .trim()
    .replace(/:generateContent$/, "");
  return ALLOWED_MODELS.has(model) ? model : null;
}

// 요청 본문에서 허용 필드만 복사 (key, url 같은 임의 필드가 새어 나가지 않게)
function upstreamBody(payload) {
  const out = {};
  for (const k of FIELDS) {
    if (payload[k] !== undefined) out[k] = payload[k];
  }
  if (!Array.isArray(out.contents) || !out.contents.length) return null;
  return out;
}

export default async function handler(req, res) {
  cors(req, res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  // 헬스체크 · 앱이 이 응답을 보고 "무료 AI 서버 사용 가능" 여부를 판단합니다.
  if (req.method === "GET") {
    return send(res, 200, {
      ok: true,
      configured: Boolean(process.env.GEMINI_API_KEY),
      models: Array.from(ALLOWED_MODELS),
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return send(res, 405, { ok: false, error: "method_not_allowed" });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return send(res, 503, {
      ok: false,
      configured: false,
      error: "not_configured",
      message: "GEMINI_API_KEY 환경변수가 설정되지 않았습니다.",
    });
  }

  const ip = clientIp(req);
  if (overRate(ip)) {
    return send(res, 429, { ok: false, error: "too_many_requests" });
  }

  const raw =
    typeof req.body === "string"
      ? req.body
      : req.body
      ? JSON.stringify(req.body)
      : "";
  if (raw.length > MAX_BODY_BYTES) {
    return send(res, 413, { ok: false, error: "payload_too_large" });
  }

  const payload = parseBody(req);
  if (!payload) {
    return send(res, 400, { ok: false, error: "invalid_json" });
  }

  const model = pickModel(payload.model);
  if (!model) {
    return send(res, 400, {
      ok: false,
      error: "model_not_allowed",
      message: "허용되지 않은 모델입니다.",
    });
  }

  const body = upstreamBody(payload);
  if (!body) {
    return send(res, 400, { ok: false, error: "invalid_contents" });
  }

  const url = `${API_BASE}/${encodeURIComponent(model)}:generateContent`;
  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(55000),
    });

    const text = await upstream.text();
    res.statusCode = upstream.status;
    res.setHeader(
      "Content-Type",
      upstream.headers.get("content-type") || "application/json; charset=utf-8"
    );
    res.setHeader("Cache-Control", "no-store");
    return res.end(text);
  } catch (e) {
    const timeout = e && (e.name === "TimeoutError" || e.name === "AbortError");
    return send(res, timeout ? 504 : 502, {
      ok: false,
      error: timeout ? "upstream_timeout" : "upstream_failed",
    });
  }
}
