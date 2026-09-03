const K = "t-notes-v1",
  OLD_K = "notes-kanban-v1";
const s = { notes: [], lists: [], cards: [], activity: [] };
try {
  Object.assign(
    s,
    JSON.parse(localStorage.getItem(K) || localStorage.getItem(OLD_K) || "{}"),
  );
} catch {}
if (!s.lists.length)
  s.lists = [
    { id: "todo", name: "To Do" },
    { id: "doing", name: "Doing" },
    { id: "done", name: "Done" },
  ];
// ponytail: one normalize for load + import — old shapes migrate here, nowhere else
function normalize(d) {
  d.notes = d.notes || [];
  d.lists =
    d.lists && d.lists.length
      ? d.lists
      : [
          { id: "todo", name: "To Do" },
          { id: "doing", name: "Doing" },
          { id: "done", name: "Done" },
        ];
  d.cards = d.cards || [];
  d.activity = [];
  d.settings = Object.assign(
    {
      provider: "command",
      baseUrl: "https://api.commandcode.ai/provider/v1",
      model: "meta/muse-spark-1.3-contributor",
      key: "",
    },
    d.settings || {},
  );
  for (const n of d.notes) {
    n.id = n.id || uid();
    n.title = n.title || n.text || "Untitled";
    delete n.text;
    n.body = n.body || "";
    n.labels = n.labels || [];
    n.checklist = n.checklist || [];
    n.suggest = n.suggest || [];
    n.images = n.images || [];
    n.list = n.list ?? null;
    n.archived = !!n.archived;
  }
  for (const c of d.cards) {
    c.id = c.id || uid();
    c.title = c.title || c.text || "Untitled";
    delete c.text;
    c.desc = c.desc || "";
    c.list = c.list || c.col || d.lists[0].id;
    delete c.col;
    c.labels = c.labels || [];
    c.checklist = c.checklist || [];
    c.comments = c.comments || [];
    c.suggest = c.suggest || [];
    c.images = c.images || [];
    c.due = c.due || null;
    c.archived = !!c.archived;
  }
  return d;
}
normalize(s);
// ponytail: Trello classic palette, 6 fixed colors — no custom-color picker until asked
const COLORS = [
  ["green", "#61bd4f"],
  ["yellow", "#f2d600"],
  ["orange", "#ff9f1a"],
  ["red", "#eb5a46"],
  ["purple", "#c377e0"],
  ["blue", "#0079bf"],
];
// ponytail: three presets, anything else is a custom URL — new providers are config, not code
const AI_PRESETS = {
  zen: {
    label: "OpenCode Zen (free)",
    baseUrl: "https://opencode.ai/zen/v1",
    model: "big-pickle",
  },
  openrouter: {
    label: "OpenRouter (free)",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openrouter/free",
  },
  command: {
    label: "Command Code",
    baseUrl: "https://api.commandcode.ai/provider/v1",
    model: "meta/muse-spark-1.3-contributor",
  },
  custom: { label: "Custom", baseUrl: "", model: "" },
};
const escHtml = (x) =>
  String(x ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
async function aiChat(prompt, maxTokens = 4000, st = s.settings) {
  if (!st.key) return null;
  const url = `${st.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 60000);
  try {
    const r = await fetch(url, {
      method: "POST",
      signal: ctl.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${st.key}`,
      },
      body: JSON.stringify({
        model: st.model,
        messages: [{ role: "user", content: prompt }],
        reasoning_effort: "medium",
        max_tokens: maxTokens,
        stream: false,
      }),
    });
    if (!r.ok) throw new Error(`AI error ${r.status}`);
    const j = await r.json();
    const text = j.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("empty AI reply");
    return text;
  } catch (e) {
    toast(e.name === "AbortError" ? "AI timed out" : `AI failed: ${e.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
const filter = { label: null, tag: null };
let openPal = null,
  showArch = false,
  showAct = false,
  query = "",
  searchTimer = null;
const save = () => {
  try {
    localStorage.setItem(K, JSON.stringify(s));
  } catch {
    toast("Storage full: remove an image, then retry");
  }
};
const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
const today = () => new Date().toISOString().slice(0, 10);
function el(tag, text, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
// inline SVG icon set: 16px viewBox, stroke 1.5, currentColor. No emoji/dingbats.
const PATHS = {
  edit: "M11.3 2.9l1.8 1.8L5 12.9 2.8 13.5l.6-2.2 7.9-8.4z",
  archive:
    "M2.5 5.5h11M4 5.5V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V5.5M5.5 5.5v-2h5v2M6.5 9h3",
  restore: "M5 8l3-3 3 3M8 5v6M4 12.5h8",
  del: "M4 4.5l8 8M12 4.5l-8 8",
  trash:
    "M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5l.5 8.5a1 1 0 0 0 1 .9h3a1 1 0 0 0 1-.9l.5-8.5M6.6 7v4M9.4 7v4",
  desc: "M2.5 4.5h11M2.5 8h7M2.5 11.5h9",
  comment: "M2.5 3.5h11v8h-6l-3 2.5v-2.5h-2z",
  cal: "M3 5.5h10V13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM3 5.5V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v1.5M5.5 2.5v3M10.5 2.5v3M5 8h2M9 8h2",
  check: "M3.5 8.5l3 3 6-7",
  open: "M2 4.5h12M2 11.5h12M2 4.5v7M14 4.5v7",
  list: "M2.5 4h11M2.5 8h11M2.5 12h7",
  left: "M9.5 3.5L5 8l4.5 4.5",
  right: "M6.5 3.5L11 8l-4.5 4.5",
  tag: "M8.5 2l5 5-6 6H2.5v-5zM5.5 6a1 1 0 1 0 0-.01",
  convert:
    "M4 2.5v8M2.5 4H8M2.5 4l1.5-1.5M2.5 4L4 5.5M12 9v4.5M10.5 11H16M10.5 11l1.5-1.5M10.5 11l1.5 1.5",
  img: "M3 3.5h10a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1zM2.5 11l3.5-3.5 2.5 2.5 2-2L14 11.5M6 7a1 1 0 1 0 0-.01",
};
function ico(name, title) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 16 16");
  s.setAttribute("fill", "none");
  s.setAttribute("stroke", "currentColor");
  s.setAttribute("stroke-width", "1.5");
  s.setAttribute("stroke-linecap", "round");
  s.setAttribute("stroke-linejoin", "round");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", PATHS[name]);
  s.append(p);
  if (title) {
    const t2 = document.createElementNS("http://www.w3.org/2000/svg", "title");
    t2.textContent = title;
    s.append(t2);
  }
  s.setAttribute("aria-hidden", "true");
  return s;
}
function log(text) {
  s.activity.unshift({ ts: Date.now(), text });
  s.activity = s.activity.slice(0, 30);
}
// toasts: one line per action, auto-dismiss
const toasts = document.getElementById("toasts");
function toast(msg) {
  const t = el("div", msg, "toast");
  toasts.append(t);
  setTimeout(() => {
    t.classList.add("out");
    setTimeout(() => t.remove(), 300);
  }, 2200);
}
// rich text: allowlist filter (contenteditable output), no innerHTML anywhere
const RICH_TAGS = [
  "B",
  "STRONG",
  "I",
  "EM",
  "U",
  "S",
  "STRIKE",
  "P",
  "DIV",
  "BR",
  "UL",
  "OL",
  "LI",
  "SPAN",
  "FONT",
];
function cleanStyle(s) {
  const out = [];
  for (const d of String(s).split(";")) {
    const kv = d.split(":");
    const k = kv[0] && kv[0].trim().toLowerCase(),
      v = kv[1] && kv[1].trim();
    if (!k || !v) continue;
    if (
      ![
        "color",
        "font-size",
        "font-weight",
        "font-style",
        "text-decoration",
      ].includes(k)
    )
      continue;
    if (/url\(|expression|</i.test(v)) continue;
    if (!/^[a-zA-Z0-9#(),.% -]+$/.test(v)) continue;
    out.push(`${k}:${v}`);
  }
  return out.join(";");
}
function filterNode(n) {
  if (n.nodeType === 3) return document.createTextNode(n.textContent);
  if (n.nodeType !== 1) return document.createTextNode("");
  if (n.tagName === "FONT") {
    const sp = document.createElement("span"),
      c = n.getAttribute("color");
    if (c) sp.style.color = c;
    for (const k of [...n.childNodes]) sp.append(filterNode(k));
    return sp;
  }
  if (!RICH_TAGS.includes(n.tagName)) {
    const f = document.createDocumentFragment();
    for (const k of [...n.childNodes]) f.append(filterNode(k));
    return f;
  }
  const e = document.createElement(n.tagName.toLowerCase());
  if (n.tagName === "SPAN") {
    const cs = cleanStyle(n.getAttribute("style") || "");
    if (cs) e.setAttribute("style", cs);
  }
  for (const k of [...n.childNodes]) e.append(filterNode(k));
  return e;
}
function htmlNodes(html) {
  const f = document.createDocumentFragment();
  if (!html) return f;
  const body = new DOMParser().parseFromString(String(html), "text/html").body;
  for (const n of [...body.childNodes]) f.append(filterNode(n));
  return f;
}
function editableHtml(editable) {
  const d = document.createElement("div");
  for (const n of [...editable.childNodes]) d.append(filterNode(n));
  return new XMLSerializer()
    .serializeToString(d)
    .replace(/ xmlns="[^"]*"/g, "")
    .replace(/^<div>/, "")
    .replace(/<\/div>$/, "");
}
const plain = (h) => String(h ?? "").replace(/<[^>]*>/g, " ");
// images: compressed dataURL attachments, localStorage-safe.
// Ponytail: one rung — canvas downscale (max 1280) + JPEG 0.82 unless the
// file is already small, plus a try/catch quota guard in save().
function compressImage(file) {
  return new Promise((res, rej) => {
    if (!file.type.startsWith("image/")) return rej(new Error("not image"));
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      try {
        const m = Math.max(im.width, im.height);
        const small = file.size < 350 * 1024 && m <= 1280;
        if (small) {
          const r = new FileReader();
          r.onload = () => {
            URL.revokeObjectURL(url);
            res(r.result);
          };
          r.onerror = () => rej(new Error("read"));
          r.readAsDataURL(file);
          return;
        }
        const k = Math.min(1, 1280 / m);
        const cv = document.createElement("canvas");
        cv.width = Math.round(im.width * k);
        cv.height = Math.round(im.height * k);
        cv.getContext("2d").drawImage(im, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        res(cv.toDataURL("image/jpeg", 0.82));
      } catch (e) {
        rej(e);
      }
    };
    im.onerror = () => rej(new Error("decode"));
    im.src = url;
  });
}
let imgTarget = null; // {push: (img)=>void, done: ()=>void} set before picker opens
function openImgPicker(target) {
  imgTarget = target;
  const inp = document.getElementById("img-pick");
  inp.value = "";
  inp.click();
}
document.getElementById("img-pick").addEventListener("change", async (e) => {
  const t = imgTarget;
  imgTarget = null;
  if (!t) return;
  const files = [...e.target.files].filter((f) => f.type.startsWith("image/"));
  if (!files.length) return;
  let added = 0;
  for (const f of files.slice(0, 8)) {
    try {
      const url = await compressImage(f);
      t.push({
        id: uid(),
        name: f.name || "image",
        url,
      });
      added++;
    } catch {
      toast(`Skipped ${f.name || "file"}: not a readable image`);
    }
  }
  if (added) {
    save();
    t.done();
  }
});
function detailGallery(it, rerender) {
  it.images = it.images || [];
  const wrap = el("div", null, "imgsec"),
    head = el("div", null, "mrow"),
    lab = el("span", `Images (${it.images.length})`, "badge"),
    add = el("button", "Attach image", "fbtn");
  add.onclick = () =>
    openImgPicker({
      push: (im2) => it.images.push(im2),
      done: () => {
        rerender();
      },
    });
  head.append(lab, add);
  wrap.append(head);
  if (it.images.length) {
    const row = el("div", null, "thumbs");
    for (const im2 of it.images) {
      const w = el("div", null, "thumbw");
      w.append(thumbEl(im2));
      const x = el("button", null, "iconbtn");
      x.title = "remove image";
      x.append(ico("del"));
      x.onclick = () => {
        it.images = it.images.filter((z) => z.id !== im2.id);
        save();
        rerender();
      };
      w.append(x);
      row.append(w);
    }
    wrap.append(row);
  }
  mb.append(wrap);
}
function thumbEl(im2) {
  const im = document.createElement("img");
  im.className = "thumb";
  im.src = im2.url;
  im.alt = im2.name || "attached image";
  im.loading = "lazy";
  im.onclick = (ev) => {
    ev.stopPropagation();
    const v = document.getElementById("viewer-img");
    v.src = im2.url;
    v.alt = im2.name || "attached image";
    document.getElementById("viewer").showModal();
  };
  return im;
}
function imgRow(images, onRemove) {
  const row = el("div", null, "thumbs");
  for (const im2 of images || []) {
    const w = el("div", null, "thumbw");
    w.append(thumbEl(im2));
    if (onRemove) {
      const x = el("button", null, "iconbtn");
      x.title = "remove image";
      x.append(ico("del"));
      x.onclick = () => onRemove(im2.id);
      w.append(x);
    }
    row.append(w);
  }
  return row;
}
// shared B / I / color / size toolbar for any contenteditable
function wireTools(tools, editable) {
  let saved = null;
  const stash = () => {
    const sl = getSelection();
    if (sl.rangeCount && editable.contains(sl.anchorNode))
      saved = sl.getRangeAt(0).cloneRange();
  };
  editable.addEventListener("keyup", stash);
  editable.addEventListener("mouseup", stash);
  const restore = () => {
    if (!saved) return;
    const sl = getSelection();
    sl.removeAllRanges();
    try {
      sl.addRange(saved);
    } catch {}
  };
  tools.querySelectorAll("[data-cmd]").forEach((b) => {
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.addEventListener("click", () => {
      editable.focus();
      document.execCommand(b.dataset.cmd, false, null);
    });
  });
  tools.querySelectorAll("[data-size]").forEach((b) => {
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.addEventListener("click", () => {
      editable.focus();
      document.execCommand("fontSize", false, b.dataset.size);
    });
  });
  const col = tools.querySelector('input[type="color"]');
  if (col)
    col.addEventListener("change", () => {
      editable.focus();
      restore();
      document.execCommand("foreColor", false, col.value);
    });
}
function toolsEl(editable) {
  const t = el("div", null, "tools");
  const b = el("button", null, null);
  b.dataset.cmd = "bold";
  b.title = "bold";
  b.append(el("b", "B"));
  const i = el("button", null, null);
  i.dataset.cmd = "italic";
  i.title = "italic";
  i.append(el("i", "I"));
  const col = document.createElement("input");
  col.type = "color";
  col.title = "text color";
  col.value = "#1c1c1e";
  const sm = el("button", "S", null);
  sm.title = "small text";
  sm.dataset.size = "3";
  const lg = el("button", "L", null);
  lg.title = "large text";
  lg.dataset.size = "5";
  t.append(b, i, col, sm, lg);
  wireTools(t, editable);
  return t;
}
// tabs + theme
const vn = document.getElementById("view-notes"),
  vb = document.getElementById("view-board"),
  tn = document.getElementById("tab-notes"),
  tb = document.getElementById("tab-board");
tn.onclick = () => {
  vn.hidden = false;
  vb.hidden = true;
  tn.classList.add("on");
  tb.classList.remove("on");
};
tb.onclick = () => {
  vn.hidden = true;
  vb.hidden = false;
  tb.classList.add("on");
  tn.classList.remove("on");
};
document.getElementById("guide").onclick = () =>
  document.getElementById("guide-modal").showModal();
document.getElementById("guide-close").onclick = () =>
  document.getElementById("guide-modal").close();
document.getElementById("theme").onclick = () => {
  const r = document.documentElement,
    d = r.dataset.theme === "dark" ? "light" : "dark";
  r.dataset.theme = d;
  localStorage.setItem("tn-theme", d);
};
// #tag chips (textContent-only)
function textWithTags(text) {
  const f = document.createDocumentFragment(),
    re = /#([\p{L}\p{N}_-]+)/gu;
  let last = 0,
    m;
  while ((m = re.exec(text))) {
    if (m.index > last)
      f.append(document.createTextNode(text.slice(last, m.index)));
    const b = el("button", `#${m[1]}`, "chip");
    b.dataset.act = "tag";
    b.dataset.t = m[1];
    f.append(b);
    last = m.index + m[0].length;
  }
  f.append(document.createTextNode(text.slice(last)));
  return f;
}
const hasTag = (text, t) => text.split(/\s+/).some((w) => w === `#${t}`);
function matches(it) {
  const cl = (it.checklist || []).map((i) => i.text).join(" ");
  const text = `${it.title || it.text || ""} ${plain(it.body || it.desc || "")} ${cl}`;
  if (filter.label && !it.labels.includes(filter.label)) return false;
  if (filter.tag && !hasTag(text, filter.tag)) return false;
  if (query && !text.toLowerCase().includes(query)) return false;
  return true;
}
function labelRow(it) {
  const row = el("div", null, "labels");
  for (const [name, hex] of COLORS) {
    if (!it.labels.includes(name)) continue;
    const d = el("button", null, "strip");
    d.style.background = hex;
    d.title = name;
    d.dataset.act = "pick";
    d.dataset.c = name;
    d.dataset.id = it.id;
    row.append(d);
  }
  const t = el("button", null, "tagbtn");
  t.title = "labels";
  t.dataset.act = "label";
  t.dataset.id = it.id;
  t.append(ico("tag"));
  row.append(t);
  return row;
}
function palRow(it) {
  const p = el("div", null, "pal");
  for (const [name, hex] of COLORS) {
    const d = el(
      "button",
      null,
      `dot${it.labels.includes(name) ? "" : " dim"}`,
    );
    d.style.background = hex;
    d.title = name;
    d.dataset.act = "pick";
    d.dataset.c = name;
    d.dataset.id = it.id;
    p.append(d);
  }
  return p;
}
function toggleLabel(id, color) {
  const it = s.notes.concat(s.cards).find((x) => x.id === id);
  if (!it) return;
  it.labels = it.labels.includes(color)
    ? it.labels.filter((l) => l !== color)
    : [...it.labels, color];
  save();
  renderAll();
}
// filter bar
const filters = document.getElementById("filters");
function renderFilters() {
  filters.replaceChildren();
  if (!filter.label && !filter.tag && !query) return;
  for (const [name, hex] of COLORS) {
    const d = el(
      "button",
      null,
      `dot${!filter.label || filter.label === name ? " big" : ""}${filter.label && filter.label !== name ? " dim" : ""}`,
    );
    d.style.background = hex;
    d.title = name;
    d.dataset.f = name;
    filters.append(d);
  }
  if (filter.tag) {
    const c = el("button", `#${filter.tag}`, "chip");
    c.dataset.clearTag = "1";
    filters.append(c);
  }
  const x = el("button", "clear", "fbtn");
  x.dataset.clear = "1";
  filters.append(x);
}
filters.onclick = (e) => {
  if (e.target.closest("[data-clear-tag]")) {
    filter.tag = null;
    renderAll();
    return;
  }
  if (e.target.closest("[data-clear]")) {
    filter.label = null;
    filter.tag = null;
    query = "";
    clearTimeout(searchTimer);
    document.getElementById("search-input").value = "";
    renderAll();
    return;
  }
  const d = e.target.closest("[data-f]");
  if (!d) return;
  filter.label = filter.label === d.dataset.f ? null : d.dataset.f;
  renderAll();
};
// ---- notes (Trello: simple cards, archivable) ----
const nl = document.getElementById("notes"),
  an = document.getElementById("arch-notes");
