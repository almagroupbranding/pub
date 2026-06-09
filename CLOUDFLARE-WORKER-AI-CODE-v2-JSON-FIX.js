/**
 * The Alma AI Admin + Function Enquiry Worker
 * Cloudflare Workers AI version — no OpenAI API key needed.
 *
 * Required Cloudflare binding:
 * - Workers AI binding named AI
 *
 * Required secrets:
 * - ADMIN_PASSWORD
 * - SESSION_SECRET
 * - GITHUB_TOKEN
 * - RESEND_API_KEY optional, only needed for function enquiry email
 *
 * Required variables:
 * - SITE_ORIGIN = https://almagroupbranding.github.io
 * - GITHUB_OWNER = almagroupbranding
 * - GITHUB_REPO = pub
 * - GITHUB_BRANCH = main
 * - OWNER_EMAIL = info@thealmapub.co.uk
 * - FROM_EMAIL = The Alma <events@your-verified-domain.co.uk>
 * - CLOUDFLARE_AI_MODEL = @cf/meta/llama-3.1-8b-instruct-fast
 */

const JSON_HEADERS = {"Content-Type": "application/json; charset=utf-8"};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return corsResponse(request, env);

    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/health") {
        return withCors(json({
          ok: true,
          worker: "alma-ai-admin",
          aiBinding: Boolean(env.AI),
          model: env.CLOUDFLARE_AI_MODEL || "@cf/meta/llama-3.1-8b-instruct-fast"
        }), request, env);
      }

      if (url.pathname === "/api/login" && request.method === "POST") return withCors(await login(request, env), request, env);
      if (url.pathname === "/api/logout" && request.method === "POST") return withCors(await logout(), request, env);

      if (url.pathname === "/api/admin/draft-update" && request.method === "POST") {
        await requireAdmin(request, env);
        return withCors(await draftUpdate(request, env), request, env);
      }

      if (url.pathname === "/api/admin/publish-update" && request.method === "POST") {
        await requireAdmin(request, env);
        return withCors(await publishUpdate(request, env), request, env);
      }

      if (url.pathname === "/api/function-chat" && request.method === "POST") {
        return withCors(await functionChat(request, env), request, env);
      }

      return withCors(json({error: "Not found"}, 404), request, env);
    } catch (err) {
      return withCors(json({error: err.message || "Server error"}, err.status || 500), request, env);
    }
  }
};

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {status, headers: {...JSON_HEADERS, ...headers}});
}

function corsResponse(request, env) {
  return new Response(null, {status: 204, headers: corsHeaders(request, env)});
}

function withCors(response, request, env) {
  const headers = new Headers(response.headers);
  Object.entries(corsHeaders(request, env)).forEach(([k, v]) => headers.set(k, v));
  return new Response(response.body, {status: response.status, headers});
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.SITE_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);
  const allowOrigin = allowed.includes(origin) ? origin : (allowed[0] || "*");
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

async function login(request, env) {
  const body = await request.json();
  if (!body.password || body.password !== env.ADMIN_PASSWORD) {
    return json({error: "Invalid password"}, 401);
  }

  const expires = Math.floor(Date.now() / 1000) + 60 * 60 * 8;
  const token = await signSession({sub: "admin", exp: expires}, env.SESSION_SECRET);
  return json({ok: true}, 200, {
    "Set-Cookie": `alma_admin=${token}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${60 * 60 * 8}`
  });
}

async function logout() {
  return json({ok: true}, 200, {"Set-Cookie": "alma_admin=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0"});
}

async function requireAdmin(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\s*)alma_admin=([^;]+)/);
  if (!match) throw Object.assign(new Error("Not authorised"), {status: 401});

  const payload = await verifySession(match[1], env.SESSION_SECRET);
  if (!payload || payload.sub !== "admin" || payload.exp < Math.floor(Date.now() / 1000)) {
    throw Object.assign(new Error("Session expired"), {status: 401});
  }
  return payload;
}

async function signSession(payload, secret) {
  const enc = new TextEncoder();
  const body = b64url(JSON.stringify(payload));
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), {name: "HMAC", hash: "SHA-256"}, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return `${body}.${b64urlBytes(new Uint8Array(sig))}`;
}

