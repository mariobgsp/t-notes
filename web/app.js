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
      model: "muse-spark-1.3-contributor",
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
    model: "muse-spark-1.3-contributor",
  },
  custom: { label: "Custom", baseUrl: "", model: "" },
};
const escHtml = (x) =>
  String(x ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
async function aiChat(prompt, maxTokens = 500, st = s.settings) {
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
  query = "";
const save = () => localStorage.setItem(K, JSON.stringify(s));
const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
const today = () => new Date().toISOString().slice(0, 10);
function el(tag, text, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
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
  const t = el("button", "🏷", "tagbtn");
  t.title = "labels";
  t.dataset.act = "label";
  t.dataset.id = it.id;
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
  col.append(labelRow(n));
  if (openPal === n.id) col.append(palRow(n));
  d.append(col);
  const e2 = el("button", "✎", "iconbtn");
  e2.title = "edit note";
  e2.dataset.edit = n.id;
  d.append(e2);
  const a = el("button", arch ? "↩" : "📦", "iconbtn");
  a.title = arch ? "restore" : "archive";
  a.dataset.arc = n.id;
  d.append(a);
  const b = el("button", "×", "del");
  b.dataset.id = n.id;
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
      s.notes.length ? "No matches." : "No notes yet — hit + New note.",
    );
    p.style.color = "var(--mut)";
    nl.append(p);
  }
  for (const n of live) nl.append(noteEl(n, false));
  for (const n of old) an.append(noteEl(n, true));
}
nl.onclick = noteClick;
an.onclick = noteClick;
function noteClick(e) {
  const main = e.target.closest(".note");
  if (main && !e.target.closest("button,input,select")) {
    if (!window.getSelection().toString()) openNote(main.dataset.id);
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
  renderAll();
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
    row.append(el("span", "📝", "badge"));
  }
  if (c.checklist.length) {
    row.append(el("span", `${doneCount(c)}/${c.checklist.length}`, "badge"));
  }
  if (c.comments.length) {
    row.append(el("span", `💬${c.comments.length}`, "badge"));
  }
  if (c.due) {
    const over = !c.done && c.due < today(),
      b = el("span", `📅${c.due}`, `badge${over ? " over" : ""}`);
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
    const b = el("button", "←", "mv");
    b.dataset.act = "mv";
    b.dataset.dir = "-1";
    b.dataset.id = c.id;
    d.append(b);
  }
  if (i < s.lists.length - 1) {
    const b = el("button", "→", "mv");
    b.dataset.act = "mv";
    b.dataset.dir = "1";
    b.dataset.id = c.id;
    d.append(b);
  }
  const o = el("button", "⧉", "iconbtn");
  o.title = "open";
  o.dataset.act = "open";
  o.dataset.id = c.id;
  d.append(o);
  const x = el("button", "×", "del");
  x.dataset.act = "del";
  x.dataset.id = c.id;
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
    const n = s.cards.filter((c) => c.list === l.id && !c.archived).length;
    head.append(el("span", String(n), "badge"));
    const rn = el("button", "✎", "iconbtn");
    rn.title = "rename";
    rn.dataset.rn = l.id;
    head.append(rn);
    const dl = el("button", "×", "iconbtn");
    dl.title = "delete list (archives its cards)";
    dl.dataset.dl = l.id;
    head.append(dl);
    col.append(head);
    const wrap = el("div", null, "cards");
    wrap.id = `c-${l.id}`;
    wrap.dataset.list = l.id;
    for (const c of s.cards.filter(
      (x) => x.list === l.id && !x.archived && matches(x),
    ))
      wrap.append(cardEl(c));
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
const composeDlg = document.getElementById("compose"),
  cH = document.getElementById("compose-h"),
  cTitle = document.getElementById("compose-title"),
  cText = document.getElementById("compose-text"),
  cListRow = document.getElementById("compose-listrow"),
  cList = document.getElementById("compose-list");
document.getElementById("compose-tools").append(toolsEl(cText));
function openCompose(mode, id) {
  composeMode = mode;
  editId = id || null;
  cListRow.hidden = mode !== "card";
  cTitle.value = "";
  cText.replaceChildren();
  if (mode === "card") {
    cList.replaceChildren();
    for (const l of s.lists) {
      const o = document.createElement("option");
      o.value = l.id;
      o.textContent = l.name;
      cList.append(o);
    }
  }
  if (mode === "note" && editId) {
    const n = s.notes.find((x) => x.id === editId);
    cH.textContent = "Edit note";
    cTitle.value = n.title || "";
    cText.append(htmlNodes(n.body || ""));
  } else {
    cH.textContent = mode === "note" ? "New note" : "New card";
    if (mode === "card" && !s.lists.length) {
      cListRow.hidden = true;
    }
  }
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
      toast("Note updated");
    } else {
      s.notes.unshift({
        id: uid(),
        title: t,
        body: html,
        labels: [],
        checklist: [],
        archived: false,
      });
      toast("Note saved");
    }
  } else {
    if (!s.lists.length) {
      toast("Add a list first");
      return;
    }
    s.cards.push({
      id: uid(),
      title: t,
      desc: html,
      done: false,
      list: cList.value || s.lists[0].id,
      labels: [],
      checklist: [],
      comments: [],
      due: null,
      archived: false,
    });
    log(`added “${t}”`);
    toast("Card added");
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
  const out = await aiChat("Reply with exactly: OK", 5, {
    provider: "custom",
    baseUrl: setUrl.value,
    model: setModel.value,
    key: setKey.value,
  });
  setMsg.textContent =
    out && out.includes("OK") ? "Connected" : "Failed — check URL, model, key";
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
    `Summarize this note in 2-3 short sentences. Plain text only, no headers:\n\n${t}`,
  checklist: (t) =>
    `Turn this note into a short checklist. Reply with one item per line, no bullets or numbers:\n\n${t}`,
  improve: (t) =>
    `Rewrite this note clearly with proper grammar. Keep the same meaning and language. Reply with the rewritten note only:\n\n${t}`,
  ideas: (t) =>
    `Suggest 3 short, practical next steps for this note. One per line, no numbering:\n\n${t}`,
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
    .map((l) => l.trim().replace(/^manent[-*\d.)\s]+/, ""))
    .filter(Boolean);
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
  const out = await aiChat(AI_PROMPTS[kind](body.slice(0, 6000)));
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
        const cur = editableHtml(cText);
        const add = linesOf(out)
          .map((l) => `- ${escHtml(l)}`)
          .join("<br>");
        cText.replaceChildren(htmlNodes(cur + (cur ? "<br>" : "") + add));
      } else {
        cText.replaceChildren(htmlNodes(escHtml(out).replace(/\n/g, "<br>")));
      }
    },
  ),
);
// native HTML5 drag & drop, zero deps
let dragId = null;
board.addEventListener("dragstart", (e) => {
  const card = e.target.closest("[data-cid]");
  if (!card) return;
  dragId = card.dataset.cid;
  e.dataTransfer.effectAllowed = "move";
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
  if (!w || !dragId) return;
  e.preventDefault();
  document
    .querySelectorAll(".col.drop")
    .forEach((x) => x.classList.remove("drop"));
  const c = s.cards.find((x) => x.id === dragId);
  if (c && c.list !== w.dataset.list) {
    c.list = w.dataset.list;
    const l = s.lists.find((x) => x.id === w.dataset.list);
    log(`moved “${c.title}” → ${l.name}`);
    save();
    renderAll();
  }
  dragId = null;
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
  mb.append(labelRow(n));
  if (openPal === n.id) mb.append(palRow(n));
  const body = el("div", null, "rich");
  body.contentEditable = "true";
  body.dataset.ph = "Note body… (select text for bold, color, size)";
  body.append(htmlNodes(n.body));
  mb.append(toolsEl(body));
  mb.append(body);
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
    const x = el("button", "×", "iconbtn");
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
    edit = el("button", "edit in popup", "fbtn");
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
  foot.append(edit, arc, close);
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
  const done = el("button", c.done ? "✅ done" : "mark done", "fbtn");
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
      cv = el("button", "⧉", "iconbtn");
    cv.title = "convert to card";
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
    const x = el("button", "×", "iconbtn");
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
    arc = el("button", "archive card", "fbtn");
  arc.onclick = () => {
    c.archived = true;
    log(`archived “${c.title}”`);
    save();
    modal.close();
    renderAll();
  };
  const close = el("button", "close", "fbtn");
  close.onclick = () => modal.close();
  foot.append(arc, close);
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