document.getElementById("new-note").onclick = () => openCompose("note");
document.getElementById("new-card").onclick = () => openCompose("card");
document.getElementById("show-arch").onclick = (e) => {
  showArch = !showArch;
  an.hidden = !showArch;
  e.target.textContent = showArch ? "hide archived" : "show archived";
  renderAll();
};
function noteEl(n, arch) {
  const d = el("div", null, "note"),
    col = el("div", null, "itemcol"),
    top = el("div", null, "trow"),
    sp = el("span", null, "t ntitle");
  d.dataset.id = n.id;
  sp.append(textWithTags(n.title || "Untitled"));
  top.append(sp);
  col.append(top);
  if (n.body) {
    const b = el("div", null, "nbody");
    b.append(htmlNodes(n.body));
    col.append(b);
  }
  if (n.checklist?.length) {
    const bd = el("div", null, "badges");
    bd.append(
      el("span", `checklist ${doneCount(n)}/${n.checklist.length}`, "badge"),
    );
    col.append(bd);
  }
  if (n.images?.length) {
    col.append(imgRow(n.images.slice(0, 4), null));
    if (n.images.length > 4)
      col.append(el("span", `+${n.images.length - 4} more`, "badge"));
  }
  col.append(labelRow(n));
  if (openPal === n.id) col.append(palRow(n));
  d.append(col);
  const e2 = el("button", null, "iconbtn");
  e2.title = "edit note";
  e2.dataset.edit = n.id;
  e2.append(ico("edit"));
  d.append(e2);
  const a = el("button", null, "iconbtn");
  a.title = arch ? "restore" : "archive";
  a.dataset.arc = n.id;
  a.append(ico(arch ? "restore" : "archive"));
  d.append(a);
  const b = el("button", null, "del");
  b.title = "delete note";
  b.dataset.id = n.id;
  b.append(ico("trash"));
  d.append(b);
  return d;
}
function renderNotes() {
  nl.replaceChildren();
  an.replaceChildren();
  const live = s.notes.filter((n) => !n.archived && matches(n)),
    old = s.notes.filter((n) => n.archived && matches(n));
  if (!live.length && !old.length) {
    const p = el(
      "p",
      s.notes.length ? "No matches." : "No notes yet. Hit + New note.",
    );
    p.style.color = "var(--mut)";
    nl.append(p);
  }
  for (const n of live) nl.append(noteEl(n, false));
  for (const n of old) an.append(noteEl(n, true));
}
nl.onclick = noteClick;
an.onclick = noteClick;
let dragNoteJustDropped = false; // suppress detail-open on the click after a note drag
function noteClick(e) {
  handleNote(e);
}
function handleNote(e) {
  const main = e.target.closest(".note");
  if (main && !e.target.closest("button,input,select,img.thumb")) {
    if (dragNoteJustDropped) {
      dragNoteJustDropped = false;
      return true;
    }
    if (!window.getSelection().toString()) openNote(main.dataset.id);
    return true;
  }
  const t = e.target.closest('[data-act="tag"]');
  if (t) {
    filter.tag = filter.tag === t.dataset.t ? null : t.dataset.t;
    renderAll();
    return;
  }
  const p = e.target.closest('[data-act="pick"]');
  if (p) {
    toggleLabel(p.dataset.id, p.dataset.c);
    return;
  }
  const l = e.target.closest('[data-act="label"]');
  if (l) {
    openPal = openPal === l.dataset.id ? null : l.dataset.id;
    renderAll();
    return;
  }
  const a = e.target.closest("[data-arc]");
  if (a) {
    const n = s.notes.find((x) => x.id === a.dataset.arc);
    n.archived = !n.archived;
    save();
    renderAll();
    toast(n.archived ? "Note archived" : "Note restored");
    return;
  }
  const ed = e.target.closest("[data-edit]");
  if (ed) {
    openCompose("note", ed.dataset.edit);
    return;
  }
  const b = e.target.closest(".del");
  if (!b) return;
  s.notes = s.notes.filter((n) => n.id !== b.dataset.id);
  save();
  renderAll();
  toast("Note deleted");
}
// ---- board: custom lists + cards ----
const board = document.getElementById("board");
document.getElementById("list-form").onsubmit = (e) => {
  e.preventDefault();
  const inp = document.getElementById("list-input"),
    t = inp.value.trim();
  if (!t) return;
  s.lists.push({ id: uid(), name: t });
  log(`added list “${t}”`);
  inp.value = "";
  save();
  renderAll();
  toast(`List “${t}” added`);
};
document.getElementById("search-input").oninput = (e) => {
  query = e.target.value.trim().toLowerCase();
  // debounce: render only after typing pauses (cheap on a big board)
  clearTimeout(searchTimer);
  searchTimer = setTimeout(renderAll, 120);
};
document.getElementById("show-act").onclick = (e) => {
  showAct = !showAct;
  document.getElementById("activity").hidden = !showAct;
  e.target.textContent = showAct ? "hide activity" : "activity";
  renderAll();
};
function doneCount(c) {
  return c.checklist.filter((i) => i.done).length;
}
function cardBadges(c, row) {
  if (c.desc) {
    const b = el("span", null, "badge");
    b.append(ico("desc"));
    b.title = "has description";
    row.append(b);
  }
  if (c.checklist.length) {
    row.append(el("span", `${doneCount(c)}/${c.checklist.length}`, "badge"));
  }
  if (c.comments.length) {
    const b = el("span", null, "badge");
    b.append(ico("comment"));
    b.append(document.createTextNode(String(c.comments.length)));
    b.title = "comments";
    row.append(b);
  }
  if (c.due) {
    const over = !c.done && c.due < today(),
      b = el("span", c.due, `badge${over ? " over" : ""}`);
    b.title = "due date";
    row.append(b);
  }
}
function cardEl(c) {
  const i = s.lists.findIndex((l) => l.id === c.list),
    d = el("div", null, `card${c.done ? " done" : ""}`);
  d.draggable = true;
  d.dataset.cid = c.id;
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = c.done;
  cb.dataset.act = "toggle";
  cb.dataset.id = c.id;
  const col = el("div", null, "itemcol"),
    top = el("div", null, "trow"),
    sp = el("span", null, "t");
  sp.append(textWithTags(c.title));
  top.append(sp);
  col.append(top);
  const bg = el("div", null, "badges");
  cardBadges(c, bg);
  if (bg.children.length) col.append(bg);
  if (c.images?.length) {
    col.append(imgRow(c.images.slice(0, 4), null));
    if (c.images.length > 4)
      col.append(el("span", `+${c.images.length - 4} more`, "badge"));
  }
  if (c.checklist.length) {
    const bar = el(
        "div",
        `bar${doneCount(c) === c.checklist.length ? " done" : ""}`,
      ),
      fill = el("i");
    fill.style.width = `${Math.round((doneCount(c) / c.checklist.length) * 100)}%`;
    bar.append(fill);
    col.append(bar);
  }
  col.append(labelRow(c));
  if (openPal === c.id) col.append(palRow(c));
  d.append(cb, col);
  if (i > 0) {
    const b = el("button", null, "mv");
    b.dataset.act = "mv";
    b.dataset.dir = "-1";
    b.dataset.id = c.id;
    b.title = "move left";
    b.append(ico("left"));
    d.append(b);
  }
  if (i < s.lists.length - 1) {
    const b = el("button", null, "mv");
    b.dataset.act = "mv";
    b.dataset.dir = "1";
    b.dataset.id = c.id;
    b.title = "move right";
    b.append(ico("right"));
    d.append(b);
  }
  const o = el("button", null, "iconbtn");
  o.title = "open";
  o.dataset.act = "open";
  o.dataset.id = c.id;
  o.append(ico("open"));
  d.append(o);
  const x = el("button", null, "del");
  x.title = "archive card";
  x.dataset.act = "del";
  x.dataset.id = c.id;
  x.append(ico("archive"));
  d.append(x);
  return d;
}
const LIST_ACCENTS = ["#0079bf", "#ff9f1a", "#61bd4f", "#c377e0", "#eb5a46"];
function renderBoard() {
  board.replaceChildren();
  for (const [li, l] of s.lists.entries()) {
    const acc = LIST_ACCENTS[li % LIST_ACCENTS.length];
    const col = el("div", null, "col"),
      head = el("div", null, "colhead"),
      h = el("h2", l.name);
    col.style.borderTop = `3px solid ${acc}`;
    const dot = el("span", null, "dot");
    dot.style.background = acc;
    dot.style.cursor = "default";
    head.append(dot, h);
    const n =
      s.cards.filter((c) => c.list === l.id && !c.archived).length +
      s.notes.filter((x) => x.list === l.id && !x.archived).length;
    head.append(el("span", String(n), "badge"));
    const rn = el("button", null, "iconbtn");
    rn.title = "rename";
    rn.dataset.rn = l.id;
    rn.append(ico("edit"));
    head.append(rn);
    const dl = el("button", null, "iconbtn");
    dl.title = "delete list (archives its cards)";
    dl.dataset.dl = l.id;
    dl.append(ico("del"));
    head.append(dl);
    col.append(head);
    const wrap = el("div", null, "cards");
    wrap.id = `c-${l.id}`;
    wrap.dataset.list = l.id;
    for (const c of s.cards.filter(
      (x) => x.list === l.id && !x.archived && matches(x),
    ))
      wrap.append(cardEl(c));
    // notes pinned to this list appear as cards — same item, both views
    for (const x of s.notes.filter(
      (y) => y.list === l.id && !y.archived && matches(y),
    )) {
      const ne = noteEl(x, false);
      ne.draggable = true;
      wrap.append(ne);
    }
    col.append(wrap);
    board.append(col);
  }
  const act = document.getElementById("activity");
  act.replaceChildren();
  for (const a of s.activity) {
    const p = el("div", null, null);
    p.append(
      el("small", new Date(a.ts).toLocaleString()),
      document.createTextNode(` ${a.text}`),
    );
    act.append(p);
  }
}
board.onclick = (e) => {
  if (e.target.closest(".note")) {
    handleNote(e);
    return;
  }
  const t = e.target.closest('[data-act="tag"]');
  if (t) {
    filter.tag = filter.tag === t.dataset.t ? null : t.dataset.t;
    renderAll();
    return;
  }
  const p = e.target.closest('[data-act="pick"]');
  if (p) {
    toggleLabel(p.dataset.id, p.dataset.c);
    return;
  }
  const lb = e.target.closest('[data-act="label"]');
  if (lb) {
    openPal = openPal === lb.dataset.id ? null : lb.dataset.id;
    renderAll();
    return;
  }
  const rn = e.target.closest("[data-rn]");
  if (rn) {
    const l = s.lists.find((x) => x.id === rn.dataset.rn),
      head = rn.parentElement;
    head.replaceChildren();
    const inp = document.createElement("input");
    inp.value = l.name;
    inp.onchange = () => {
      l.name = inp.value.trim() || l.name;
      save();
      renderAll();
      toast(`List renamed to “${l.name}”`);
    };
    inp.onblur = () => renderAll();
    head.append(inp);
    inp.focus();
    inp.select();
    return;
  }
  const dl = e.target.closest("[data-dl]");
  if (dl) {
    const l = s.lists.find((x) => x.id === dl.dataset.dl);
    if (!confirm(`Delete list “${l.name}”? Its cards will be archived.`))
      return;
    for (const c of s.cards.filter((x) => x.list === l.id)) c.archived = true;
    // notes pinned to the list fall back to Notes-only instead of vanishing
    for (const x of s.notes.filter((y) => y.list === l.id)) x.list = null;
    s.lists = s.lists.filter((x) => x.id !== l.id);
    log(`deleted list “${l.name}”`);
    save();
    renderAll();
    toast(`List “${l.name}” deleted`);
    return;
  }
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const c = s.cards.find((x) => x.id === b.dataset.id);
  if (!c) return;
  const a = b.dataset.act;
  if (a === "toggle") {
    c.done = !c.done;
    save();
    renderAll();
    toast(c.done ? "Marked done" : "Reopened");
  } else if (a === "open") openModal(c.id);
  else if (a === "del") {
    c.archived = true;
    log(`archived “${c.title}”`);
    save();
    renderAll();
    toast("Card archived");
  } else if (a === "mv") {
    const i = s.lists.findIndex((l) => l.id === c.list) + Number(b.dataset.dir);
    c.list = s.lists[i].id;
    if (s.lists[i].name.toLowerCase() === "done") c.done = true;
    log(`moved “${c.title}” → ${s.lists[i].name}`);
    save();
    renderAll();
    toast(`Moved to ${s.lists[i].name}`);
  }
};
// compose popup: title first, rich body, save button
// ponytail: one dialog for new note / new card / edit note — no second modal for editing
let composeMode = "note";
let editId = null;
let composeItems = []; // pending checklist items, shown as real checkboxes pre-save
let composeImages = []; // pending image attachments, shown as thumbnails pre-save
function renderComposeImgs() {
  const box = document.getElementById("compose-imgs"),
    cnt = document.getElementById("compose-icount");
  box.replaceChildren();
  box.hidden = composeImages.length === 0;
  cnt.hidden = composeImages.length === 0;
  if (!composeImages.length) return;
  cnt.textContent = String(composeImages.length);
  for (const im2 of composeImages) {
    const w = el("div", null, "thumbw");
    w.append(thumbEl(im2));
    const x = el("button", null, "iconbtn");
    x.title = "remove image";
    x.append(ico("del"));
    x.onclick = () => {
      composeImages = composeImages.filter((z) => z !== im2);
      renderComposeImgs();
    };
    w.append(x);
    box.append(w);
  }
}
document.getElementById("compose-attach").onclick = () =>
  openImgPicker({
    push: (im2) => {
      composeImages.push(im2);
    },
    done: () => renderComposeImgs(),
  });
