
const $ = (sel, ctx=document) => ctx.querySelector(sel);
const $$ = (sel, ctx=document) => [...ctx.querySelectorAll(sel)];

async function getJSON(path){
  const res = await fetch(path, {cache:"no-store"});
  if(!res.ok) throw new Error(path);
  return res.json();
}
function formatDate(iso){
  const d = new Date(iso + "T12:00:00");
  return {
    day: d.toLocaleDateString("en-GB",{day:"2-digit"}),
    mon: d.toLocaleDateString("en-GB",{month:"short"}),
    full: d.toLocaleDateString("en-GB",{weekday:"long", day:"numeric", month:"long"})
  };
}
async function renderEvents(){
  const mounts = $$("[data-events-limit]");
  if(!mounts.length) return;
  const events = await getJSON("content/events.json");
  mounts.forEach(mount => {
    const limit = Number(mount.dataset.eventsLimit || 99);
    mount.innerHTML = events.slice(0, limit).map(ev => {
      const date = formatDate(ev.date);
      return `<article class="event-card">
        <div class="event-date"><span>${date.mon}</span><strong>${date.day}</strong></div>
        <div class="body">
          <span class="event-type">${ev.type}</span>
          <h3>${ev.title}</h3>
          <p>${ev.summary}</p>
          <a href="contact.html">${ev.cta}</a>
        </div>
      </article>`;
    }).join("");
  });
}
async function renderNews(){
  const mount = $("[data-news]");
  if(!mount) return;
  const news = await getJSON("content/news.json");
  mount.innerHTML = news.map(item => `<article class="event-card"><div class="body"><span class="event-type">${item.date}</span><h3>${item.title}</h3><p>${item.summary}</p></div></article>`).join("");
}
async function renderSettings(){
  const settings = await getJSON("content/settings.json");
  const opening = $("[data-opening-times]");
  const food = $("[data-food-times]");
  if(opening) opening.innerHTML = settings.opening_times.map(([d,t])=>`<div class="time-row"><strong>${d}</strong><span>${t}</span></div>`).join("") + `<p>${settings.notice}</p>`;
  if(food) food.innerHTML = settings.food_times.map(([d,t])=>`<div class="time-row"><strong>${d}</strong><span>${t}</span></div>`).join("");
}
async function renderFood(){
  const highlights = $("[data-food-highlights]");
  const menus = $("[data-food-menus]");
  if(!highlights && !menus) return;
  const food = await getJSON("content/food.json");
  if(highlights) highlights.innerHTML = `<ul>${food.highlights.map(x=>`<li>${x}</li>`).join("")}</ul>`;
  if(menus) menus.innerHTML = food.menus.map(m=>`<article class="mini-card"><h3>${m.title}</h3><p>${m.text}</p></article>`).join("");
}
async function renderGallery(){
  const mount = $("[data-gallery]");
  if(!mount) return;
  const items = await getJSON("content/gallery.json");
  mount.innerHTML = items.map(img => `<figure class="gallery-card"><img src="${img.src}" alt="${img.alt}" loading="lazy"><span>${img.label}</span></figure>`).join("");
}
function initMenu(){
  const btn = $(".menu-toggle");
  const panel = $("#siteNav");
  if(!btn || !panel) return;
  btn.addEventListener("click", () => {
    const open = panel.classList.toggle("open");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  });
}
function initForm(){
  const form = $("#eventForm");
  if(!form) return;
  form.addEventListener("submit", e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const unsuitable = ["18th birthday party","Children’s party"].includes(data.event_type) || data.tone === "Loud party atmosphere";
    const message = $(".form-message", form);
    if(unsuitable){
      message.hidden = false;
      message.textContent = "Thank you for thinking of The Alma. This event may not be suitable for the function room. Please phone the pub if you believe it is an exception.";
      return;
    }
    const body = encodeURIComponent(Object.entries(data).map(([k,v]) => `${k}: ${v}`).join("\n"));
    const subject = encodeURIComponent(`Venue hire enquiry: ${data.event_type || "The Alma"}`);
    window.location.href = `mailto:info@thealmapub.co.uk?subject=${subject}&body=${body}`;
    message.hidden = false;
    message.textContent = "Your email app should open with the enquiry details. Phase 2 can send this directly through a dashboard/calendar workflow.";
  });
}
document.addEventListener("DOMContentLoaded", () => {
  initMenu();
  initForm();
  renderEvents();
  renderNews();
  renderSettings();
  renderFood();
  renderGallery();
});
