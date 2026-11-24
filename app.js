(function () {
  "use strict";

  var DATA = window.APP_DATA;
  if (!DATA || !DATA.books || !DATA.books.length) {
    document.body.innerHTML =
      '<p style="padding:24px;font-family:sans-serif">ไม่พบข้อมูลหน้า (data.js) — กรุณารัน <code>python tools/build_pages.py</code> ก่อน</p>';
    return;
  }

  var $ = function (sel) { return document.querySelector(sel); };
  var books = DATA.books;

  var el = {
    bookSwitch: $("#bookSwitch"),
    bookTitle: $("#bookTitle"),
    chapters: $("#chapters"),
    stage: $("#stage"),
    pageWrap: $("#pageWrap"),
    img: $("#pageImg"),
    spinner: $("#spinner"),
    empty: $("#empty"),
    form: $("#jumpForm"),
    input: $("#pageInput"),
    ofTotal: $("#ofTotal"),
    prev: $("#prevBtn"),
    next: $("#nextBtn"),
    pageInfo: $("#pageInfo"),
    gridBtn: $("#gridBtn"),
    modal: $("#gridModal"),
    gridBody: $("#gridBody"),
    gridTitle: $("#gridTitle"),
    gridClose: $("#gridClose"),
    zoomIn: $("#zoomIn"),
    zoomOut: $("#zoomOut"),
    zoomFit: $("#zoomFit"),
    installBtn: $("#installBtn")
  };

  var LS_KEY = "mathp3:last";
  var state = { bookId: books[0].id, page: 1, zoom: 1 };
  var gridBuiltFor = null;
  var lastChapter = null;
  var BASE_WIDTH = 739;   // ความกว้างภาพปกติ (ใช้ตัดสินใจว่าต้องใช้ HD หรือไม่)

  function book() {
    for (var i = 0; i < books.length; i++) if (books[i].id === state.bookId) return books[i];
    return books[0];
  }
  function pad3(n) { return ("00" + n).slice(-3); }
  function pageSrc(b, p) { return "pages/" + b.id + "/" + pad3(p) + ".webp"; }
  function hdSrc(b, p) { return "pages-hd/" + b.id + "/" + pad3(p) + ".webp"; }
  function thumbSrc(b, p) { return "thumbs/" + b.id + "/" + pad3(p) + ".webp"; }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  function displayWidth() {
    var w = el.pageWrap.offsetWidth;
    return w > 0 ? w : 800;
  }
  function needsHd() {
    var dpr = window.devicePixelRatio || 1;
    return displayWidth() * dpr > BASE_WIDTH * 1.15;
  }
  function preferredSrc(b, p) {
    return needsHd() ? hdSrc(b, p) : pageSrc(b, p);
  }
  function updateImageSource() {
    var want = preferredSrc(book(), state.page);
    if (el.img.getAttribute("src") !== want) el.img.src = want;
  }

  function chapterOf(b, p) {
    for (var i = 0; i < b.chapters.length; i++) {
      var c = b.chapters[i];
      if (p >= c.start && p <= c.end) return c;
    }
    return null;
  }

  /* ---------- last position ---------- */
  function loadLast() {
    try {
      var raw = JSON.parse(localStorage.getItem(LS_KEY));
      if (raw && raw.pages) return raw;
      if (raw && typeof raw === "object") return { book: null, pages: raw }; // รูปแบบเก่า
    } catch (e) { /* file:// หรือโหมดส่วนตัวอาจเขียนไม่ได้ */ }
    return { book: null, pages: {} };
  }
  function saveLast() {
    try {
      var m = loadLast();
      m.book = state.bookId;
      m.pages[state.bookId] = state.page;
      localStorage.setItem(LS_KEY, JSON.stringify(m));
    } catch (e) { /* ignore */ }
  }

  /* ---------- hash ---------- */
  function readHash() {
    var h = (location.hash || "").replace(/^#\/?/, "");
    if (!h) return null;
    var parts = h.split("/");
    var b = null;
    for (var i = 0; i < books.length; i++) if (books[i].id === parts[0]) b = books[i];
    if (!b) return null;
    var p = parseInt(parts[1], 10);
    if (!isFinite(p)) p = 1;
    return { bookId: b.id, page: clamp(p, 1, b.pages) };
  }
  function writeHash() {
    var h = "#" + state.bookId + "/" + state.page;
    if (location.hash === h) return;
    try { history.replaceState(null, "", h); } catch (e) { location.hash = h; }
  }

  /* ---------- rendering ---------- */
  function renderBookSwitch() {
    el.bookSwitch.innerHTML = "";
    books.forEach(function (b) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("role", "tab");
      btn.textContent = b.label;
      btn.setAttribute("aria-selected", String(b.id === state.bookId));
      btn.addEventListener("click", function () {
        if (b.id !== state.bookId) setBook(b.id, 1);
      });
      el.bookSwitch.appendChild(btn);
    });
  }

  function renderChapters() {
    var b = book();
    el.chapters.innerHTML = "";
    b.chapters.forEach(function (c) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.dataset.chapter = c.n;
      chip.innerHTML = "บทที่ <b>" + c.n + "</b> · " + c.title;
      chip.addEventListener("click", function () { goTo(c.start); });
      el.chapters.appendChild(chip);
    });
    lastChapter = null;
    updateChapters();
  }

  function updateChapters() {
    var b = book();
    var c = chapterOf(b, state.page);
    var activeN = c ? c.n : null;
    if (activeN === lastChapter) return;
    lastChapter = activeN;
    var chips = el.chapters.querySelectorAll(".chip");
    for (var i = 0; i < chips.length; i++) {
      var on = Number(chips[i].dataset.chapter) === activeN;
      chips[i].classList.toggle("active", on);
      if (on && chips[i].scrollIntoView) {
        try {
          chips[i].scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
        } catch (e) { chips[i].scrollIntoView(false); }
      }
    }
  }

  var loadToken = 0;

  function renderPage() {
    var b = book();
    var p = state.page;
    var token = ++loadToken;

    el.empty.hidden = true;
    el.img.classList.remove("ready");
    if (el.img.dataset.page !== b.id + "/" + p) {
      el.spinner.hidden = false;
    }

    el.img.onload = function () {
      if (token !== loadToken) return;
      el.img.classList.add("ready");
      el.img.dataset.page = b.id + "/" + p;
      el.spinner.hidden = true;
    };
    el.img.onerror = function () {
      if (token !== loadToken) return;
      el.spinner.hidden = true;
      el.empty.hidden = false;
    };

    el.img.alt = "หน้า " + p;
    el.img.src = pageSrc(b, p);
    el.img.dataset.page = b.id + "/" + p;
    updateImageSource();

    el.input.value = String(p);
    el.ofTotal.textContent = "/ " + b.pages;
    el.prev.disabled = p <= 1;
    el.next.disabled = p >= b.pages;

    var c = chapterOf(b, p);
    el.pageInfo.textContent = "หน้า " + p + " / " + b.pages + (c ? " · บทที่ " + c.n : "");

    updateChapters();
    preload(b, p + 1);
    preload(b, p + 2);
    preload(b, p - 1);

    el.stage.scrollTop = 0;
    writeHash();
    saveLast();
  }

  function preload(b, p) {
    if (p < 1 || p > b.pages) return;
    var im = new Image();
    im.decoding = "async";
    im.src = preferredSrc(b, p);
  }

  function applyZoom(anchor) {
    var stage = el.stage;
    var prevW = el.pageWrap.offsetWidth || 1;
    var prevH = el.pageWrap.offsetHeight || 1;

    var avail = stage.clientWidth - 24;
    var base = Math.min(Math.max(avail, 200), 900);
    var newW = Math.round(base * state.zoom);

    el.pageWrap.style.width = newW + "px";
    el.pageWrap.style.maxWidth = "none";
    updateImageSource();

    if (anchor) {
      var newH = el.pageWrap.offsetHeight || prevH;
      var nx = (stage.scrollLeft + anchor.x) / prevW;
      var ny = (stage.scrollTop + anchor.y) / prevH;
      stage.scrollLeft = Math.max(0, nx * newW - anchor.x);
      stage.scrollTop = Math.max(0, ny * newH - anchor.y);
    } else if (state.zoom > 1) {
      var over = newW - stage.clientWidth;
      if (over > 0) stage.scrollLeft = over / 2;
    } else {
      stage.scrollLeft = 0;
    }
    el.zoomFit.textContent = state.zoom === 1 ? "พอดี" : Math.round(state.zoom * 100) + "%";
  }

  function setZoom(z, anchor) {
    var nz = clamp(Math.round(z * 100) / 100, 1, 4);
    if (nz === state.zoom) return;
    state.zoom = nz;
    applyZoom(anchor);
  }

  /* ---------- navigation ---------- */
  function goTo(p) {
    var b = book();
    var target = clamp(parseInt(p, 10) || 1, 1, b.pages);
    if (target === state.page) {
      el.input.value = String(target);
      el.input.select();
      return;
    }
    state.page = target;
    renderPage();
  }

  function step(delta) { goTo(state.page + delta); }

  function setBook(id, page) {
    var target = null;
    for (var i = 0; i < books.length; i++) if (books[i].id === id) target = books[i];
    if (!target) return;
    state.bookId = id;
    state.page = clamp(page || 1, 1, target.pages);
    state.zoom = 1;
    applyZoom();
    renderBookSwitch();
    renderChapters();
    el.bookTitle.textContent = target.label;
    el.gridTitle.textContent = "สารบัญภาพ · " + target.label;
    gridBuiltFor = null;
    el.img.dataset.page = "";
    renderPage();
  }

  /* ---------- grid ---------- */
  function buildGrid() {
    var b = book();
    if (gridBuiltFor === b.id) return;
    gridBuiltFor = b.id;
    var frag = document.createDocumentFragment();
    for (var p = 1; p <= b.pages; p++) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "thumb";
      btn.dataset.page = String(p);
      var im = document.createElement("img");
      im.loading = "lazy";
      im.decoding = "async";
      im.src = thumbSrc(b, p);
      im.alt = "หน้า " + p;
      var label = document.createElement("span");
      label.textContent = String(p);
      btn.appendChild(im);
      btn.appendChild(label);
      btn.addEventListener("click", function () {
        var p2 = Number(this.dataset.page);
        closeGrid();
        goTo(p2);
      });
      frag.appendChild(btn);
    }
    el.gridBody.innerHTML = "";
    el.gridBody.appendChild(frag);
  }

  function openGrid() {
    buildGrid();
    var cur = el.gridBody.querySelector('.thumb[data-page="' + state.page + '"]');
    var all = el.gridBody.querySelectorAll(".thumb.current");
    for (var i = 0; i < all.length; i++) all[i].classList.remove("current");
    if (cur) cur.classList.add("current");
    el.modal.hidden = false;
    document.body.classList.add("modal-open");
    if (cur) {
      requestAnimationFrame(function () {
        try { cur.scrollIntoView({ block: "center" }); } catch (e) {}
      });
    }
  }

  function closeGrid() {
    el.modal.hidden = true;
    document.body.classList.remove("modal-open");
  }

  /* ---------- events ---------- */
  el.form.addEventListener("submit", function (e) {
    e.preventDefault();
    goTo(el.input.value);
    el.input.blur();
  });

  el.input.addEventListener("focus", function () { el.input.select(); });
  el.input.addEventListener("input", function () {
    this.value = this.value.replace(/\D/g, "").slice(0, 4);
  });

  el.prev.addEventListener("click", function () { step(-1); });
  el.next.addEventListener("click", function () { step(1); });

  el.zoomIn.addEventListener("click", function () { setZoom(state.zoom + 0.25); });
  el.zoomOut.addEventListener("click", function () { setZoom(state.zoom - 0.25); });
  el.zoomFit.addEventListener("click", function () { setZoom(1); });

  el.gridBtn.addEventListener("click", openGrid);
  el.gridClose.addEventListener("click", closeGrid);
  el.modal.addEventListener("click", function (e) {
    if (e.target === el.modal) closeGrid();
  });

  document.addEventListener("keydown", function (e) {
    var tag = (e.target.tagName || "").toLowerCase();
    var typing = tag === "input" || tag === "textarea";

    if (e.key === "Escape") {
      if (!el.modal.hidden) closeGrid();
      else if (typing) el.input.blur();
      return;
    }
    if (typing) return;

    switch (e.key) {
      case "ArrowRight":
      case "PageDown":
        step(1); e.preventDefault(); break;
      case "ArrowLeft":
      case "PageUp":
        step(-1); e.preventDefault(); break;
      case "Home":
        goTo(1); e.preventDefault(); break;
      case "End":
        goTo(book().pages); e.preventDefault(); break;
      case "+":
      case "=":
        setZoom(state.zoom + 0.25); break;
      case "-":
        setZoom(state.zoom - 0.25); break;
      case "0":
        setZoom(1); break;
      case "g":
      case "G":
        if (el.modal.hidden) openGrid(); else closeGrid();
        break;
      default:
        if (/^[0-9]$/.test(e.key)) { el.input.focus(); }
    }
  });

  el.stage.addEventListener("dblclick", function () {
    setZoom(state.zoom === 1 ? 2 : 1);
  });

  el.stage.addEventListener("wheel", function (e) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setZoom(state.zoom + (e.deltaY < 0 ? 0.25 : -0.25));
  }, { passive: false });

  /* ---------- touch: ปัดเปลี่ยนหน้า / pinch / ดับเบิลแท็บ ---------- */
  var touch = null;      // จุดเริ่มปัดด้วยนิ้วเดียว
  var pinch = null;      // สถานะการหุบ/กางนิ้ว
  var lastTap = 0;
  var lastTapPos = { x: 0, y: 0 };

  function stagePoint(t) {
    var r = el.stage.getBoundingClientRect();
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }
  function distance(a, b) {
    var dx = a.clientX - b.clientX;
    var dy = a.clientY - b.clientY;
    return Math.sqrt(dx * dx + dy * dy) || 1;
  }

  el.stage.addEventListener("touchstart", function (e) {
    if (e.touches.length === 2) {
      var mid = stagePoint(e.touches[0]);
      var mid2 = stagePoint(e.touches[1]);
      pinch = {
        dist: distance(e.touches[0], e.touches[1]),
        zoom: state.zoom,
        x: (mid.x + mid2.x) / 2,
        y: (mid.y + mid2.y) / 2
      };
      touch = null;
      return;
    }

    if (e.touches.length === 1 && state.zoom === 1) {
      touch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      pinch = null;
    }
  }, { passive: true });

  el.stage.addEventListener("touchmove", function (e) {
    if (pinch && e.touches.length === 2) {
      e.preventDefault();
      var z = pinch.zoom * (distance(e.touches[0], e.touches[1]) / pinch.dist);
      setZoom(z, { x: pinch.x, y: pinch.y });
    }
  }, { passive: false });

  el.stage.addEventListener("touchend", function (e) {
    if (pinch) {
      if (e.touches.length < 2) pinch = null;
      return;
    }

    var t = e.changedTouches[0];
    if (!t) return;

    // ดับเบิลแท็บ = ซูมเข้า/ออก
    var now = Date.now();
    if (now - lastTap < 320 &&
        Math.abs(t.clientX - lastTapPos.x) < 28 &&
        Math.abs(t.clientY - lastTapPos.y) < 28) {
      lastTap = 0;
      if (state.zoom > 1) {
        setZoom(1);
      } else {
        var pt = stagePoint(t);
        setZoom(2, pt);
      }
      touch = null;
      return;
    }
    lastTap = now;
    lastTapPos = { x: t.clientX, y: t.clientY };

    // ปัดซ้าย/ขวาเปลี่ยนหน้า
    if (!touch) return;
    var dx = t.clientX - touch.x;
    var dy = t.clientY - touch.y;
    touch = null;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      step(dx < 0 ? 1 : -1);
    }
  }, { passive: true });

  // กันการซูมทั้งหน้าของ Safari (iOS) ไม่ให้ทับการซูมในแอป
  document.addEventListener("gesturestart", function (e) { e.preventDefault(); });

  window.addEventListener("resize", function () { applyZoom(); });

  window.addEventListener("hashchange", function () {
    var h = readHash();
    if (!h) return;
    if (h.bookId !== state.bookId) setBook(h.bookId, h.page);
    else goTo(h.page);
  });

  /* ---------- boot ---------- */
  var initial = readHash();
  var store = loadLast();
  var startBook = initial ? initial.bookId : (store.book || books[0].id);
  var startPage = initial ? initial.page : (store.pages[startBook] || 1);

  state.bookId = startBook;
  state.page = clamp(startPage, 1, book().pages);
  el.img.dataset.page = "";
  applyZoom();
  renderBookSwitch();
  renderChapters();
  el.bookTitle.textContent = book().label;
  el.gridTitle.textContent = "สารบัญภาพ · " + book().label;
  renderPage();

  /* ---------- PWA: ปุ่มติดตั้ง + service worker ---------- */
  var deferredPrompt = null;
  var standalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true;

  if (el.installBtn) {
    if (standalone) el.installBtn.hidden = true;

    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();
      deferredPrompt = e;
      if (!standalone) el.installBtn.hidden = false;
    });

    el.installBtn.addEventListener("click", function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function () {
        deferredPrompt = null;
        el.installBtn.hidden = true;
      });
    });

    window.addEventListener("appinstalled", function () {
      deferredPrompt = null;
      el.installBtn.hidden = true;
    });
  }

  if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () { /* ใช้แบบไม่มี offline ก็ได้ */ });
    });
  }
})();