document.getElementById("viewer-close").onclick = () =>
  document.getElementById("viewer").close();
const composeDlg = document.getElementById("compose"),
  cH = document.getElementById("compose-h"),
  cTitle = document.getElementById("compose-title"),
  cText = document.getElementById("compose-text"),
  cListRow = document.getElementById("compose-listrow"),
  cList = document.getElementById("compose-list"),
  cClist = document.getElementById("compose-clist"),
  cItems = document.getElementById("compose-citems"),
  cProg = document.getElementById("compose-cprog");
document.getElementById("compose-tools").append(toolsEl(cText));
function renderComposeClist() {
  cItems.replaceChildren();
  cClist.hidden = composeItems.length === 0;
  const done = composeItems.filter((i) => i.done).length;
  cProg.textContent = `${done}/${composeItems.length}`;
  for (const item of composeItems) {
    const r = el("div", null, "mrow"),
      cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = item.done;
    cb.onchange = () => {
      item.done = cb.checked;
      renderComposeClist();
    };
    const sp = el("span", item.text, "mgrow");
    const x = el("button", null, "iconbtn");
    x.title = "remove item";
    x.append(ico("del"));
    x.onclick = () => {
      composeItems = composeItems.filter((z) => z !== item);
      renderComposeClist();
    };
    r.append(cb, sp, x);
    cItems.append(r);
  }
}
function addComposeItems(texts) {
  for (const t of texts) {
    const t2 = t.trim();
    if (t2) composeItems.push({ id: uid(), text: t2, done: false });
  }
  renderComposeClist();
}
function openCompose(mode, id) {
  composeMode = mode;
  editId = id || null;
  cTitle.value = "";
  cText.replaceChildren();
  composeItems = [];
  composeImages = [];
  renderComposeImgs();
  // List picker: required for cards (destination column), optional for notes
  // (a note with a list also appears as a board card in that column).
  cList.replaceChildren();
  if (mode === "note") {
    const none = document.createElement("option");
    none.value = "";
    none.textContent = "Notes only";
    cList.append(none);
  }
  for (const l of s.lists) {
    const o = document.createElement("option");
    o.value = l.id;
    o.textContent = l.name;
    cList.append(o);
  }
  cListRow.hidden = mode === "card" && !s.lists.length;
  const existing = editId
    ? (mode === "note" ? s.notes : s.cards).find((x) => x.id === editId)
    : null;
  if (existing) {
    cH.textContent = mode === "note" ? "Edit note" : "Edit card";
    cTitle.value = existing.title || "";
    cText.append(htmlNodes(existing.body || existing.desc || ""));
    composeItems = (existing.checklist || []).map((z) => ({ ...z }));
    composeImages = (existing.images || []).map((z) => ({ ...z }));
    if (mode === "note") cList.value = existing.list || "";
    else if (existing.list) cList.value = existing.list;
    renderComposeImgs();
  } else {
    cH.textContent = mode === "note" ? "New note" : "New card";
  }
  renderComposeClist();
  composeDlg.showModal();
  setTimeout(() => cTitle.focus(), 50);
}
document.getElementById("compose-save").onclick = () => {
  const html = editableHtml(cText);
  const t =
    cTitle.value.trim() || plain(html).trim().slice(0, 40) || "Untitled";
  if (composeMode === "note") {
    const n = editId
      ? s.notes.find((x) => x.id === editId)
      : s.notes.find(() => false);
    if (n) {
      n.title = t;
      n.body = html;
      n.checklist = composeItems.map((z) => ({ ...z }));
      n.images = composeImages.map((z) => ({ ...z }));
      n.list = cList.value || null;
      toast("Note updated");
    } else {
      s.notes.unshift({
        id: uid(),
        title: t,
        body: html,
        labels: [],
        checklist: composeItems.map((z) => ({ ...z })),
        images: composeImages.map((z) => ({ ...z })),
        list: cList.value || null,
        suggest: [],
        archived: false,
      });
      toast("Note saved");
      suggestAuto(s.notes[0]);
    }
  } else {
    if (!s.lists.length) {
      toast("Add a list first");
      return;
    }
    const existing = editId ? s.cards.find((x) => x.id === editId) : null;
    if (existing) {
      existing.title = t;
      existing.desc = html;
      existing.checklist = composeItems.map((z) => ({ ...z }));
      existing.images = composeImages.map((z) => ({ ...z }));
      log(`edited “${t}”`);
      toast("Card updated");
    } else {
      const card = {
        id: uid(),
        title: t,
        desc: html,
        done: false,
        list: cList.value || s.lists[0].id,
        labels: [],
        checklist: composeItems.map((z) => ({ ...z })),
        images: composeImages.map((z) => ({ ...z })),
        comments: [],
        suggest: [],
        due: null,
        archived: false,
      };
      s.cards.push(card);
      log(`added “${t}”`);
      toast("Card added");
      suggestAuto(card);
    }
  }
  save();
  composeDlg.close();
  renderAll();
};
document.getElementById("compose-cancel").onclick = () => composeDlg.close();
// AI settings dialog
const setDlg = document.getElementById("settings"),
  setProv = document.getElementById("set-provider"),
  setUrl = document.getElementById("set-url"),
  setModel = document.getElementById("set-model"),
  setKey = document.getElementById("set-key"),
  setMsg = document.getElementById("set-msg");
