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
for (const n of s.notes) {
  n.labels = n.labels || [];
  n.archived = !!n.archived;
}
for (const c of s.cards) {
  c.title = c.title || c.text || "";
  delete c.text;
  c.desc = c.desc || "";
  c.list = c.list || c.col || "todo";
  delete c.col;
  c.labels = c.labels || [];
  c.checklist = c.checklist || [];
  c.comments = c.comments || [];
  c.due = c.due || null;
  c.archived = !!c.archived;
}
s.activity = s.activity || [];
// ponytail: Trello classic palette, 6 fixed colors — no custom-color picker until asked
const COLORS = [
  ["green", "#61bd4f"],
  ["yellow", "#f2d600"],
  ["orange", "#ff9f1a"],
  ["red", "#eb5a46"],
  ["purple", "#c377e0"],
  ["blue", "#0079bf"],
];
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
  if (filter.label && !it.labels.includes(filter.label)) return false;
  if (filter.tag && !hasTag(it.title || it.text, filter.tag)) return false;
  if (
    query &&
    !`${it.title || it.text} ${it.desc || ""}`.toLowerCase().includes(query)
  )
    return false;
  return true;
}
function labelRow(it) {
  const row = el("div", null, "labels");
  for (const [name, hex] of COLORS) {
    if (!it.labels.includes(name)) continue;
    const d = el("button", null, "dot");
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
const ni = document.getElementById("note-input"),
  nl = document.getElementById("notes"),
  an = document.getElementById("arch-notes");
document.getElementById("note-form").onsubmit = (e) => {
  e.preventDefault();
  const t = ni.value.trim();
  if (!t) return;
  s.notes.unshift({ id: uid(), text: t, labels: [], archived: false });
  ni.value = "";
  save();
  renderAll();
};
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
    sp = el("span", null, "t");
  sp.append(textWithTags(n.text));
  top.append(sp);
  col.append(top, labelRow(n));
  if (openPal === n.id) col.append(palRow(n));
  d.append(col);
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
  if (!live.length) {
    const p = el("p", s.notes.length ? "No matches." : "No notes yet.");
    p.style.color = "var(--mut)";
    nl.append(p);
  }
  for (const n of live) nl.append(noteEl(n, false));
  for (const n of old) an.append(noteEl(n, true));
}
nl.onclick = noteClick;
an.onclick = noteClick;
function noteClick(e) {
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
    return;
  }
  const b = e.target.closest(".del");
  if (!b) return;
  s.notes = s.notes.filter((n) => n.id !== b.dataset.id);
  save();
  renderAll();
}
// ---- board: custom lists + cards ----
const ci = document.getElementById("card-input"),
  cs = document.getElementById("card-list"),
  board = document.getElementById("board");
document.getElementById("card-form").onsubmit = (e) => {
  e.preventDefault();
  const t = ci.value.trim();
  if (!t || !s.lists.length) return;
  s.cards.push({
    id: uid(),
    title: t,
    desc: "",
    done: false,
    list: cs.value || s.lists[0].id,
    labels: [],
    checklist: [],
    comments: [],
    due: null,
    archived: false,
  });
  log(`added “${t}”`);
  ci.value = "";
  save();
  renderAll();
};
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
function renderBoard() {
  cs.replaceChildren();
  for (const l of s.lists) {
    const o = document.createElement("option");
    o.value = l.id;
    o.textContent = l.name;
    cs.append(o);
  }
  board.replaceChildren();
  for (const l of s.lists) {
    const col = el("div", null, "col"),
      head = el("div", null, "colhead"),
      h = el("h2", l.name);
    head.append(h);
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
  } else if (a === "open") openModal(c.id);
  else if (a === "del") {
    c.archived = true;
    log(`archived “${c.title}”`);
    save();
    renderAll();
  } else if (a === "mv") {
    const i = s.lists.findIndex((l) => l.id === c.list) + Number(b.dataset.dir);
    c.list = s.lists[i].id;
    if (s.lists[i].name.toLowerCase() === "done") c.done = true;
    log(`moved “${c.title}” → ${s.lists[i].name}`);
    save();
    renderAll();
  }
};
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
function openModal(id) {
  modalId = id;
  renderModal();
  modal.showModal();
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
  const desc = document.createElement("textarea");
  desc.rows = 3;
  desc.placeholder = "Description…";
  desc.value = c.desc;
  desc.onchange = () => {
    c.desc = desc.value;
    save();
    renderAll();
  };
  mb.append(desc);
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
    renderModal();
    return;
  }
  const l = e.target.closest('[data-act="label"]');
  if (l) {
    openPal = openPal === l.dataset.id ? null : l.dataset.id;
    renderModal();
    renderAll();
    return;
  }
};
// auto-startup (Windows host only) + local JSON backup
const stBtn = document.getElementById("startup");
fetch("api/startup")
  .then((r) => (r.ok ? r.json() : null))
  .then((j) => {
    if (!j) return;
    stBtn.hidden = false;
    stBtn.dataset.on = j.enabled ? "1" : "";
    stBtn.onclick = () =>
      fetch("api/startup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: stBtn.dataset.on !== "1" }),
      })
        .then((r) => r.json())
        .then((k) => {
          stBtn.dataset.on = k.enabled ? "1" : "";
        });
  })
  .catch(() => {});
document.getElementById("export").onclick = () => {
  const b = new Blob([localStorage.getItem(K)], { type: "application/json" }),
    a = document.createElement("a");
  a.href = URL.createObjectURL(b);
  a.download = `t-notes-backup-${today()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};
const impF = document.getElementById("import-file");
document.getElementById("import").onclick = () => impF.click();
impF.onchange = () => {
  const f = impF.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!Array.isArray(d.notes) || !Array.isArray(d.cards)) throw 0;
      Object.assign(s, {
        notes: d.notes,
        lists: d.lists && d.lists.length ? d.lists : s.lists,
        cards: d.cards,
        activity: [],
      });
      save();
      renderAll();
    } catch {
      alert("Invalid backup file");
    }
  };
  r.readAsText(f);
  impF.value = "";
};
function renderAll() {
  renderFilters();
  renderNotes();
  renderBoard();
}
renderAll();
