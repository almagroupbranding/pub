/**
 * The Alma AI Admin + Function Enquiry Worker
 *
 * Security model:
 * - Admin publishing requires login with ADMIN_PASSWORD and a signed HttpOnly cookie.
 * - GitHub and OpenAI keys stay in Worker secrets, never in the public website.
 * - Customer function enquiry is public but only sends an email; it cannot publish to GitHub.
 *
 * Required secrets:
 * wrangler secret put ADMIN_PASSWORD
 * wrangler secret put SESSION_SECRET
 * wrangler secret put OPENAI_API_KEY
 * wrangler secret put GITHUB_TOKEN
 * wrangler secret put RESEND_API_KEY
 *
 * Required vars in wrangler.toml:
 * SITE_ORIGIN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH, OWNER_EMAIL, FROM_EMAIL
 */

const JSON_HEADERS = {"Content-Type": "application/json; charset=utf-8"};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return corsResponse(request, env);

    const url = new URL(request.url);
    try {
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
    ? `{"date":"YYYY-MM-DD","title":"Short title","type":"Event category","summary":"Warm Alma-style summary under 28 words","cta":"Button text"}`
    : `{"date":"YYYY-MM-DD","title":"Short title","summary":"Warm Alma-style news update under 35 words"}`;

  const ai = await openAI(env, [
    {role: "system", content: `You write concise website updates for The Alma, a traditional Sidcup pub. Tone: warm, old-school, local, clear, not corporate. Return strict JSON only with keys: type, payload, social_caption. payload must match this shape: ${schema}. If date is vague, infer a likely future date only if obvious, otherwise use today's date.`},
    {role: "user", content: `Update type: ${type}\nInstruction: ${prompt}\nToday: ${new Date().toISOString().slice(0,10)}`}
  ]);

  const parsed = parseJsonFromText(ai);
  parsed.type = type;
  return json(parsed);
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

  if (key === "events") {
    data[key].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }

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

  const ai = await openAI(env, formatted);
  const parsed = parseJsonFromText(ai);

  if (parsed.complete && parsed.enquiry) {
    await sendFunctionEmail(env, parsed.enquiry);
    return json({complete: true, reply: parsed.reply || "Thank you. Your enquiry has been sent for owner approval.", note: "Enquiry sent for owner approval."});
  }

  return json({complete: false, reply: parsed.reply || "Could you tell me the date, event type and rough guest numbers?"});
}

async function openAI(env, input) {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-4.1-mini",
      input,
      temperature: 0.4
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "OpenAI request failed");
  return data.output_text || data.output?.map(o => o.content?.map(c => c.text).join("")).join("\n") || "";
}

function parseJsonFromText(text) {
  try { return JSON.parse(text); } catch (_) {}
  const match = String(text).match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI did not return usable JSON");
  return JSON.parse(match[0]);
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