function openSettings() {
  setProv.replaceChildren();
  for (const [id, p] of Object.entries(AI_PRESETS)) {
    const o = document.createElement("option");
    o.value = id;
    o.textContent = p.label;
    if (id === s.settings.provider) o.selected = true;
    setProv.append(o);
  }
  setUrl.value = s.settings.baseUrl;
  setModel.value = s.settings.model;
  setKey.value = s.settings.key;
  setMsg.textContent = "";
  setDlg.showModal();
}
document.getElementById("ai-open").onclick = openSettings;
setProv.onchange = () => {
  const p = AI_PRESETS[setProv.value];
  if (setProv.value !== "custom" && p) {
    setUrl.value = p.baseUrl;
    setModel.value = p.model;
  }
};
document.getElementById("set-test").onclick = async () => {
  setMsg.textContent = "Testing…";
  const out = await aiChat("Reply with exactly: OK", 300, {
    provider: "custom",
    baseUrl: setUrl.value,
    model: setModel.value,
    key: setKey.value,
  });
  setMsg.textContent =
    out && out.includes("OK") ? "Connected" : "Failed. Check URL, model, key.";
};
document.getElementById("set-save").onclick = () => {
  s.settings = {
    provider: setProv.value,
    baseUrl: setUrl.value.trim().replace(/\/$/, ""),
    model: setModel.value.trim(),
    key: setKey.value,
  };
  save();
  setDlg.close();
  toast("AI settings saved");
};
document.getElementById("set-close").onclick = () => setDlg.close();
// AI actions: summarize, checklist, improve, ideas
const AI_PROMPTS = {
  summarize: (t) =>
    `Summarize the note below in 2-3 short sentences. Reply with ONLY the summary text, no headers, no labels, no quotation marks.\n\nNote:\n${t}`,
  checklist: (t) =>
    `Turn the note below into actionable checklist items. Reply with ONE item per line, each starting with a dash and a space, like:\n- Buy milk\n- Call the dentist\nDo not number them, do not add headers, reply with only the checklist lines.\n\nNote:\n${t}`,
  improve: (t) =>
    `Rewrite the note below with clear grammar and natural wording. Keep every fact and the same meaning and language. Reply with ONLY the rewritten note, no heading, no title line, no quotation marks.\n\nNote:\n${t}`,
  ideas: (t) =>
    `Suggest 3 short, practical next steps based on the note below. Reply with ONE idea per line, each starting with a dash and a space. No headers, no numbering.\n\nNote:\n${t}`,
};
const AI_DONE = {
  summarize: "Summarized",
  checklist: "Checklist added",
  improve: "Text improved",
  ideas: "Ideas added",
};
function linesOf(out) {
  return out
    .split("\n")
    .map((l) => l.trim().replace(/^[-*•\d.)\s]+/, ""))
    .map((l) => l.trim())
    .filter(Boolean);
}
// auto AI suggestion thread: runs once after a NEW note/card is saved, stored on
// the item as pending suggestions the user can apply (-> checklist) or reject.
async function suggestAuto(it) {
  if (!s.settings.key || it.suggest?.length) return;
  const text = `${it.title || ""}\n${plain(it.body || it.desc || "")}`.trim();
  if (!plain(text).trim()) return;
  it.suggest = [
    { id: uid(), text: "Asking AI for next steps…", state: "busy" },
  ];
  const budget = Math.min(8000, Math.round(4000 + text.length * 0.4));
  const out = await aiChat(AI_PROMPTS.ideas(text), budget);
  if (out == null) {
    it.suggest = [];
    save();
    return;
  }
  it.suggest = linesOf(out).map((t) => ({
    id: uid(),
    text: t,
    state: "pending",
  }));
  save();
}
function renderSuggests(it, cont) {
  const pend = (it.suggest || []).filter((s) => s.state === "pending");
  const busy = (it.suggest || []).filter((s) => s.state === "busy");
  if (!pend.length && !busy.length) return;
  const wrap = el("div", null, "sugg");
  const head = el("div", null, "sugg-head");
  const label = el("span", "AI suggestions", "badge");
  label.style.color = "var(--acc)";
  label.style.borderColor = "color-mix(in srgb,var(--acc) 40%,var(--line))";
  head.append(label);
  wrap.append(head);
  if (busy.length) {
    wrap.append(el("div", "Asking AI for next steps…", "sugg-busy"));
  }
  for (const s of pend) {
    const row = el("div", null, "sugg-row");
    const sp = el("span", s.text, "mgrow");
    const app = el("button", "Apply", "fbtn");
    app.onclick = () => {
      it.checklist = it.checklist || [];
      it.checklist.push({ id: uid(), text: s.text, done: false });
      s.state = "applied";
      save();
      renderAll();
      cont();
      toast("Added to checklist");
    };
    const rej = el("button", "Reject", "fbtn");
    rej.onclick = () => {
      s.state = "rejected";
      save();
      renderAll();
      cont();
    };
    row.append(sp, app, rej);
    wrap.append(row);
  }
  mb.append(wrap);
}
function aiRow(getText, apply) {
  const row = el("div", null, "mrow");
  for (const [label, kind] of [
    ["Summarize", "summarize"],
    ["Checklist", "checklist"],
    ["Improve", "improve"],
    ["Ideas", "ideas"],
  ]) {
    const b = el("button", label, "fbtn");
    b.onclick = () => runAi(kind, getText, apply, b);
    row.append(b);
  }
  return row;
}
async function runAi(kind, getText, apply, btn) {
  if (!s.settings.key) {
    toast("Set your AI key in Settings first");
    openSettings();
    return;
  }
  const { title, text } = getText();
  const body = `${title}\n${text}`.trim();
  if (!plain(body).trim()) {
    toast("Nothing to send yet");
    return;
  }
  btn.disabled = true;
  // send the whole note (no truncation); reply budget scales with input,
  // generous ceiling because reasoning models spend tokens thinking first.
  // ponytail: 1 char ~= 0.35 token; 4000 base + 0.4/char covers long notes
  const budget = Math.min(8000, Math.round(4000 + body.length * 0.4));
  const out = await aiChat(AI_PROMPTS[kind](body), budget);
  btn.disabled = false;
  if (out == null) return;
  apply(kind, out);
  save();
  renderAll();
  toast(AI_DONE[kind]);
}
document.getElementById("compose-ai").append(
  aiRow(
    () => ({ title: cTitle.value, text: plain(editableHtml(cText)) }),
    (kind, out) => {
      if (kind === "checklist" || kind === "ideas") {
        // real checklist items with checkboxes, shown above the buttons pre-save
        addComposeItems(linesOf(out));
      } else {
        cText.replaceChildren(htmlNodes(escHtml(out).replace(/\n/g, "<br>")));
      }
    },
  ),
);
// native HTML5 drag & drop, zero deps
let dragId = null;
let dragNoteId = null;
board.addEventListener("dragstart", (e) => {
  const card = e.target.closest("[data-cid]");
  if (card) {
    dragId = card.dataset.cid;
    dragNoteId = null;
    e.dataTransfer.effectAllowed = "move";
    return;
  }
  const note = e.target.closest(".note");
  if (note && note.dataset.id) {
    dragNoteId = note.dataset.id;
    dragId = null;
    e.dataTransfer.effectAllowed = "move";
  }
});
board.addEventListener("dragover", (e) => {
  const w = e.target.closest(".cards");
  if (!w) return;
  e.preventDefault();
  w.parentElement.classList.add("drop");
});
board.addEventListener("dragleave", (e) => {
  const w = e.target.closest(".col");
  if (w) w.classList.remove("drop");
});
board.addEventListener("drop", (e) => {
  const w = e.target.closest(".cards");
  if (!w || (!dragId && !dragNoteId)) return;
  e.preventDefault();
  document
    .querySelectorAll(".col.drop")
    .forEach((x) => x.classList.remove("drop"));
  const c = dragId ? s.cards.find((x) => x.id === dragId) : null;
  const n = dragNoteId ? s.notes.find((x) => x.id === dragNoteId) : null;
  if (c && c.list !== w.dataset.list) {
    c.list = w.dataset.list;
    const l = s.lists.find((x) => x.id === w.dataset.list);
    log(`moved “${c.title}” → ${l.name}`);
    save();
    renderAll();
  } else if (n && n.list !== w.dataset.list) {
    // suppress the synthetic click a drag leaves behind (self-clears)
    dragNoteJustDropped = true;
    setTimeout(() => {
      dragNoteJustDropped = false;
    }, 200);
    n.list = w.dataset.list;
    const l = s.lists.find((x) => x.id === w.dataset.list);
    log(`moved “${n.title}” → ${l.name}`);
    save();
    renderAll();
  }
  dragId = null;
  dragNoteId = null;
});
// ---- card modal (native <dialog>, Trello card back) ----
const modal = document.getElementById("modal"),
  mb = document.getElementById("modal-body");
