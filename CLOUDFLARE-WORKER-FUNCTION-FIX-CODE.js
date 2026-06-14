/**
 * The Alma AI Admin + Gallery Manager Worker
 * Cloudflare Workers AI version — no OpenAI API key needed.
 *
 * Required Cloudflare binding:
 * - Workers AI binding named AI
 *
 * Required secrets:
 * - ADMIN_PASSWORD
 * - SESSION_SECRET
 * - GITHUB_TOKEN
 *
 * Optional for function enquiry emails:
 * - RESEND_API_KEY
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
          worker: "alma-ai-admin-gallery",
          aiBinding: Boolean(env.AI),
          hasGithubToken: Boolean(env.GITHUB_TOKEN),
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

      if (url.pathname === "/api/admin/gallery-list" && request.method === "GET") {
        await requireAdmin(request, env);
        return withCors(await galleryList(env), request, env);
      }

      if (url.pathname === "/api/admin/gallery-upload" && request.method === "POST") {
        await requireAdmin(request, env);
        return withCors(await galleryUpload(request, env), request, env);
      }

      if (url.pathname === "/api/admin/gallery-delete" && request.method === "POST") {
        await requireAdmin(request, env);
        return withCors(await galleryDelete(request, env), request, env);
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
  if (!match) throw Object.assign(new Error("Not authorised. Please sign in again."), {status: 401});

  const payload = await verifySession(match[1], env.SESSION_SECRET);
  if (!payload || payload.sub !== "admin" || payload.exp < Math.floor(Date.now() / 1000)) {
    throw Object.assign(new Error("Session expired. Please sign in again."), {status: 401});
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

/* ------------------------- AI updates ------------------------- */

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
    parsed = localDraftFallback(type, prompt);
    parsed.warning = "AI did not return clean JSON, so a safe local draft was created. Please check it before publishing.";
  }

  parsed.type = type;
  parsed.payload = normaliseDraftPayload(type, parsed.payload || {}, prompt);
  parsed.social_caption = parsed.social_caption || makeSocialCaption(parsed.payload);
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

  const exists = data[key].some(item =>
    String(item.title || "").toLowerCase() === String(payload.title || "").toLowerCase()
    && String(item.date || "") === String(payload.date || "")
  );
  if (!exists) data[key].unshift(payload);

  if (key === "events") data[key].sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const commit = await githubPut(env, path, JSON.stringify(data, null, 2) + "\n", file.sha, `AI ${type} update: ${payload.title}`);
  return json({ok: true, path, title: payload.title, commit: commit.commit?.sha || commit.content?.sha || "created"});
}

/* ------------------------- Gallery management ------------------------- */

async function galleryList(env) {
  const file = await githubGet(env, "content/gallery.json");
  const data = JSON.parse(file.content || "{}");
  const images = Array.isArray(data.images) ? data.images : [];
  return json({ok: true, images});
}

async function galleryUpload(request, env) {
  const body = await request.json();
  const {imageBase64, filename, caption, alt, aiHelp} = body;

  if (!imageBase64 || !imageBase64.includes(",")) {
    throw Object.assign(new Error("No image received. Choose a JPG, PNG or WebP image."), {status: 400});
  }

  const cleanCaption = String(caption || "").trim() || "The Alma";
  let cleanAlt = String(alt || "").trim();

  if (aiHelp && !cleanAlt) {
    cleanAlt = await draftAltText(env, cleanCaption);
  }
  if (!cleanAlt) cleanAlt = cleanCaption;

  const ext = ".jpg"; // Browser standardises to JPEG before upload.
  const safeName = slugify(filename || cleanCaption || "alma-gallery") + "-" + Date.now() + ext;
  const assetPath = `assets/images/gallery/${safeName}`;

  const base64 = imageBase64.split(",").pop();

  // Upload/commit image file
  await githubCreateOrUpdate(env, assetPath, base64, null, `Gallery image upload: ${cleanCaption}`, true);

  // Update gallery JSON
  const galleryPath = "content/gallery.json";
  const file = await githubGet(env, galleryPath);
  const data = JSON.parse(file.content || "{}");
  data.images = Array.isArray(data.images) ? data.images : [];

  const src = assetPath;
  data.images.unshift({
    src,
    alt: cleanAlt,
    label: cleanCaption
  });

  const commit = await githubPut(env, galleryPath, JSON.stringify(data, null, 2) + "\n", file.sha, `Gallery updated: ${cleanCaption}`);

  return json({
    ok: true,
    image: {src, alt: cleanAlt, label: cleanCaption},
    commit: commit.commit?.sha || commit.content?.sha || "created"
  });
}

