/* Resume Builder — the CV lives in localStorage (S3.store) and renders as a printable A4 page. */
(function () {
  "use strict";
  var $ = S3.$, $$ = S3.$$, h = S3.h;
  var KEY = "resume.data";
  var TPLS = ["classic", "modern", "compact"];
  var SECTIONS = {
    summary: { en: "Summary", ar: "نبذة", type: "text", hint: "Two or three lines about who you are and what you're great at." },
    experience: { en: "Experience", ar: "الخبرة العملية", type: "list", add: "Add job", fields: [["role", "Job title"], ["org", "Company"], ["place", "Location"], ["start", "Start", "e.g. 2021"], ["end", "End", "e.g. Present"], ["desc", "Highlights — one per line", "", "area"]] },
    education: { en: "Education", ar: "التعليم", type: "list", add: "Add education", fields: [["degree", "Degree"], ["school", "School"], ["place", "Location"], ["start", "Start"], ["end", "End"], ["desc", "Details (optional)", "", "area"]] },
    skills: { en: "Skills", ar: "المهارات", type: "tags", hint: "Separate with commas." },
    projects: { en: "Projects", ar: "المشاريع", type: "list", add: "Add project", fields: [["name", "Project"], ["link", "Link (optional)"], ["desc", "What it is / what you did", "", "area"]] },
    languages: { en: "Languages", ar: "اللغات", type: "list", add: "Add language", fields: [["name", "Language"], ["level", "Level", "e.g. Native, B2"]] }
  };
  var KEYS = Object.keys(SECTIONS);
  var cv;

  // ---------- data shape (imported/stored JSON is untrusted) ----------
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function str(v, max) { return typeof v === "string" ? v.slice(0, max || 200) : typeof v === "number" && isFinite(v) ? String(v) : ""; }
  function cleanOrder(o) {
    var seen = {}, out = (Array.isArray(o) ? o : []).filter(function (k) { var ok = KEYS.indexOf(k) >= 0 && !seen[k]; seen[k] = 1; return ok; });
    KEYS.forEach(function (k) { if (!seen[k]) out.push(k); });
    return out;
  }
  function clean(o) {
    o = obj(o);
    var c = obj(o.contact), r = {
      template: TPLS.indexOf(o.template) >= 0 ? o.template : "classic",
      accent: typeof o.accent === "string" && /^#[0-9a-f]{6}$/i.test(o.accent) ? o.accent.toLowerCase() : "#0e7c86",
      rtl: o.rtl === true,
      order: cleanOrder(o.order),
      contact: { name: str(c.name, 100), title: str(c.title, 120), email: str(c.email, 120), phone: str(c.phone, 60), location: str(c.location, 100), website: str(c.website, 160) },
      summary: str(o.summary, 2000),
      skills: str(o.skills, 2000)
    };
    KEYS.forEach(function (k) {
      var s = SECTIONS[k];
      if (s.type !== "list") return;
      r[k] = (Array.isArray(o[k]) ? o[k] : []).slice(0, 40).map(function (e) {
        e = obj(e); var x = {};
        s.fields.forEach(function (f) { x[f[0]] = str(e[f[0]], f[3] ? 3000 : 160); });
        return x;
      });
    });
    return r;
  }
  function blankEntry(k) { var x = {}; SECTIONS[k].fields.forEach(function (f) { x[f[0]] = ""; }); return x; }

  // "- did X\n• did Y\nplain" → [{bullet:true,text}, …]
  function parseLines(t) {
    return String(t || "").split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
      var m = /^([-•*–])\s*(.*)$/.exec(l);
      return m ? { bullet: true, text: m[2] } : { bullet: false, text: l };
    });
  }
  function tags(t) { return String(t || "").split(/[,،\n]/).map(function (s) { return s.trim(); }).filter(Boolean); }
  function span(a, b) { return a && b ? a + " – " + b : a || b; }

  // ---------- storage ----------
  var saveSoon = S3.debounce(function () {
    if (S3.store(KEY, cv) === undefined) S3.toast("Couldn't save — browser storage is full or blocked", "error");
  }, 300);

  // ---------- editor ----------
  var secBox = $("#sections"), editor = $("#editor"), paper = $("#paper");
  function getK(k) { return k.split(".").reduce(function (o, p) { return o == null ? "" : o[p]; }, cv); }
  function setK(k, v) { var ps = k.split("."), o = cv; while (ps.length > 1) o = o[ps.shift()]; o[ps[0]] = v; }
  function field(label, k, ph, area, max) {
    var attrs = { "class": area ? "textarea prose" : "input", "data-k": k, dir: "auto", placeholder: ph || "", maxlength: String(max || (area ? 3000 : 160)) };
    var el = h(area ? "textarea" : "input", attrs);
    if (area) { el.rows = 3; el.value = getK(k); } else el.value = getK(k);
    return h("label", { "class": "field" + (area ? " wide" : "") }, [label, el]);
  }
  function drawSections() {
    secBox.textContent = "";
    cv.order.forEach(function (k, i) {
      var s = SECTIONS[k], body;
      var head = h("div", { "class": "row between" }, [h("h2", { text: s.en }), h("div", { "class": "row sec-move" }, [
        h("button", { "class": "btn ghost small", "data-move": k, "data-d": "-1", disabled: i === 0, "aria-label": "Move " + s.en + " up", text: "↑" }),
        h("button", { "class": "btn ghost small", "data-move": k, "data-d": "1", disabled: i === cv.order.length - 1, "aria-label": "Move " + s.en + " down", text: "↓" })
      ])]);
      if (s.type === "text") body = field("Text", k, s.hint, true, 2000);
      else if (s.type === "tags") body = field("Skills", k, "e.g. Figma, User research, SQL", true, 2000);
      else {
        body = h("div", { "class": "stack" });
        cv[k].forEach(function (e, j) {
          var grid = h("div", { "class": "grid-2" }, s.fields.map(function (f) { return field(f[1], k + "." + j + "." + f[0], f[2], f[3]); }));
          body.appendChild(h("div", { "class": "entry" }, [grid, h("div", { "class": "row end entry-act" }, [
            h("button", { "class": "btn ghost small", "data-eup": k, "data-j": j, disabled: j === 0, text: "Move up" }),
            h("button", { "class": "btn ghost small danger", "data-edel": k, "data-j": j, html: S3.icon("trash") + "Remove" })
          ])]));
        });
        body.appendChild(h("button", { "class": "btn small", "data-add": k, html: S3.icon("plus") + S3.esc(s.add) }));
      }
      secBox.appendChild(h("section", { "class": "card sec" }, [head, body]));
    });
  }
  function fillTop() {
    $$("[data-k^='contact.']", editor).forEach(function (el) { el.value = getK(el.dataset.k); });
    $$("#tpl button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.v === cv.template)); });
    $("#accent").value = cv.accent; $("#rtl").checked = cv.rtl;
  }
  function all() { fillTop(); drawSections(); render(); }

  editor.addEventListener("input", function (e) {
    var k = e.target.dataset.k; if (!k) return;
    setK(k, e.target.value); render(); saveSoon();
  });
  secBox.addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b || b.disabled) return;
    var d = b.dataset;
    if (d.move) { var i = cv.order.indexOf(d.move), j = i + +d.d; cv.order.splice(j, 0, cv.order.splice(i, 1)[0]); }
    else if (d.add) cv[d.add].push(blankEntry(d.add));
    else if (d.edel) cv[d.edel].splice(+d.j, 1);
    else if (d.eup) { var arr = cv[d.eup], x = +d.j; arr.splice(x - 1, 0, arr.splice(x, 1)[0]); }
    else return;
    drawSections(); render(); saveSoon();
    if (d.add) { var inputs = $$("[data-k^='" + d.add + "." + (cv[d.add].length - 1) + ".']", secBox); if (inputs[0]) inputs[0].focus(); }
  });
  $$("#tpl button").forEach(function (b) {
    b.addEventListener("click", function () { cv.template = b.dataset.v; fillTop(); render(); saveSoon(); });
  });
  $("#accent").addEventListener("input", function (e) { cv.accent = e.target.value; render(); saveSoon(); });
  $("#rtl").addEventListener("change", function (e) { cv.rtl = e.target.checked; render(); saveSoon(); });

  // ---------- preview ----------
  function heading(k) { return h("h3", { "class": "r-h", text: cv.rtl ? SECTIONS[k].ar : SECTIONS[k].en }); }
  function desc(t) {
    var out = [], ul = null;
    parseLines(t).forEach(function (l) {
      if (l.bullet) { if (!ul) { ul = h("ul"); out.push(ul); } ul.appendChild(h("li", { dir: "auto", text: l.text })); }
      else { ul = null; out.push(h("p", { dir: "auto", text: l.text })); }
    });
    return out.length ? h("div", { "class": "r-desc" }, out) : null;
  }
  function filled(e) { return Object.keys(e).some(function (f) { return e[f].trim(); }); }
  function wrap(k, kids) { return h("section", { "class": "r-sec" }, [heading(k), h("div", { "class": "r-content" }, kids)]); }
  function section(k, side) {
    var s = SECTIONS[k];
    if (s.type === "text") return cv.summary.trim() ? wrap(k, [desc(cv.summary)]) : null;
    if (s.type === "tags") {
      var t = tags(cv.skills); if (!t.length) return null;
      return wrap(k, [h("ul", { "class": side ? "r-list" : "r-tags" }, t.map(function (x) { return h("li", { dir: "auto", text: x }); }))]);
    }
    var items = cv[k].filter(filled); if (!items.length) return null;
    if (k === "languages") return wrap(k, [h("ul", { "class": side ? "r-list" : "r-tags" }, items.map(function (e) {
      return h("li", { dir: "auto" }, [e.name, e.level ? h("span", { "class": "r-lvl", text: " · " + e.level }) : null]);
    }))]);
    return wrap(k, items.map(function (e) {
      var title = k === "experience" ? e.role : k === "education" ? e.degree : e.name;
      var sub = k === "experience" ? [e.org, e.place] : k === "education" ? [e.school, e.place] : [e.link];
      return h("div", { "class": "r-item" }, [
        h("div", { "class": "r-row" }, [h("b", { dir: "auto", text: title }), k === "projects" ? null : h("span", { "class": "r-when", dir: "auto", text: span(e.start, e.end) })]),
        sub.filter(Boolean).length ? h("div", { "class": "r-sub", dir: "auto", text: sub.filter(Boolean).join(" · ") }) : null,
        desc(e.desc)
      ]);
    }));
  }
  function render() {
    var c = cv.contact, modern = cv.template === "modern";
    paper.className = "paper t-" + cv.template;
    paper.dir = cv.rtl ? "rtl" : "ltr";
    paper.lang = cv.rtl ? "ar" : "en";
    paper.style.setProperty("--ink", cv.accent);
    paper.textContent = "";
    var bits = [c.email, c.phone, c.location, c.website].filter(Boolean);
    var head = h("header", { "class": "r-head" }, [
      h("h1", { "class": "r-name" + (c.name ? "" : " ph"), dir: "auto", text: c.name || "Your Name" }),
      c.title ? h("div", { "class": "r-title", dir: "auto", text: c.title }) : null,
      !modern && bits.length ? h("div", { "class": "r-contact" }, bits.map(function (b) { return h("span", { dir: "auto", text: b }); })) : null
    ]);
    var main = h("div", { "class": "r-main" }), side = h("aside", { "class": "r-side" });
    if (modern && bits.length) side.appendChild(h("section", { "class": "r-sec" }, [h("h3", { "class": "r-h", text: cv.rtl ? "التواصل" : "Contact" }),
      h("ul", { "class": "r-list" }, bits.map(function (b) { return h("li", { dir: "auto", text: b }); }))]));
    cv.order.forEach(function (k) {
      var toSide = modern && (k === "skills" || k === "languages");
      var el = section(k, toSide); if (el) (toSide ? side : main).appendChild(el);
    });
    if (modern) paper.append(side, h("div", { "class": "r-body" }, [head, main]));
    else paper.append(head, main);
    if (!main.childNodes.length && !side.childNodes.length) main.appendChild(h("p", { "class": "ph", text: "Your sections will appear here as you fill them in." }));
  }

  // ---------- actions ----------
  $("#print").addEventListener("click", function () { window.print(); S3.done(); });
  $("#exp").addEventListener("click", function () {
    var name = (cv.contact.name || "resume").replace(/[^\w؀-ۿ -]+/g, "").trim().replace(/\s+/g, "-") || "resume";
    S3.download(JSON.stringify({ app: "s3-resume-builder", version: 1, resume: cv }, null, 2), name + ".json", "application/json"); S3.done();
  });
  $("#imp input").addEventListener("change", function (e) {
    var f = e.target.files[0]; e.target.value = ""; if (!f) return;
    if (f.size > 5 * 1024 * 1024) { S3.toast("That file is too large", "error"); return; }
    S3.readFile(f, "text").then(function (t) {
      var d; try { d = JSON.parse(t); } catch (err) { S3.toast("Not valid JSON", "error"); return; }
      d = d && d.resume ? d.resume : d;
      if (!d || typeof d !== "object" || !(d.contact || d.experience || d.summary)) { S3.toast("That doesn't look like a resume file", "error"); return; }
      cv = clean(d); all(); saveSoon(); S3.toast("Resume imported"); S3.done();
    });
  });
  $("#reset").addEventListener("click", function () {
    var old = cv; cv = clean({ template: old.template, accent: old.accent, rtl: old.rtl }); all(); saveSoon();
    var t = S3.toast("Cleared ");
    t.appendChild(h("button", { "class": "btn small", text: "Undo", onclick: function () { cv = old; all(); saveSoon(); t.remove(); } }));
  });

  // ---------- boot ----------
  var stored = S3.store(KEY);
  cv = clean(stored || { experience: [{}], education: [{}] });
  all();

  window.S3_DEMO = function () {
    cv = clean({
      template: "modern", accent: "#0e7c86",
      contact: { name: "Layla Haddad", title: "Senior Product Designer", email: "layla.haddad@example.com", phone: "+962 7 9000 0000", location: "Amman, Jordan", website: "linkedin.com/in/laylahaddad" },
      summary: "Product designer with 8 years of experience turning messy problems into simple, accessible interfaces. I lead research, prototype fast and ship with engineering.",
      experience: [
        { role: "Senior Product Designer", org: "Mosaic Health", place: "Amman", start: "2022", end: "Present", desc: "- Redesigned patient booking; completion up 31%\n- Built and documented a 120-component design system\n- Mentored 4 junior designers" },
        { role: "Product Designer", org: "Souq Labs", place: "Dubai", start: "2018", end: "2022", desc: "- Led checkout redesign for 2M monthly users\n- Introduced weekly usability testing" }
      ],
      education: [{ degree: "BSc Computer Science", school: "University of Jordan", place: "Amman", start: "2013", end: "2017" }],
      skills: "Figma, Prototyping, User research, Design systems, Accessibility (WCAG), HTML & CSS, Workshop facilitation",
      projects: [{ name: "Open Wayfinding", link: "github.com/layla/wayfinding", desc: "Open-source bilingual signage kit used by 3 hospitals." }],
      languages: [{ name: "Arabic", level: "Native" }, { name: "English", level: "Fluent" }, { name: "French", level: "B1" }]
    });
    all();
  };

  window.S3_SELFTEST = function () {
    var src = clean({ contact: { name: "سارة ✓" }, rtl: true, template: "compact", order: ["skills", "summary"], experience: [{ role: "A", desc: "- x\n- y" }], languages: [{ name: "EN", level: "C2" }] });
    var rt = JSON.stringify(clean(JSON.parse(JSON.stringify(src)))) === JSON.stringify(src);
    var ord = src.order.join() === "skills,summary,experience,education,projects,languages";
    var bad = clean({ order: ["evil", "skills", "skills"], template: "<img>", accent: "url(x)", experience: "nope", contact: { name: ["x"] }, education: [{ degree: { a: 1 }, extra: "drop" }] });
    var okBad = bad.order.length === 6 && bad.order[0] === "skills" && bad.template === "classic" && bad.accent === "#0e7c86" &&
      bad.experience.length === 0 && bad.contact.name === "" && bad.education[0].degree === "" && !("extra" in bad.education[0]);
    var p = parseLines("- one\n• two\n\nplain\n* three");
    var okP = p.length === 4 && p[0].bullet && p[1].text === "two" && !p[2].bullet && p[3].text === "three";
    var t = tags("a, b،c\n d ,,");
    return rt && ord && okBad && okP && t.join("|") === "a|b|c|d" && span("2020", "") === "2020" && span("2020", "Now") === "2020 – Now";
  };
})();
