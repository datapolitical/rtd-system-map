(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const form = $("shot-form"), files = $("files"), note = $("note"), previews = $("previews");
  const send = $("send"), sendLabel = send.querySelector(".label"), sent = $("sent"), error = $("error");
  const drafts = new Map(); // keep half-typed comments across refreshes
  const flips = new Map();  // keep before/after choices across refreshes
  const keepOpen = new Set(); // reviews answered in this page view stay on top until reload
  let csrf = "";
  let urls = [];

  function showError(msg) { error.textContent = msg || ""; error.hidden = !msg; }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, { credentials: "same-origin", ...opts });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
    return data;
  }

  async function ensureSession() {
    if (!csrf) csrf = (await api("/shots/api/session")).csrf;
    return csrf;
  }

  // ---------- upload ----------
  function clearPreviews() { urls.forEach(URL.revokeObjectURL); urls = []; previews.replaceChildren(); }

  files.addEventListener("change", () => {
    clearPreviews();
    sent.hidden = true;
    for (const f of files.files) {
      const url = URL.createObjectURL(f);
      urls.push(url);
      const img = el("img");
      img.src = url;
      img.alt = f.name;
      previews.append(img);
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showError("");
    sent.hidden = true;
    if (!files.files.length) { showError("Choose at least one screenshot."); return; }
    const body = new FormData();
    for (const f of files.files) body.append("files", f, f.name);
    body.append("note", note.value);
    send.disabled = true;
    sendLabel.textContent = "Sending…";
    try {
      const data = await api("/shots/api/items", {
        method: "POST", headers: { "X-CSRF-Token": await ensureSession() }, body,
      });
      const n = data.saved.length;
      sent.textContent = `Sent ${n} screenshot${n === 1 ? "" : "s"}.`;
      sent.hidden = false;
      form.reset();
      clearPreviews();
      load();
    } catch (e) {
      showError(e.message);
    } finally {
      send.disabled = false;
      sendLabel.textContent = "Send to Claude";
    }
  });

  // ---------- shared pieces ----------
  function badge(status) {
    const labels = { new: "new", seen: "seen", done: "done", open: "needs you", commented: "answered", closed: "closed" };
    return el("span", `badge ${status}`, labels[status] || status);
  }

  function thumb(src, alt) {
    const a = el("a", "thumb");
    a.href = src;
    a.target = "_blank";
    a.rel = "noopener";
    const img = el("img");
    img.src = src;
    img.alt = alt;
    img.loading = "lazy";
    a.append(img);
    return a;
  }

  function thread(comments) {
    const ul = el("ul", "thread");
    for (const c of comments.filter((x) => !("choice" in x))) { // picks show in their choice box
      const li = el("li", "comment");
      const head = el("div", "comment-head");
      head.append(el("span", "who", "You"), el("span", "when", c.at), badge(c.status));
      li.append(head, el("p", "comment-text", c.text));
      if (c.reply) {
        const r = el("div", "reply");
        const rh = el("div", "comment-head");
        rh.append(el("span", "who", "Claude"), el("span", "when", c.reply_at));
        r.append(rh, el("p", "comment-text", c.reply));
        li.append(r);
      }
      ul.append(li);
    }
    return ul;
  }

  function commentBox(target, placeholder) {
    const wrap = el("form", "comment-form");
    const ta = el("textarea");
    ta.rows = 2;
    ta.maxLength = 4000;
    ta.placeholder = placeholder;
    ta.setAttribute("aria-label", placeholder);
    ta.value = drafts.get(target) || "";
    ta.addEventListener("input", () => drafts.set(target, ta.value));
    const btn = el("button", "secondary", "Send comment");
    btn.type = "submit";
    const status = el("p", "small comment-status");
    status.setAttribute("role", "status");
    wrap.append(ta, btn, status);
    wrap.addEventListener("submit", async (event) => {
      event.preventDefault();
      const text = ta.value.trim();
      if (!text) { status.textContent = "Write a comment first."; return; }
      btn.disabled = true;
      status.textContent = "Sending…";
      try {
        await api("/shots/api/comments", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": await ensureSession() },
          body: JSON.stringify({ target, text }),
        });
        drafts.delete(target);
        load();
      } catch (e) {
        status.textContent = e.message;
        btn.disabled = false;
      }
    });
    return wrap;
  }

  // ---------- review requests from Claude ----------
  const reviewImg = (rid, name) => `/shots/api/image/review/${encodeURIComponent(rid)}/${encodeURIComponent(name)}`;

  function linkRow(links) {
    const row = el("span", "links");
    links.forEach((l, i) => {
      if (i) row.append(" · ");
      const a = el("a", "", l.label);
      a.href = l.url;
      a.target = "_blank";
      a.rel = "noopener";
      row.append(a);
    });
    return row;
  }

  function seg(state, labels) {
    const s = el("span", "seg");
    for (const v of ["before", "after"]) {
      const b = el("button", "", v === "before" ? (labels ? labels[0] : "Before") : (labels ? labels[1] : "After"));
      b.type = "button";
      b.dataset.s = v;
      b.setAttribute("aria-pressed", String(v === state));
      s.append(b);
    }
    return s;
  }

  function setFlip(card, state) {
    if (card.dataset.key) flips.set(card.dataset.key, state);
    card.classList.toggle("show-before", state === "before");
    const tag = card.querySelector(".tag");
    if (tag) tag.textContent = state === "before" ? (card.dataset.lb || "Before") : (card.dataset.la || "After");
    for (const b of card.querySelectorAll(".item-row .seg button")) b.setAttribute("aria-pressed", String(b.dataset.s === state));
  }

  function commentToggle(target, label, placeholder) {
    const d = el("details", "comment-toggle");
    d.append(el("summary", "", label), commentBox(target, placeholder));
    if (drafts.get(target)) d.open = true;
    d.addEventListener("toggle", () => { if (d.open) d.querySelector("textarea").focus(); });
    return d;
  }

  // ---------- one-tap choices ----------
  async function sendPick(target, choice, text) {
    await api("/shots/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": await ensureSession() },
      body: JSON.stringify({ target, choice, text }),
    });
  }

  function choiceBox(r, target, choices, picked, notes = []) {
    const box = el("div", "choices");
    const closed = r.status === "closed";
    const buttons = el("div", `choice-buttons${choices.length === 3 || choices.length > 4 ? " three" : ""}`);
    buttons.setAttribute("role", "group");
    buttons.setAttribute("aria-label", "Your pick");
    const noteKey = `note:${target}`;
    const status = el("p", "small choice-status");
    status.setAttribute("role", "status");
    const ta = el("textarea", "choice-note");
    ta.rows = 1;
    ta.maxLength = 4000;
    ta.placeholder = picked ? "Add a note to your pick (optional)" : "Note: sent with your pick, or on its own";
    ta.setAttribute("aria-label", picked ? "Note with your pick (optional)" : "Note, with a pick or on its own");
    ta.value = drafts.get(noteKey) || "";

    async function pick(choice) {
      const text = ta.value.trim();
      if (picked && picked.choice === choice && !text) { status.textContent = `${choice} is already your pick.`; return; }
      for (const b of buttons.querySelectorAll("button")) { b.disabled = true; b.setAttribute("aria-pressed", String(b.dataset.choice === choice)); }
      status.textContent = "Saving…";
      try {
        await sendPick(target, choice, text);
        drafts.delete(noteKey);
        keepOpen.add(r.id);
        load();
      } catch (e) {
        status.textContent = e.message;
        for (const b of buttons.querySelectorAll("button")) b.disabled = false;
      }
    }

    for (const c of choices) {
      const b = el("button", "choice");
      b.type = "button";
      b.dataset.choice = c;
      b.setAttribute("aria-pressed", String(!!picked && picked.choice === c));
      b.append(el("span", "tick", "✓"), el("span", "", c));
      b.disabled = closed;
      b.addEventListener("click", () => pick(c));
      buttons.append(b);
    }
    box.append(buttons);
    if (picked) {
      const head = el("div", "comment-head picked-line");
      head.append(el("span", "who", `You picked ${picked.choice}`), el("span", "when", picked.at), badge(picked.status));
      status.append(head);
      if (picked.text) status.append(el("span", "picked-note", picked.text));
    } else if (notes.length) {
      const last = notes[notes.length - 1];
      const head = el("div", "comment-head picked-line");
      head.append(el("span", "who", "You sent a note without picking"), el("span", "when", last.at), badge(last.status));
      status.append(head, el("span", "picked-note", last.text));
    } else if (!closed) {
      status.textContent = "Tap one (you can change it later), or write a note and send it without picking.";
    }
    box.append(status);
    if (picked && picked.reply) {
      const rp = el("div", "reply");
      const rh = el("div", "comment-head");
      rh.append(el("span", "who", "Claude"), el("span", "when", picked.reply_at));
      rp.append(rh, el("p", "comment-text", picked.reply));
      box.append(rp);
    }
    if (!closed) {
      const row = el("form", "choice-note-row");
      let send = null;
      ta.addEventListener("input", () => { drafts.set(noteKey, ta.value); if (send) send.hidden = !ta.value.trim(); });
      row.append(ta);
      if (picked) {
        send = el("button", "secondary", "Send note");
        send.type = "submit";
        send.hidden = !ta.value.trim();
        row.append(send);
        row.addEventListener("submit", (e) => { e.preventDefault(); pick(picked.choice); });
      } else {
        // A note with no pick: sent as a plain comment on the same question.
        send = el("button", "secondary", "Send without picking");
        send.type = "submit";
        send.hidden = !ta.value.trim();
        row.append(send);
        row.addEventListener("submit", async (e) => {
          e.preventDefault();
          const text = ta.value.trim();
          if (!text) { status.textContent = "Write a note first."; return; }
          send.disabled = true;
          status.textContent = "Sending…";
          try {
            await api("/shots/api/comments", {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-CSRF-Token": await ensureSession() },
              body: JSON.stringify({ target, text }),
            });
            drafts.delete(noteKey);
            keepOpen.add(r.id);
            load();
          } catch (err) {
            status.textContent = err.message;
            send.disabled = false;
          }
        });
      }
      box.append(row);
    }
    return box;
  }

  function itemCard(r, it) {
    const flip = it.before && it.after;
    const card = el("article", `item ${flip || it.images.length ? "with-pic" : "plain"}`);
    card.dataset.key = `${r.id}/${it.id}`;
    if (it.labels) { card.dataset.lb = it.labels[0]; card.dataset.la = it.labels[1]; }
    const asksPerItem = r.sections.some((sec) => sec.items.some((x) => x.ask));
    if (asksPerItem && !it.ask) card.append(el("span", "info-tag", "For information"));
    if (it.title) card.append(el("h4", "", it.title));
    if (it.text) card.append(el("p", "what", it.text));
    if (it.ask) { const a = el("div", "item-ask"); a.append(el("strong", "", "Needs your answer: "), it.ask); card.append(a); }
    if (it.choices && it.choices.length) card.append(choiceBox(r, `item:${r.id}/${it.id}`, it.choices, it.picked));
    if (flip) {
      const pic = el("div", "pic");
      pic.setAttribute("role", "button");
      pic.tabIndex = 0;
      pic.setAttribute("aria-label", it.labels ? `Flip between ${it.labels[0]} and ${it.labels[1]}` : "Flip between before and after");
      const [lb, la] = it.labels || ["Before", "After"];
      const after = el("img", "after"); after.src = reviewImg(r.id, it.after); after.alt = `${it.title}, ${la}`; after.loading = "lazy";
      const before = el("img", "before"); before.src = reviewImg(r.id, it.before); before.alt = `${it.title}, ${lb}`; before.loading = "lazy";
      pic.append(after, before, el("span", "tag", la));
      pic.addEventListener("click", () => setFlip(card, card.classList.contains("show-before") ? "after" : "before"));
      pic.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pic.click(); } });
      card.append(pic);
    }
    if (it.images.length) {
      const g = el("div", "gallery");
      for (const name of it.images) g.append(thumb(reviewImg(r.id, name), name));
      card.append(g);
    }
    if (flip || it.links.length) {
      const row = el("div", "item-row");
      if (flip) {
        const s = seg("after", it.labels);
        s.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setFlip(card, b.dataset.s); });
        row.append(s);
      }
      if (it.links.length) row.append(linkRow(it.links));
      card.append(row);
    }
    if (it.comments.length) card.append(thread(it.comments));
    if (flip && flips.get(card.dataset.key) === "before") setFlip(card, "before");
    if (r.status !== "closed") {
      const label = it.comments.length ? "Add a comment" : it.ask ? "Answer" : asksPerItem ? "Comment (optional)" : "Comment";
      card.append(commentToggle(`item:${r.id}/${it.id}`, label, it.ask ? "Your answer" : "Your comment on this item"));
    }
    return card;
  }

  function reviewBlock(r) {
    const sec = el("section", "block review-block");
    const head = el("div", "section-heading");
    head.append(el("h2", "", r.title), badge(r.status));
    const eyebrow = { open: "Waiting for you", commented: "You answered", closed: "Closed" }[r.status] || "Review";
    sec.append(el("div", "eyebrow", eyebrow), head);
    // The question and its one-tap answers come first; the pictures follow.
    if (r.ask) {
      const waiting = r.status === "open" || (keepOpen.has(r.id) && r.status !== "closed");
      const box = el("div", `ask-box${waiting ? "" : " done"}${r.choices.length ? " with-choices" : ""}`);
      box.append(el("div", "ask-label", waiting ? "What I need from you" : "What was asked"), el("p", "ask-text", r.ask));
      if (r.choices.length) box.append(choiceBox(r, `review:${r.id}`, r.choices, r.picked, r.comments.filter((c) => !("choice" in c))));
      sec.append(box);
    }
    sec.append(el("p", "small", `Posted ${r.created}`));
    if (r.intro) sec.append(el("p", "body", r.intro));
    if (r.status_note) sec.append(el("div", "status-note", r.status_note));
    const flips = r.sections.some((s) => s.items.some((i) => i.before && i.after));
    if (flips) {
      const all = el("div", "all-toggle");
      const s = seg("after");
      s.addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        for (const x of s.querySelectorAll("button")) x.setAttribute("aria-pressed", String(x === b));
        for (const card of sec.querySelectorAll(".item.with-pic")) if (card.querySelector(".pic")) setFlip(card, b.dataset.s);
      });
      all.append(el("span", "small", "All pictures:"), s);
      sec.append(all);
    }
    for (const s of r.sections) {
      if (s.heading) sec.append(el("h3", "", s.heading));
      if (s.note) sec.append(el("p", "small", s.note));
      const grid = el("div", s.items.some((i) => (i.before && i.after) || i.images.length) ? "item-grid" : "item-list");
      for (const it of s.items) grid.append(itemCard(r, it));
      sec.append(grid);
    }
    if (r.links.length) { const p = el("p", "small more"); p.append("More: ", linkRow(r.links)); sec.append(p); }
    if (r.close_note) sec.append(el("p", "closed-note", `Closed ${r.closed_at}: ${r.close_note}`));
    const whole = el("div", "whole");
    if (r.comments.length) whole.append(thread(r.comments));
    if (r.status !== "closed") whole.append(commentToggle(`review:${r.id}`, "Comment on the whole review", "Your overall comment"));
    sec.append(whole);
    return sec;
  }

  // ---------- issues tab ----------
  const issueImg = (name) => `/shots/api/image/issue/${encodeURIComponent(name)}`;

  function issueCard(it) {
    const card = el("article", `card issue${it.fixed ? " fixed" : ""}`);
    const head = el("div", "card-head");
    const t = el("div", "issue-title");
    t.append(el("span", "num", `#${it.number}`), el("strong", "title", it.title));
    head.append(t);
    if (it.fixed) head.append(badge("done"));
    card.append(head);
    const chips = el("div", "chips");
    for (const l of it.labels.filter((l) => !l.startsWith("made by"))) chips.append(el("span", "chip", l));
    if (chips.children.length) card.append(chips);
    if (it.summary) card.append(el("p", "body", it.summary));
    for (const loc of it.locations) {
      const fig = el("figure", "issue-pic");
      if (it.fixed && loc.first && loc.after) {
        const wrap = el("div", "item with-pic");
        wrap.dataset.key = `issue-${it.number}-${loc.url}`;
        const pic = el("div", "pic");
        pic.setAttribute("role", "button");
        pic.tabIndex = 0;
        const after = el("img", "after"); after.src = issueImg(loc.after.img); after.alt = `${loc.label}, after`; after.loading = "lazy";
        const before = el("img", "before"); before.src = issueImg(loc.first.img); before.alt = `${loc.label}, before`; before.loading = "lazy";
        pic.append(after, before, el("span", "tag", "After"));
        pic.addEventListener("click", () => setFlip(wrap, wrap.classList.contains("show-before") ? "after" : "before"));
        const row = el("div", "item-row");
        const sg = seg("after");
        sg.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setFlip(wrap, b.dataset.s); });
        row.append(sg);
        wrap.append(pic, row);
        if (flips.get(wrap.dataset.key) === "before") setFlip(wrap, "before");
        fig.append(wrap);
        fig.append(el("figcaption", "small", `${loc.label}${loc.theme === "dark" ? ", dark" : ""} · before ${loc.first.at}, after ${loc.after.at}`));
      } else if (loc.current) {
        const a = el("a", "pic-link");
        a.href = issueImg(loc.current.img);
        a.target = "_blank";
        a.rel = "noopener";
        const img = el("img");
        img.src = issueImg(loc.current.img);
        img.alt = `Live map at ${loc.label}`;
        img.loading = "lazy";
        a.append(img, el("span", "tag now", "Live map now"));
        fig.append(a, el("figcaption", "small", `${loc.label}${loc.theme === "dark" ? ", dark" : ""} · pictured ${loc.current.at}`));
      } else {
        fig.append(el("p", "small", `${loc.label}: no picture yet`));
      }
      const links = linkRow([{ label: "Open on the live map", url: loc.url }]);
      fig.append(links);
      card.append(fig);
    }
    const more = el("p", "small more");
    more.append(linkRow([{ label: `Issue #${it.number} on GitHub`, url: it.url }]));
    if (it.fixed) more.append(` · closed ${it.closed_at}`);
    card.append(more);
    if (it.comments.length) card.append(thread(it.comments));
    card.append(commentToggle(`issue:${it.number}`, it.comments.length ? "Add a comment" : "Comment", "Your comment on this issue"));
    return card;
  }

  // ---------- tabs ----------
  const TABS = ["review", "issues", "send"];
  let tabChosen = false;

  function showTab(name, push = true) {
    if (!TABS.includes(name)) name = "review";
    for (const b of document.querySelectorAll(".tabs [data-tab]")) b.setAttribute("aria-selected", String(b.dataset.tab === name));
    for (const p of document.querySelectorAll("[data-panel]")) p.hidden = p.dataset.panel !== name;
    if (push && location.hash !== `#${name}`) history.replaceState(null, "", `#${name}`);
  }

  document.querySelector(".tabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (!b) return;
    tabChosen = true;
    showTab(b.dataset.tab);
  });
  window.addEventListener("hashchange", () => { tabChosen = true; showTab(location.hash.slice(1), false); });
  if (TABS.includes(location.hash.slice(1))) { tabChosen = true; showTab(location.hash.slice(1), false); }

  // ---------- Chris's screenshots ----------
  function shotCard(s) {
    const li = el("li", "card shot");
    const row = el("div", "shot-row");
    row.append(thumb(`/shots/api/image/shot/${encodeURIComponent(s.name)}`, s.note || s.name));
    const details = el("div", "shot-details");
    const head = el("div", "card-head");
    head.append(el("strong", "title", s.note || s.original || "Screenshot"), badge(s.status));
    details.append(head);
    const when = s.status === "seen" && s.seen_at ? `Sent ${s.received} · seen ${s.seen_at}` : `Sent ${s.received}`;
    details.append(el("p", "small", when));
    row.append(details);
    li.append(row);
    if (s.done_note) {
      const r = el("div", "reply");
      const rh = el("div", "comment-head");
      rh.append(el("span", "who", "Claude"), el("span", "when", s.done_at));
      r.append(rh, el("p", "comment-text", s.done_note));
      li.append(r);
    }
    if (s.comments.length) li.append(thread(s.comments));
    const actions = el("div", "shot-actions");
    actions.append(commentToggle(`shot:${s.name}`, s.status === "done" ? "Reply to Claude" : "Add a comment",
      s.status === "done" ? "Your reply to Claude" : "More about this screenshot"));
    if (s.status !== "done") {
      const del = el("button", "text-button delete", "Remove screenshot");
      del.type = "button";
      del.addEventListener("click", () => remove(s.name));
      actions.append(del);
    }
    li.append(actions);
    return li;
  }

  async function remove(name) {
    if (!confirm("Remove this screenshot from the inbox?")) return;
    try {
      await api(`/shots/api/items/${encodeURIComponent(name)}`, {
        method: "DELETE", headers: { "X-CSRF-Token": await ensureSession() },
      });
    } catch (e) { showError(e.message); }
    load();
  }

  // ---------- load ----------
  function busyTyping() {
    const a = document.activeElement;
    return a && (a.tagName === "TEXTAREA" || a.tagName === "INPUT");
  }

  async function load() {
    try {
      const data = await api("/shots/api/items");
      showError("");
      const top = (r) => r.status === "open" || (r.status === "commented" && keepOpen.has(r.id));
      const open = data.reviews.filter(top);
      const answered = data.reviews.filter((r) => r.status === "commented" && !top(r));
      const closed = data.reviews.filter((r) => r.status === "closed");
      $("reviews").replaceChildren(...open.map(reviewBlock));
      $("answered").replaceChildren(...answered.map(reviewBlock));
      $("answered-section").hidden = !answered.length;
      $("answered-count").textContent = answered.length ? `(${answered.length})` : "";
      $("closed").replaceChildren(...closed.map(reviewBlock));
      $("closed-section").hidden = !closed.length;
      $("closed-count").textContent = closed.length ? `(${closed.length})` : "";
      $("shots").replaceChildren(...data.shots.map(shotCard));
      $("shots-empty").hidden = data.shots.length > 0;
      $("reviews-empty").hidden = open.length > 0;
      const waiting = open.filter((r) => r.status === "open").length;
      $("n-review").textContent = waiting ? String(waiting) : "";
      const issues = data.issues || [];
      const openIssues = issues.filter((i) => !i.fixed), fixed = issues.filter((i) => i.fixed);
      $("issues").replaceChildren(...openIssues.map(issueCard));
      $("fixed").replaceChildren(...fixed.map(issueCard));
      $("fixed-section").hidden = !fixed.length;
      $("issues-empty").hidden = openIssues.length > 0;
      $("n-issues").textContent = openIssues.length ? String(openIssues.length) : "";
      $("issues-synced").textContent = data.issues_synced
        ? `Issues are taken from GitHub when they name a place on the map; pictures are refreshed every 6 hours. Last checked ${data.issues_synced}.` : "";
      if (!tabChosen) { showTab("review", false); tabChosen = true; }
    } catch (e) {
      showError(e.message);
    }
  }

  $("refresh").addEventListener("click", load);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !busyTyping()) load(); });
  setInterval(() => { if (!document.hidden && !busyTyping()) load(); }, 60000);
  ensureSession().catch((e) => showError(e.message));
  load();
})();