let modalId = null;
let noteDetailId = null;
modal.addEventListener("close", () => {
  noteDetailId = null;
  modalId = null;
});
function openModal(id) {
  modalId = id;
  renderModal();
  modal.showModal();
}
function openNote(id) {
  noteDetailId = id;
  renderNoteDetail();
  modal.showModal();
}
function renderNoteDetail() {
  const n = s.notes.find((x) => x.id === noteDetailId);
  if (!n) {
    modal.close();
    return;
  }
  mb.replaceChildren();
  const title = document.createElement("input");
  title.type = "text";
  title.value = n.title || "";
  title.onchange = () => {
    n.title = title.value.trim() || n.title;
    save();
    renderAll();
    renderNoteDetail();
  };
  mb.append(title);
  const bls = el("div", null, "mrow"),
    blab = el("span", "Board list", "badge");
  const bl = document.createElement("select");
  const bnone = document.createElement("option");
  bnone.value = "";
  bnone.textContent = "Notes only";
  bl.append(bnone);
  for (const l of s.lists) {
    const o = document.createElement("option");
    o.value = l.id;
    o.textContent = l.name;
    bl.append(o);
  }
  bl.value = n.list || "";
  bl.onchange = () => {
    n.list = bl.value || null;
    const l = s.lists.find((x) => x.id === bl.value);
    if (l) log(`moved “${n.title}” → ${l.name}`);
    save();
    renderAll();
    renderNoteDetail();
  };
  bls.append(blab, bl);
  mb.append(bls);
  mb.append(labelRow(n));
  if (openPal === n.id) mb.append(palRow(n));
  renderSuggests(n, () => renderNoteDetail());
  const body = el("div", null, "rich");
  body.contentEditable = "true";
  body.dataset.ph = "Note body… (select text for bold, color, size)";
  body.append(htmlNodes(n.body));
  mb.append(toolsEl(body));
  mb.append(body);
  detailGallery(n, () => renderNoteDetail());
  body.oninput = () => {
    n.body = editableHtml(body);
    save();
  };
  body.onblur = () => {
    n.body = editableHtml(body);
    save();
    renderAll();
  };
  mb.append(
    aiRow(
      () => ({ title: n.title, text: plain(n.body) }),
      (kind, out) => {
        if (kind === "checklist") {
          for (const t of linesOf(out))
            n.checklist.push({ id: uid(), text: t, done: false });
        } else if (kind === "ideas") {
          n.body =
            n.body +
            (n.body ? "<br>" : "") +
            linesOf(out)
              .map((l) => `- ${escHtml(l)}`)
              .join("<br>");
        } else {
          n.body = escHtml(out).replace(/\n/g, "<br>");
        }
        save();
        renderAll();
        renderNoteDetail();
      },
    ),
  );
  // checklist with progress — identical block to card modal (parity)
  mb.append(el("strong", `Checklist ${doneCount(n)}/${n.checklist.length}`));
  const bar = el("div", "bar"),
    fill = el("i");
  fill.style.width = n.checklist.length
    ? `${Math.round((doneCount(n) / n.checklist.length) * 100)}%`
    : "0%";
  bar.append(fill);
  mb.append(bar);
  const cl = el("div", null, "clist");
  for (const i of n.checklist) {
    const r = el("div", null, "mrow"),
      cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = i.done;
    cb.onchange = () => {
      i.done = cb.checked;
      save();
      renderAll();
      renderNoteDetail();
    };
    const sp = el("span", i.text, "mgrow");
    const x = el("button", null, "iconbtn");
    x.title = "remove item";
    x.append(ico("del"));
    x.onclick = () => {
      n.checklist = n.checklist.filter((x) => x.id !== i.id);
      save();
      renderAll();
      renderNoteDetail();
    };
    r.append(cb, sp, x);
    cl.append(r);
  }
  mb.append(cl);
  const add = el("div", null, "mrow"),
    ai = document.createElement("input");
  ai.type = "text";
  ai.placeholder = "Add checklist item… (Enter for batch lines)";
  ai.onkeydown = (ev) => {
    if (ev.key !== "Enter") return;
    ev.preventDefault();
    for (const line of ai.value.split("\n")) {
      const t = line.trim();
      if (t) n.checklist.push({ id: uid(), text: t, done: false });
    }
    save();
    renderAll();
    renderNoteDetail();
  };
  add.append(ai);
  mb.append(add);
  const foot = el("div", null, "mrow"),
    saveBtn = el("button", "Save", null);
  saveBtn.onclick = () => {
    // flush any pending contenteditable edits, then persist
    const b = mb.querySelector(".rich");
    if (b) {
      n.body = editableHtml(b);
      b.blur();
    }
    save();
    renderAll();
    modal.close();
    toast("Note saved");
  };
  const edit = el("button", "edit in popup", "fbtn");
  edit.onclick = () => {
    modal.close();
    openCompose("note", n.id);
  };
  const arc = el("button", "archive", "fbtn");
  arc.onclick = () => {
    n.archived = true;
    save();
    modal.close();
    renderAll();
  };
  const close = el("button", "close", "fbtn");
  close.onclick = () => modal.close();
  foot.append(saveBtn, edit, arc, close);
  mb.append(foot);
}
function renderModal() {
  const c = s.cards.find((x) => x.id === modalId);
  if (!c) {
    modal.close();
    return;
  }
  mb.replaceChildren();
  const title = document.createElement("input");
  title.type = "text";
  title.value = c.title;
  title.onchange = () => {
    c.title = title.value.trim() || c.title;
    save();
    renderAll();
    renderModal();
  };
  mb.append(title);
  const meta = el("div", null, "mrow");
  const ls = document.createElement("select");
  for (const l of s.lists) {
    const o = document.createElement("option");
    o.value = l.id;
    o.textContent = l.name;
    if (l.id === c.list) o.selected = true;
    ls.append(o);
  }
  ls.onchange = () => {
    c.list = ls.value;
    log(`moved “${c.title}” → ${s.lists.find((x) => x.id === ls.value).name}`);
    save();
    renderAll();
  };
  const due = document.createElement("input");
  due.type = "date";
  due.value = c.due || "";
  due.onchange = () => {
    c.due = due.value || null;
    save();
    renderAll();
    renderModal();
  };
  const done = el("button", null, "fbtn");
  done.title = c.done ? "reopen" : "mark done";
  done.append(ico(c.done ? "restore" : "check"));
  done.append(document.createTextNode(c.done ? " Done" : " Mark done"));
  done.onclick = () => {
    c.done = !c.done;
    save();
    renderAll();
    renderModal();
  };
  meta.append(ls, due, done);
  mb.append(meta);
  mb.append(labelRow(c));
  if (openPal === c.id) mb.append(palRow(c));
  renderSuggests(c, () => renderModal());
  const desc = el("div", null, "rich");
  desc.contentEditable = "true";
  desc.dataset.ph = "Description… (select text for bold, color, size)";
  desc.append(htmlNodes(c.desc));
  mb.append(toolsEl(desc));
  mb.append(desc);
  mb.append(
    aiRow(
      () => ({ title: c.title, text: plain(c.desc) }),
      (kind, out) => {
        if (kind === "checklist") {
          for (const t of linesOf(out))
            c.checklist.push({ id: uid(), text: t, done: false });
        } else if (kind === "ideas") {
          c.desc =
            c.desc +
            (c.desc ? "<br>" : "") +
            linesOf(out)
              .map((l) => `- ${escHtml(l)}`)
              .join("<br>");
        } else {
          c.desc = escHtml(out).replace(/\n/g, "<br>");
        }
        save();
        renderModal();
      },
    ),
  );
  detailGallery(c, () => renderModal());
  desc.oninput = () => {
    c.desc = editableHtml(desc);
    save();
  };
  desc.onblur = () => {
    c.desc = editableHtml(desc);
    save();
    renderAll();
  };
  // checklist with progress (Trello parity)
  mb.append(el("strong", `Checklist ${doneCount(c)}/${c.checklist.length}`));
  const bar = el("div", "bar"),
    fill = el("i");
  fill.style.width = c.checklist.length
    ? `${Math.round((doneCount(c) / c.checklist.length) * 100)}%`
    : "0%";
  bar.append(fill);
  mb.append(bar);
  const cl = el("div", null, "clist");
  for (const i of c.checklist) {
    const r = el("div", null, "mrow"),
      cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = i.done;
    cb.onchange = () => {
      i.done = cb.checked;
      save();
      renderAll();
      renderModal();
    };
    const sp = el("span", i.text, "mgrow"),
      cv = el("button", null, "iconbtn");
    cv.title = "convert to card";
    cv.append(ico("convert"));
    cv.onclick = () => {
      s.cards.push({
        id: uid(),
        title: i.text,
        desc: "",
        done: false,
        list: c.list,
        labels: [...c.labels],
        checklist: [],
        comments: [],
        due: null,
        archived: false,
      });
      c.checklist = c.checklist.filter((x) => x.id !== i.id);
      log(`converted “${i.text}” to card`);
      save();
      renderAll();
      renderModal();
    };
    const x = el("button", null, "iconbtn");
    x.title = "remove item";
    x.append(ico("del"));
    x.onclick = () => {
      c.checklist = c.checklist.filter((x) => x.id !== i.id);
      save();
      renderAll();
      renderModal();
    };
    r.append(cb, sp, cv, x);
    cl.append(r);
  }
  mb.append(cl);
  const add = el("div", null, "mrow"),
    ai = document.createElement("input");
  ai.type = "text";
  ai.placeholder = "Add checklist item… (Enter for batch lines)";
  ai.onkeydown = (ev) => {
    if (ev.key !== "Enter") return;
    ev.preventDefault();
    for (const line of ai.value.split("\n")) {
      const t = line.trim();
      if (t) c.checklist.push({ id: uid(), text: t, done: false });
    }
    save();
    renderAll();
    renderModal();
  };
  add.append(ai);
  mb.append(add);
  // comments (local activity on card)
  mb.append(el("strong", `Comments (${c.comments.length})`));
  for (const m of c.comments) {
    const d = el("div", null, "cmt");
    d.append(
      el("small", new Date(m.ts).toLocaleString()),
      document.createTextNode(` ${m.text}`),
    );
    mb.append(d);
  }
  const cm = el("div", null, "mrow"),
    ci2 = document.createElement("input");
  ci2.type = "text";
  ci2.placeholder = "Write a comment…";
  ci2.onkeydown = (ev) => {
    if (ev.key !== "Enter" || !ci2.value.trim()) return;
    c.comments.push({ id: uid(), text: ci2.value.trim(), ts: Date.now() });
    save();
    renderAll();
    renderModal();
  };
  cm.append(ci2);
  mb.append(cm);
  const foot = el("div", null, "mrow"),
    saveBtn = el("button", "Save", null);
  saveBtn.onclick = () => {
    const d = mb.querySelector(".rich");
    if (d) {
      c.desc = editableHtml(d);
      d.blur();
    }
    save();
    renderAll();
    modal.close();
    toast("Card saved");
  };
  const arc = el("button", "archive card", "fbtn");
  arc.onclick = () => {
    c.archived = true;
    log(`archived “${c.title}”`);
    save();
    modal.close();
    renderAll();
  };
  const close = el("button", "close", "fbtn");
  close.onclick = () => modal.close();
  foot.append(saveBtn, arc, close);
  mb.append(foot);
}
mb.onclick = (e) => {
  const t = e.target.closest('[data-act="tag"]');
  if (t) {
    filter.tag = t.dataset.t;
    modal.close();
    renderAll();
    return;
  }
  const p = e.target.closest('[data-act="pick"]');
  if (p) {
    toggleLabel(p.dataset.id, p.dataset.c);
    rerender();
    return;
  }
  const l = e.target.closest('[data-act="label"]');
  if (l) {
    openPal = openPal === l.dataset.id ? null : l.dataset.id;
    rerender();
    renderAll();
    return;
  }
};
function rerender() {
  if (noteDetailId) renderNoteDetail();
  else renderModal();
}
// auto-startup (Tauri desktop or Go host) + local JSON backup
// ponytail: Tauri invoke called directly, no npm plugin wrapper until it earns it
const stBtn = document.getElementById("startup");
async function startupBackend() {
  const core = window.__TAURI__?.core;
  if (core?.invoke) {
    return {
      get: () => core.invoke("plugin:autostart|is_enabled"),
      set: async (on) => {
        await core.invoke(
          on ? "plugin:autostart|enable" : "plugin:autostart|disable",
        );
        return on;
      },
    };
  }
  const r = await fetch("api/startup");
  if (!r.ok) return null;
  return {
    get: () => r.json().then((j) => j.enabled),
    set: (on) =>
      fetch("api/startup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: on }),
      })
        .then((x) => x.json())
        .then((k) => k.enabled),
  };
}
startupBackend()
  .then(async (b) => {
    if (!b) return;
    stBtn.hidden = false;
    const on = await b.get();
    stBtn.dataset.on = on ? "1" : "";
    if (on) toast("Launch on login is on");
    stBtn.onclick = async () => {
      const now = await b.set(stBtn.dataset.on !== "1");
      stBtn.dataset.on = now ? "1" : "";
      toast(now ? "Launch on login: on" : "Launch on login: off");
    };
  })
  .catch(() => {});
document.getElementById("export").onclick = () => {
  try {
    const raw = JSON.stringify({
      ...s,
      activity: [],
      settings: { ...s.settings, key: "" },
    });
    const b = new Blob([raw], { type: "application/json" }),
      a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = `t-notes-backup-${today()}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast(`Backup exported (${s.notes.length} notes, ${s.cards.length} cards)`);
  } catch {
    toast("Export failed: nothing to save yet");
  }
};
const impF = document.getElementById("import-file");
document.getElementById("import").onclick = () => impF.click();
impF.onchange = () => {
  const f = impF.files[0];
  impF.value = "";
  if (!f) return;
  const r = new FileReader();
  r.onerror = () => toast("Import failed: could not read file");
  r.onload = () => {
    try {
      const d = normalize(JSON.parse(r.result));
      if (!d.notes.length && !d.cards.length) throw 0;
      Object.assign(s, d);
      save();
      renderAll();
      toast(`Imported ${d.notes.length} notes, ${d.cards.length} cards`);
    } catch {
      toast("Import failed: invalid backup file");
    }
  };
  r.readAsText(f);
};
function renderAll() {
  renderFilters();
  renderNotes();
  renderBoard();
}
renderAll();