async function verifySession(token, secret) {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = await signSession(JSON.parse(atobUrl(body)), secret);
  const expectedSig = expected.split(".")[1];
  if (!safeEqual(sig, expectedSig)) return null;
  return JSON.parse(atobUrl(body));
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function b64url(str) {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlBytes(bytes) {
  let bin = "";
  bytes.forEach(b => bin += String.fromCharCode(b));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function atobUrl(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  return decodeURIComponent(escape(atob(str)));
}

async function draftUpdate(request, env) {
  const {type, prompt} = await request.json();
  if (!["event", "news"].includes(type)) throw Object.assign(new Error("Invalid update type"), {status: 400});
  if (!prompt || prompt.length < 5) throw Object.assign(new Error("Add a fuller instruction"), {status: 400});

  const schema = type === "event"
    ? `{"type":"event","payload":{"date":"YYYY-MM-DD","title":"Short title","type":"Event category","summary":"Warm Alma-style summary under 28 words","cta":"Button text"},"social_caption":"Short social caption"}`
    : `{"type":"news","payload":{"date":"YYYY-MM-DD","title":"Short title","summary":"Warm Alma-style news update under 35 words"},"social_caption":"Short social caption"}`;

  const messages = [
    {role: "system", content: `You are a JSON API. Return JSON only. No explanation. No markdown. No code fences. You write concise website updates for The Alma, a traditional Sidcup pub. Tone: warm, old-school, local, clear, not corporate. Output must match this exact shape: ${schema}`},
    {role: "user", content: `Today is ${new Date().toISOString().slice(0,10)}. Create this ${type} update from this instruction: ${prompt}`}
  ];

  const ai = await runCloudflareAI(env, messages);

  let parsed;
  try {
    parsed = parseJsonFromText(ai);
  } catch (err) {
    // Cloudflare free models sometimes answer in prose. This fallback keeps the tool usable.
    parsed = localDraftFallback(type, prompt);
    parsed.warning = "AI did not return clean JSON, so a safe local draft was created. Please check it before publishing.";
  }

  parsed.type = type;
  parsed.payload = normaliseDraftPayload(type, parsed.payload || {}, prompt);
  parsed.social_caption = parsed.social_caption || makeSocialCaption(parsed.payload);
  return json(parsed);
}


function normaliseDraftPayload(type, payload, originalPrompt) {
  const today = new Date().toISOString().slice(0,10);
  if (type === "event") {
    return {
      date: payload.date || inferDate(originalPrompt) || today,
      title: payload.title || inferTitle(originalPrompt) || "Event at The Alma",
      type: payload.type || inferEventType(originalPrompt) || "Event",
      summary: payload.summary || makeEventSummary(originalPrompt),
      cta: payload.cta || "Join us"
    };
  }
  return {
    date: payload.date || today,
    title: payload.title || inferTitle(originalPrompt) || "News from The Alma",
    summary: payload.summary || makeNewsSummary(originalPrompt)
  };
}

function localDraftFallback(type, prompt) {
  const payload = normaliseDraftPayload(type, {}, prompt);
  return {
    type,
    payload,
    social_caption: makeSocialCaption(payload)
  };
}

function inferTitle(prompt) {
  const p = String(prompt || "").toLowerCase();
  if (p.includes("karaoke")) return "Karaoke Night";
  if (p.includes("quiz")) return "Pub Quiz Night";
  if (p.includes("dj")) return "Friday Night DJ";
  if (p.includes("comedy")) return "Comedy Night";
  if (p.includes("carvery")) return "Carvery at The Alma";
  if (p.includes("singer") || p.includes("singalong")) return "Live Singing at The Alma";
  return "";
}

function inferEventType(prompt) {
  const p = String(prompt || "").toLowerCase();
  if (p.includes("karaoke")) return "Karaoke";
  if (p.includes("quiz")) return "Quiz";
  if (p.includes("dj") || p.includes("singer") || p.includes("music")) return "Music";
  if (p.includes("comedy")) return "Entertainment";
  if (p.includes("carvery") || p.includes("food")) return "Food";
  return "Event";
}

function inferDate(prompt) {
  // Keep it simple and safe: if no exact YYYY-MM-DD is given, use today's date.
  // The owner can edit the date before publishing.
  const match = String(prompt || "").match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  return match ? match[0] : "";
}

function makeEventSummary(prompt) {
  const type = inferEventType(prompt);
  const lower = String(prompt || "").toLowerCase();
  let time = "";
  const timeMatch = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (timeMatch) time = ` from ${timeMatch[0]}`;
  if (type === "Karaoke") return `Join us for a proper Alma karaoke night${time}. Free entry, warm atmosphere and plenty of familiar faces.`;
  if (type === "Quiz") return `Join us for a lively Alma quiz night${time}. Bring a team, settle in and enjoy a proper local evening.`;
  if (type === "Music") return `Enjoy a proper Alma music night${time}. Good company, familiar faces and a warm local atmosphere.`;
  if (type === "Food") return `Join us for a special food event at The Alma. Booking is recommended so the kitchen can plan properly.`;
  return `Join us at The Alma for a warm local event with good company and a proper pub atmosphere.`;
}

function makeNewsSummary(prompt) {
  return `A quick update from The Alma: ${String(prompt || "").replace(/\s+/g, " ").slice(0, 140)}.`;
}

function makeSocialCaption(payload) {
  if (!payload) return "";
  if (payload.type === "Karaoke" || String(payload.title || "").toLowerCase().includes("karaoke")) {
    return "Karaoke is back at The Alma. Come down, grab a drink and enjoy a proper local night with us.";
  }
  return `${payload.title || "News from The Alma"} — ${payload.summary || "Join us at The Alma."}`;
}


async function publishUpdate(request, env) {
  const {type, payload} = await request.json();
  if (!["event", "news"].includes(type)) throw Object.assign(new Error("Invalid update type"), {status: 400});
  if (!payload || !payload.title) throw Object.assign(new Error("Missing payload"), {status: 400});

  const path = type === "event" ? "content/events.json" : "content/news.json";
  const key = type === "event" ? "events" : "news";

  const file = await githubGet(env, path);
  const data = JSON.parse(file.content);
  data[key] = data[key] || [];
  data[key].unshift(payload);

  if (key === "events") data[key].sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const commit = await githubPut(env, path, JSON.stringify(data, null, 2) + "\n", file.sha, `AI ${type} update: ${payload.title}`);
  return json({ok: true, commit: commit.commit?.sha || commit.content?.sha || "created"});
}

async function functionChat(request, env) {
  const {messages = []} = await request.json();

  const publicEvents = await safeGetGithubJson(env, "content/events.json", {events: []});
  const availability = await safeGetGithubJson(env, "content/function-availability.json", {booked: [], pending: []});

  const system = `You are the function room enquiry assistant for The Alma, Sidcup.
Goal: collect enough information in no more than 3 assistant questions, then create an enquiry and trigger email.
Ask for: date, event type, guest count, rough timings, name/email/phone if missing.
Rules:
- The pub usually does not want 18th birthdays, children's parties, mostly under-21 events, or loud late-night party-style events. Politely say it may not be suitable and recommend phoning the pub if exceptional.
- Never confirm a booking. Say owner approval is required.
- Check date against this JSON. If date appears in booked or public events, suggest another date.
- When ready, return strict JSON only:
{"complete":true,"reply":"customer-facing reply","enquiry":{"date":"YYYY-MM-DD","event_type":"","guest_count":"","timings":"","name":"","email":"","phone":"","notes":"","suitability":"good|maybe-unsuitable","availability":"available|pending|booked|unknown"}}
- If not ready, return strict JSON only:
{"complete":false,"reply":"your next question"}
Availability JSON: ${JSON.stringify(availability)}
Public events JSON: ${JSON.stringify(publicEvents.events || [])}`;

  const formatted = [
    {role: "system", content: system},
    ...messages.slice(-8).map(m => ({role: m.role === "user" ? "user" : "assistant", content: String(m.content || "")}))
  ];

  const ai = await runCloudflareAI(env, formatted);
  const parsed = parseJsonFromText(ai);

  if (parsed.complete && parsed.enquiry) {
    await sendFunctionEmail(env, parsed.enquiry);
    return json({complete: true, reply: parsed.reply || "Thank you. Your enquiry has been sent for owner approval.", note: "Enquiry sent for owner approval."});
  }

  return json({complete: false, reply: parsed.reply || "Could you tell me the date, event type and rough guest numbers?"});
}

async function runCloudflareAI(env, messages) {
  if (!env.AI) throw Object.assign(new Error("Workers AI binding missing. Add a Workers AI binding named AI in Cloudflare."), {status: 500});

  const model = env.CLOUDFLARE_AI_MODEL || "@cf/meta/llama-3.1-8b-instruct-fast";
  const result = await env.AI.run(model, {
    messages,
    max_tokens: 900,
    temperature: 0.35
  });

  if (typeof result === "string") return result;
  if (result.response) return result.response;
  if (result.result?.response) return result.result.response;
  if (result.text) return result.text;
  return JSON.stringify(result);
}

function parseJsonFromText(text) {
  const raw = String(text || "").trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try { return JSON.parse(raw); } catch (_) {}

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const candidate = raw.slice(start, end + 1);
    try { return JSON.parse(candidate); } catch (_) {}
  }

  throw new Error("AI did not return usable JSON. Try again with a clearer instruction.");
}

async function githubGet(env, path) {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}?ref=${env.GITHUB_BRANCH || "main"}`;
  const res = await fetch(url, {headers: githubHeaders(env)});
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `GitHub get failed for ${path}`);
  return {sha: data.sha, content: decodeBase64Utf8(data.content || "")};
}

async function safeGetGithubJson(env, path, fallback) {
  try {
    const file = await githubGet(env, path);
    return JSON.parse(file.content);
  } catch (_) {
    return fallback;
  }
}

async function githubPut(env, path, content, sha, message) {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: githubHeaders(env),
    body: JSON.stringify({
      message,
      content: encodeBase64Utf8(content),
      sha,
      branch: env.GITHUB_BRANCH || "main"
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `GitHub update failed for ${path}`);
  return data;
}

function githubHeaders(env) {
  return {
    "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "alma-ai-admin"
  };
}

function decodeBase64Utf8(content) {
  const bin = atob(content.replace(/\n/g, ""));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach(b => bin += String.fromCharCode(b));
  return btoa(bin);
}

async function sendFunctionEmail(env, enquiry) {
  const subject = `Function enquiry: ${enquiry.event_type || "The Alma"} — ${enquiry.date || "date TBC"}`;
  const text = Object.entries(enquiry).map(([k, v]) => `${k}: ${v}`).join("\n");

  if (!env.RESEND_API_KEY) {
    console.log("No RESEND_API_KEY. Enquiry would email:", text);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.FROM_EMAIL,
      to: [env.OWNER_EMAIL],
      subject,
      text
    })
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "Email failed");
  }
}
