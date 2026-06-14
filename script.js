
const $ = (s, c=document) => c.querySelector(s);
const $$ = (s, c=document) => [...c.querySelectorAll(s)];

async function getJSON(path){
  const response = await fetch(path, {cache: "no-store"});
  if(!response.ok) throw new Error(path);
  return response.json();
}

function dateParts(iso){
  const date = new Date(iso + "T12:00:00");
  return {
    day: date.toLocaleDateString("en-GB", {day:"2-digit"}),
    mon: date.toLocaleDateString("en-GB", {month:"short"})
  };
}

function eventCard(event){
  const d = dateParts(event.date);
  return `<article class="card">
    <div class="card-date"><span>${d.mon}</span><strong>${d.day}</strong></div>
    <div class="card-body">
      <span class="card-type">${event.type || "Event"}</span>
      <h3>${event.title}</h3>
      <p>${event.summary}</p>
      <a href="contact.html">${event.cta || "Enquire"}</a>
    </div>
  </article>`;
}

async function renderEvents(){
  const mounts = $$("[data-events-limit]");
  if(!mounts.length) return;
  const data = await getJSON("content/events.json");
  const events = data.events || [];
  mounts.forEach(mount => {
    const limit = Number(mount.dataset.eventsLimit || 99);
    mount.innerHTML = events.slice(0, limit).map(eventCard).join("");
  });
}

async function renderNews(){
  const mount = $("[data-news]");
  if(!mount) return;
  const data = await getJSON("content/news.json");
  mount.innerHTML = (data.news || []).map(item => `<article class="card">
    <div class="card-body">
      <span class="card-type">${item.date}</span>
      <h3>${item.title}</h3>
      <p>${item.summary}</p>
    </div>
  </article>`).join("");
}

async function renderFood(){
  const highlights = $("[data-food-highlights]");
  const menus = $("[data-food-menus]");
  const menuSections = $("[data-food-menu-sections]");
  const downloads = $("[data-food-downloads]");
  const notes = $("[data-house-notes]");
  if(!highlights && !menus && !menuSections && !downloads && !notes) return;
  const data = await getJSON("content/food.json");

  if(highlights){
    highlights.innerHTML = `<h3>Kitchen highlights</h3><p>${data.intro || ""}</p><ul>${(data.highlights || []).map(x => `<li>${x}</li>`).join("")}</ul>${data.service_note ? `<p class="small-note">${data.service_note}</p>` : ""}`;
  }

  if(menus){
    menus.innerHTML = (data.menus || []).map(menu => `<article class="card"><div class="card-body"><h3>${menu.title}</h3><p>${menu.text}</p></div></article>`).join("");
  }

  if(downloads){
    downloads.innerHTML = (data.downloads || []).map(item => `<a class="download-card" href="${item.url}" target="_blank" rel="noopener"><strong>${item.title}</strong><span>Open print-ready PDF</span></a>`).join("");
  }

  if(menuSections){
    menuSections.innerHTML = (data.menu_sections || []).map(section => `
      <article class="menu-section">
        <div class="menu-section-head">
          <h3>${section.title}</h3>
          ${section.note ? `<p>${section.note}</p>` : ""}
        </div>
        <div class="menu-items">
          ${(section.items || []).map(item => `
            <div class="menu-item">
              <div>
                <strong>${item.name}</strong>
                ${item.description ? `<span>${item.description}</span>` : ""}
              </div>
              ${item.price ? `<b>${item.price}</b>` : ""}
            </div>
          `).join("")}
        </div>
      </article>
    `).join("") + (data.allergy_note ? `<p class="allergy-note">${data.allergy_note}</p>` : "");
  }

  if(notes){
    notes.innerHTML = (data.public_house_notes || []).map(note => `<article class="card"><div class="card-body"><h3>${note.title}</h3><p>${note.text}</p></div></article>`).join("");
  }
}

async function renderTimes(){
  const data = await getJSON("content/settings.json");
  const opening = $("[data-opening-times]");
  const food = $("[data-food-times]");
  const rows = rows => rows.map(row => `<div class="time-row"><strong>${row.day}</strong><span>${row.time}</span></div>`).join("");
  if(opening) opening.innerHTML = rows(data.opening_times || []) + `<p>${data.notice || ""}</p>`;
  if(food) food.innerHTML = rows(data.food_times || []);
}


async function renderFacilities(){
  const mount = $("[data-facilities]");
  if(!mount) return;
  const data = await getJSON("content/settings.json");
  mount.innerHTML = (data.facilities || []).map(item => `<span>${item}</span>`).join("");
}


function resolvePublicImage(src){
  const value = String(src || "").trim();
  if(!value) return "";
  if(value.startsWith("data:") || /^https?:\/\//i.test(value)) return value;
  return value.replace(/^\/+/, "");
}

function publicImageFallback(img, originalSrc){
  const value = String(originalSrc || "");
  if(!value || /^https?:\/\//i.test(value)) {
    img.closest("figure")?.classList.add("image-missing");
    return;
  }
  const raw = "https://raw.githubusercontent.com/almagroupbranding/pub/main/" + value.replace(/^\/+/, "") + "?v=" + Date.now();
  if(img.src !== raw){
    img.src = raw;
  } else {
    img.closest("figure")?.classList.add("image-missing");
  }
}

async function renderGallery(){
  const mount = $("[data-gallery]");
  if(!mount) return;
  const data = await getJSON("content/gallery.json");
  mount.innerHTML = (data.images || []).map(img => `<figure><img src="${resolvePublicImage(img.src)}" alt="${img.alt || img.label || 'Gallery image'}" loading="lazy" data-original-src="${img.src || ''}" onerror="publicImageFallback(this, this.dataset.originalSrc)"><figcaption>${img.label || ""}</figcaption></figure>`).join("");
}

function initMenu(){
  const btn = $(".menu-toggle");
  const panel = $("#navPanel");
  if(!btn || !panel) return;
  btn.addEventListener("click", () => {
    const open = panel.classList.toggle("open");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  });
}

function initForm(){
  const form = $("#eventForm");
  if(!form) return;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const unsuitable = ["18th birthday party", "Children’s party"].includes(data.event_type) || data.tone === "Loud party atmosphere";
    const message = $(".form-message", form);
    if(unsuitable){
      message.hidden = false;
      message.textContent = "Thank you for thinking of The Alma. This event may not be suitable for the function room. Please phone the pub if you believe it is an exception.";
      return;
    }
    const body = encodeURIComponent(Object.entries(data).map(([key, value]) => `${key}: ${value}`).join("\\n"));
    const subject = encodeURIComponent(`Venue hire enquiry: ${data.event_type || "The Alma"}`);
    window.location.href = `mailto:info@thealmapub.co.uk?subject=${subject}&body=${body}`;
    message.hidden = false;
    message.textContent = "Your email app should open with the enquiry details. Phase 3 can send this directly through a calendar workflow.";
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initMenu();
  initForm();
  renderEvents().catch(console.error);
  renderNews().catch(console.error);
  renderFood().catch(console.error);
  renderTimes().catch(console.error);
  renderGallery().catch(console.error);
  renderFacilities().catch(console.error);
});