async function galleryDelete(request, env) {
  const {src} = await request.json();
  if (!src) throw Object.assign(new Error("Missing image src"), {status: 400});

  const galleryPath = "content/gallery.json";
  const file = await githubGet(env, galleryPath);
  const data = JSON.parse(file.content || "{}");
  data.images = Array.isArray(data.images) ? data.images : [];

  const before = data.images.length;
  data.images = data.images.filter(img => img.src !== src);

  if (data.images.length === before) {
    throw Object.assign(new Error("Image was not found in gallery.json"), {status: 404});
  }

  const commit = await githubPut(env, galleryPath, JSON.stringify(data, null, 2) + "\n", file.sha, `Gallery image removed: ${src}`);

  // Optional: also delete the actual asset if it is in assets/images/gallery/
  if (String(src).startsWith("assets/images/gallery/")) {
    try {
      const asset = await githubGet(env, src);
      await githubDelete(env, src, asset.sha, `Gallery asset deleted: ${src}`);
    } catch (err) {
      // Do not fail if only JSON removal worked.
    }
  }

  return json({ok: true, removed: src, commit: commit.commit?.sha || commit.content?.sha || "updated"});
}

async function draftAltText(env, caption) {
  try {
    const ai = await runCloudflareAI(env, [
      {role: "system", content: "Write one concise, factual alt text sentence for a pub website image. Return plain text only. Do not invent visual details not provided."},
      {role: "user", content: `Caption/context: ${caption}`}
    ]);
    return String(ai || "").replace(/^["']|["']$/g, "").slice(0, 160);
  } catch (_) {
    return caption;
  }
}

/* ------------------------- Function enquiry ------------------------- */

async function functionChat(request, env) {
  const {messages = []} = await request.json();

  const publicEvents = await safeGetGithubJson(env, "content/events.json", {events: []});
  const availability = await safeGetGithubJson(env, "content/function-availability.json", {booked: [], pending: []});

  const userMessages = messages.filter(m => m.role === "user").map(m => String(m.content || ""));
  const allText = userMessages.join("\n");
  const info = extractFunctionInfo(allText);
  const dateStatus = checkFunctionDate(info.date, publicEvents.events || [], availability);

  const unsuitable = isUnsuitableEvent(allText);

  if (unsuitable) {
    return json({
      complete: true,
      reply: "Thank you for thinking of The Alma. This type of event may not be suitable for the function room, especially where it is an 18th, children’s party, mostly under-21 event or loud party-style booking. Please phone the pub if you believe this is an exception. No booking has been made.",
      note: "May not be suitable for The Alma."
    });
  }

  if (dateStatus.status === "booked") {
    return json({
      complete: false,
      reply: `That date looks unavailable because of ${dateStatus.reason}. Please send another preferred date, along with the event type and guest numbers.`,
      note: "Date appears unavailable."
    });
  }

  if (dateStatus.status === "pending") {
    return json({
      complete: false,
      reply: `That date is currently pending because of ${dateStatus.reason}. Please send another possible date, or confirm whether you would like The Alma to check this one manually.`,
      note: "Date is pending."
    });
  }

  const questionCount = messages.filter(m => m.role !== "user").length;

  const missing = [];
  if (!info.date) missing.push("preferred date");
  if (!info.event_type) missing.push("event type");
  if (!info.guest_count) missing.push("rough guest numbers");
  if (!info.timings && questionCount < 3) missing.push("rough timings");
  if ((!info.name || !info.email || !info.phone) && questionCount < 3) missing.push("name, email and phone number");

  if (missing.length && questionCount < 3) {
    return json({
      complete: false,
      reply: `Thanks. To send this properly for owner approval, please send your ${missing.slice(0, 3).join(", ")}.`,
      note: "Collecting enquiry details."
    });
  }

  const enquiry = {
    date: info.date || "TBC",
    event_type: info.event_type || "Private function enquiry",
    guest_count: info.guest_count || "TBC",
    timings: info.timings || "TBC",
    name: info.name || "TBC",
    email: info.email || "TBC",
    phone: info.phone || "TBC",
    notes: allText,
    suitability: "good",
    availability: dateStatus.status || "unknown"
  };

  await sendFunctionEmail(env, enquiry);

  return json({
    complete: true,
    reply: "Thank you. I’ve prepared this as a function room enquiry and sent it for owner approval. This does not confirm a booking — The Alma will review the details and come back to you.",
    note: "Enquiry sent for owner approval."
  });
}

function extractFunctionInfo(text) {
  const raw = String(text || "");
  const lower = raw.toLowerCase();

  return {
    date: extractDate(raw),
    event_type: extractEventType(lower),
    guest_count: extractGuestCount(lower),
    timings: extractTiming(lower),
    name: extractName(raw),
    email: extractEmail(raw),
    phone: extractPhone(raw)
  };
}

function extractDate(text) {
  const raw = String(text || "");
  const iso = raw.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return iso[0];

  const uk = raw.match(/\b(\d{1,2})[\/\-. ](\d{1,2})[\/\-. ](20\d{2})\b/);
  if (uk) {
    const d = uk[1].padStart(2, "0");
    const m = uk[2].padStart(2, "0");
    return `${uk[3]}-${m}-${d}`;
  }

  const monthNames = {
    january:"01", jan:"01", february:"02", feb:"02", march:"03", mar:"03",
    april:"04", apr:"04", may:"05", june:"06", jun:"06", july:"07", jul:"07",
    august:"08", aug:"08", september:"09", sept:"09", sep:"09", october:"10", oct:"10",
    november:"11", nov:"11", december:"12", dec:"12"
  };

  const m1 = raw.toLowerCase().match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+(20\d{2})\b/);
  if (m1) return `${m1[3]}-${monthNames[m1[2]].padStart(2,"0")}-${m1[1].padStart(2,"0")}`;

  const m2 = raw.toLowerCase().match(/\b(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(20\d{2})\b/);
  if (m2) return `${m2[3]}-${monthNames[m2[1]].padStart(2,"0")}-${m2[2].padStart(2,"0")}`;

  return "";
}

function extractEventType(lower) {
  if (lower.includes("birthday")) return lower.includes("40") ? "40th birthday" : "Birthday celebration";
  if (lower.includes("wake") || lower.includes("memorial")) return "Wake / memorial gathering";
  if (lower.includes("corporate") || lower.includes("meeting") || lower.includes("networking")) return "Corporate meeting / networking";
  if (lower.includes("engagement")) return "Engagement celebration";
  if (lower.includes("anniversary")) return "Anniversary celebration";
  if (lower.includes("private dining") || lower.includes("meal")) return "Private dining";
  if (lower.includes("party")) return "Private party";
  return "";
}

function extractGuestCount(lower) {
  const people = lower.match(/\b(\d{1,3})\s*(people|ppl|guests|guest|persons|person)\b/);
  if (people) return people[1];
  const around = lower.match(/\b(around|about|approx|approximately)\s*(\d{1,3})\b/);
  if (around) return around[2];
  return "";
}

function extractTiming(lower) {
  const time = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (time) return time[0];
  if (lower.includes("evening")) return "evening";
  if (lower.includes("afternoon")) return "afternoon";
  if (lower.includes("daytime")) return "daytime";
  return "";
}

function extractEmail(text) {
  const email = String(text || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return email ? email[0] : "";
}

function extractPhone(text) {
  const phone = String(text || "").match(/(?:\+44\s?7\d{3}|\(?07\d{3}\)?)[\s.-]?\d{3}[\s.-]?\d{3}/);
  return phone ? phone[0] : "";
}

function extractName(text) {
  const name = String(text || "").match(/\b(?:my name is|name is|i am|i'm)\s+([A-Za-z][A-Za-z\s'-]{1,40})/i);
  return name ? name[1].trim() : "";
}

function isUnsuitableEvent(text) {
  const lower = String(text || "").toLowerCase();
  return lower.includes("18th")
    || lower.includes("eighteenth")
    || lower.includes("children")
    || lower.includes("kids party")
    || lower.includes("childrens")
    || lower.includes("under 21")
    || lower.includes("under-21")
    || lower.includes("teen party")
    || lower.includes("teenage party");
}

function checkFunctionDate(date, events, availability) {
  if (!date) return {status: "unknown", reason: ""};

  const booked = (availability.booked || []).find(x => x.date === date);
  if (booked) return {status: "booked", reason: booked.reason || "a booked function"};

  const pending = (availability.pending || []).find(x => x.date === date);
  if (pending) return {status: "pending", reason: pending.reason || "a pending enquiry"};

  const publicEvent = (events || []).find(x => x.date === date);
  if (publicEvent) return {status: "booked", reason: publicEvent.title || "a public event"};

  return {status: "available", reason: ""};
}

/* ------------------------- AI helpers ------------------------- */

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
  return {type, payload, social_caption: makeSocialCaption(payload)};
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

/* ------------------------- GitHub helpers ------------------------- */

async function githubGet(env, path) {
  if (!env.GITHUB_TOKEN) throw Object.assign(new Error("GITHUB_TOKEN is missing in Cloudflare secrets."), {status: 500});

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
  return githubCreateOrUpdate(env, path, encodeBase64Utf8(content), sha, message, true);
}

async function githubCreateOrUpdate(env, path, base64Content, sha, message, alreadyBase64 = false) {
  if (!env.GITHUB_TOKEN) throw Object.assign(new Error("GITHUB_TOKEN is missing in Cloudflare secrets."), {status: 500});

  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;
  const body = {
    message,
    content: alreadyBase64 ? base64Content : encodeBase64Utf8(base64Content),
    branch: env.GITHUB_BRANCH || "main"
  };
  if (sha) body.sha = sha;

  const res = await fetch(url, {
    method: "PUT",
    headers: githubHeaders(env),
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `GitHub update failed for ${path}`);
  return data;
}

async function githubDelete(env, path, sha, message) {
  if (!env.GITHUB_TOKEN) throw Object.assign(new Error("GITHUB_TOKEN is missing in Cloudflare secrets."), {status: 500});

  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: githubHeaders(env),
    body: JSON.stringify({
      message,
      sha,
      branch: env.GITHUB_BRANCH || "main"
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `GitHub delete failed for ${path}`);
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

function slugify(value) {
  return String(value || "alma")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 58) || "alma-gallery";
}

/* ------------------------- Email helpers ------------------------- */

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
