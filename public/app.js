(function () {
  "use strict";

  const state = {
    locale: "id",
    faqs: [],
    faqIndex: 0,
    sitemapOffset: 0,
    sitemapLimit: 10,
    sitemapTotal: 0,
    sitemapLocale: "all",
    sitemapQuery: ""
  };

  function esc(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showResultHtml(html) {
    const section = document.getElementById("hasil-analisis");
    const container = document.getElementById("resultContainer");
    container.innerHTML = html;
    section.classList.remove("hidden");
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function showLoadingResult(label) {
    showResultHtml(`
      <div class="result-wrapper" style="text-align:center; padding:42px 20px;">
        <div style="font-size:1.1rem; font-weight:800; color:#1574d4;">${esc(label)}</div>
        <p style="font-size:0.86rem; color:#61748f; margin-top:6px;">Menghubungkan ke server lookup &amp; mem-parsing metadata publik...</p>
      </div>
    `);
  }

  function showErrorResult(title, message, extraUrl) {
    showResultHtml(`
      <div class="result-wrapper">
        <div class="result-top-bar">
          <div>
            <div class="result-number-title">
              <span>${esc(title)}</span>
              <span class="status-pill danger">Kendala Permintaan</span>
            </div>
            <p class="result-meta-line">${esc(message)}</p>
          </div>
          ${extraUrl ? `<div class="result-actions"><a class="btn-secondary-sm" href="${esc(extraUrl)}" target="_blank" rel="noopener">Buka Sumber Getcontact ↗</a></div>` : ""}
        </div>
      </div>
    `);
  }

  /* ------------------------------------------------ TABS & NAVIGATION */

  function activateTab(tabName) {
    document.querySelectorAll(".search-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tabName);
    });
    document.querySelectorAll(".search-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.panel === tabName);
    });
  }

  document.querySelectorAll(".search-tab").forEach((btn) => {
    btn.addEventListener("click", () => activateTab(btn.dataset.tab));
  });

  document.querySelectorAll("[data-jump-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      activateTab(btn.dataset.jumpTab);
      document.getElementById("search-widget").scrollIntoView({ behavior: "smooth" });
    });
  });

  document.getElementById("globalLocale").addEventListener("change", (e) => {
    state.locale = e.target.value;
    document.getElementById("lookupLocaleInput").value = state.locale;
    loadHomeData(true);
  });

  /* ------------------------------------------------ HOMEPAGE DATA */

  async function loadHomeData(forceRefresh) {
    const grid = document.getElementById("spamCardsGrid");
    try {
      const res = await fetch(`/api/home?locale=${encodeURIComponent(state.locale)}${forceRefresh ? "&refresh=1" : ""}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Gagal memuat data beranda");

      const data = json.data;
      if (data.live && data.live.count) {
        document.getElementById("heroLiveText").textContent = `${data.live.count.toLocaleString("id-ID")} pencari aktif saat ini`;
        document.getElementById("statLiveVal").textContent = data.live.count.toLocaleString("id-ID");
      } else {
        document.getElementById("heroLiveText").textContent = `Locale aktif: ${data.locale.toUpperCase()}`;
        document.getElementById("statLiveVal").textContent = "Aktif";
      }

      if (Array.isArray(data.stats) && data.stats.length) {
        document.getElementById("homeStatsExtra").textContent = data.stats
          .slice(0, 3)
          .map((s) => `${s.label}: ${s.value}`)
          .join(" • ");
      }

      if (Array.isArray(data.faqs) && data.faqs.length) {
        state.faqs = data.faqs;
        state.faqIndex = 0;
        renderFaq();
      }

      renderSpamCards(data.spamNumbers || []);
    } catch (err) {
      grid.innerHTML = `<div class="table-empty" style="grid-column:1/-1; background:#fff; border-radius:16px;">${esc(err.message)}</div>`;
      document.getElementById("heroLiveText").textContent = "Mode Lookup Siap";
    }
  }

  function renderSpamCards(items) {
    const grid = document.getElementById("spamCardsGrid");
    if (!items.length) {
      grid.innerHTML = `<div class="table-empty" style="grid-column:1/-1; background:#fff; border-radius:16px;">Belum ada daftar nomor spam publik untuk locale ini.</div>`;
      return;
    }

    grid.innerHTML = items.slice(0, 8).map((item) => `
      <article class="spam-card">
        <div class="spam-card-banner">
          <span class="spam-tag-top">${esc(item.reports || "Spam Publik")}</span>
          <div class="spam-banner-num">${esc(item.number || "+" + item.slug)}</div>
        </div>
        <div class="spam-card-body">
          <div class="spam-card-title">${esc(item.number || "+" + item.slug)}</div>
          <div class="spam-card-meta">${esc(item.title || item.reports || "Terdeteksi di laporan publik")}</div>
          <div class="spam-card-footer">
            <span class="spam-badge-red">${esc(item.label || "Spam")}</span>
            <button type="button" class="btn-card-arrow" data-inspect-slug="${esc(item.slug)}" title="Cek detail nomor ini">→</button>
          </div>
        </div>
      </article>
    `).join("");

    grid.querySelectorAll("[data-inspect-slug]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const slug = btn.dataset.inspectSlug;
        document.getElementById("countryCodeInput").value = "";
        document.getElementById("phoneInput").value = "+" + slug;
        runNumberLookup("+" + slug, state.locale, "", "full");
      });
    });
  }

  function renderFaq() {
    if (!state.faqs.length) return;
    const item = state.faqs[state.faqIndex % state.faqs.length];
    document.getElementById("faqDisplayContent").innerHTML = `
      <p class="faq-question">${esc(item.question)}</p>
      <p class="faq-answer">${esc(item.answer)}</p>
    `;
    document.getElementById("faqCounter").textContent = `FAQ ${(state.faqIndex % state.faqs.length) + 1} / ${state.faqs.length}`;
  }

  document.getElementById("btnNextFaq").addEventListener("click", () => {
    if (!state.faqs.length) return;
    state.faqIndex = (state.faqIndex + 1) % state.faqs.length;
    renderFaq();
  });

  document.getElementById("btnRefreshSpam").addEventListener("click", () => loadHomeData(true));

  /* ------------------------------------------------ NUMBER LOOKUP */

  async function runNumberLookup(rawNumber, locale, countryCode, mode) {
    showLoadingResult(`Menganalisis nomor ${rawNumber}...`);

    if (mode === "comments") {
      try {
        const res = await fetch(`/api/comments?number=${encodeURIComponent(rawNumber)}&locale=${encodeURIComponent(locale)}&countryCode=${encodeURIComponent(countryCode)}`);
        const json = await res.json();
        if (!json.ok) return showErrorResult("Gagal Memuat Komentar", json.error);

        const commentsHtml = json.comments.length
          ? json.comments.map((c) => `
              <div class="comment-item">
                <div class="comment-head">
                  <span>${esc(c.author || "Pengguna Anonim")}</span>
                  <span>${esc(c.date || "")}</span>
                </div>
                <div>${esc(c.text)}</div>
              </div>
            `).join("")
          : `<p class="section-desc" style="margin-top:10px;">Belum ada komentar komunitas publik untuk nomor ini.</p>`;

        showResultHtml(`
          <div class="result-wrapper">
            <div class="result-top-bar">
              <div>
                <div class="result-number-title">
                  <span>${esc(json.normalized.e164)}</span>
                  <span class="status-pill found">${json.count} Komentar Ditemukan</span>
                </div>
                <p class="result-meta-line">Slug: ${esc(json.normalized.slug)} • Locale: ${esc(json.locale.toUpperCase())}</p>
              </div>
              <button type="button" class="btn-secondary-sm" id="btnSwitchFullLookup">Lihat Analisis Lengkap</button>
            </div>
            <div class="comments-block" style="border-top:none; margin-top:8px; padding-top:8px;">
              <h3>Komentar Komunitas</h3>
              ${commentsHtml}
            </div>
          </div>
        `);

        document.getElementById("btnSwitchFullLookup").addEventListener("click", () => {
          runNumberLookup(rawNumber, locale, countryCode, "full");
        });
      } catch (err) {
        showErrorResult("Kesalahan Jaringan", err.message);
      }
      return;
    }

    try {
      const res = await fetch(`/api/lookup?number=${encodeURIComponent(rawNumber)}&locale=${encodeURIComponent(locale)}&countryCode=${encodeURIComponent(countryCode)}&mode=${encodeURIComponent(mode)}`);
      const json = await res.json();
      if (!json.ok) {
        return showErrorResult("Gagal Mengecek Nomor", json.error, json.searchUrl);
      }

      if (json.mode === "url") {
        showResultHtml(`
          <div class="result-wrapper">
            <div class="result-top-bar">
              <div>
                <div class="result-number-title">
                  <span>${esc(json.normalized.e164)}</span>
                  <span class="status-pill found">URL Terbentuk</span>
                </div>
                <p class="result-meta-line">Slug E.164: ${esc(json.normalized.digits)} • <a href="${esc(json.url)}" target="_blank" rel="noopener">${esc(json.url)}</a></p>
              </div>
              <div class="result-actions">
                <a class="btn-secondary-sm" href="${esc(json.url)}" target="_blank" rel="noopener">Buka Halaman ↗</a>
              </div>
            </div>
          </div>
        `);
        return;
      }

      renderFullLookupResult(json.data);
    } catch (err) {
      showErrorResult("Kesalahan Koneksi", err.message);
    }
  }

  function renderFullLookupResult(d) {
    const riskPercent = d.risk && d.risk.percent != null ? Math.min(100, Math.max(0, d.risk.percent)) : 0;
    let riskClass = "low";
    if (riskPercent >= 65 || (d.risk && /red/i.test(d.risk.color || ""))) riskClass = "high";
    else if (riskPercent >= 30 || (d.risk && /amber|yellow|orange/i.test(d.risk.color || ""))) riskClass = "medium";

    const surfaceEntries = Object.entries(d.surface || {});
    const surfaceHtml = surfaceEntries.length
      ? surfaceEntries.map(([k, v]) => `
          <div class="stat-mini-card">
            <div class="stat-mini-val">${esc(v)}</div>
            <div class="stat-mini-lbl">${esc(k.replace(/-/g, " "))}</div>
          </div>
        `).join("")
      : "";

    const commentsHtml = (d.comments || []).length
      ? d.comments.map((c) => `
          <div class="comment-item">
            <div class="comment-head">
              <span>${esc(c.author || "Pengguna")}</span>
              <span>${esc(c.date || "")}</span>
            </div>
            <div>${esc(c.text)}</div>
          </div>
        `).join("")
      : `<p class="section-desc" style="margin-top:8px;">Tidak ada komentar publik yang tercantum pada halaman nomor ini.</p>`;

    const relatedHtml = (d.relatedSpam || []).length
      ? `
        <div class="comments-block">
          <h3>Nomor Spam Terkait (${d.relatedSpam.length})</h3>
          <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:10px;">
            ${d.relatedSpam.map((r) => `
              <button type="button" class="btn-secondary-sm" data-rel-slug="${esc(r.slug)}">
                ${esc(r.number || "+" + r.slug)} (${esc(r.label || "Spam")})
              </button>
            `).join("")}
          </div>
        </div>
      `
      : "";

    showResultHtml(`
      <div class="result-wrapper">
        <div class="result-top-bar">
          <div>
            <div class="result-number-title">
              <span>${esc(d.number || d.e164)}</span>
              <span class="status-pill ${d.found ? "found" : "not-found"}">
                ${d.found ? (d.badge || "Data Publik Ditemukan") : "Belum Ada Data Publik (Soft-200)"}
              </span>
            </div>
            <div class="result-meta-line">
              <span>Format E.164: <strong>${esc(d.e164)}</strong></span>
              <span>Locale: <strong>${esc(d.locale.toUpperCase())}</strong></span>
              ${d.pageDate ? `<span>Diperbarui: <strong>${esc(d.pageDate.text || d.pageDate.iso)}</strong></span>` : ""}
              ${d.rating ? `<span>Rating QA: <strong>👍 ${d.rating.up ?? 0} / 👎 ${d.rating.down ?? 0}</strong></span>` : ""}
            </div>
          </div>

          <div class="result-actions">
            <a class="btn-secondary-sm" href="${esc(d.url)}" target="_blank" rel="noopener">Sumber Getcontact ↗</a>
            <button type="button" class="btn-secondary-sm" id="btnCopyResultJson">Salin JSON</button>
          </div>
        </div>

        ${!d.found ? `<div class="qa-summary-box">${esc(d.note)}</div>` : ""}

        <div class="result-grid-main">
          <div class="risk-box">
            <div class="risk-label-header">${esc((d.risk && d.risk.labelText) || "TINGKAT RISIKO SPAM")}</div>
            <div class="risk-value-big">${esc((d.risk && d.risk.label) || (d.found ? "Normal / Tidak Tercatat Spam" : "Tidak Diketahui"))}</div>
            <div class="risk-bar-track">
              <div class="risk-bar-fill ${riskClass}" style="width: ${d.risk ? riskPercent : 8}%"></div>
            </div>
            <div style="font-size:0.84rem; color:#61748f;">
              Skor Risiko: <strong>${esc((d.risk && d.risk.percentText) || "0%")}</strong>
            </div>
          </div>

          <div class="stats-mini-grid">
            <div class="stat-mini-card">
              <div class="stat-mini-val">${esc((d.stats && d.stats.searchCount) || "0")}</div>
              <div class="stat-mini-lbl">Jumlah Pencarian</div>
            </div>
            <div class="stat-mini-card">
              <div class="stat-mini-val">${esc((d.stats && d.stats.totalCalls) || "0")}</div>
              <div class="stat-mini-lbl">Total Panggilan</div>
            </div>
            <div class="stat-mini-card">
              <div class="stat-mini-val">${esc((d.stats && d.stats.userReports) || "0")}</div>
              <div class="stat-mini-lbl">Laporan Pengguna</div>
            </div>
            <div class="stat-mini-card">
              <div class="stat-mini-val">${esc((d.stats && d.stats.operator) || "—")}</div>
              <div class="stat-mini-lbl">Operator</div>
            </div>
            <div class="stat-mini-card">
              <div class="stat-mini-val">${esc((d.stats && d.stats.region) || "—")}</div>
              <div class="stat-mini-lbl">Wilayah / Region</div>
            </div>
            <div class="stat-mini-card">
              <div class="stat-mini-val">${(d.comments || []).length}</div>
              <div class="stat-mini-lbl">Komentar Publik</div>
            </div>
            ${surfaceHtml}
          </div>
        </div>

        ${(d.title || d.description) ? `
          <div class="qa-summary-box">
            ${d.title ? `<strong>${esc(d.title)}</strong><br/>` : ""}
            <span>${esc(d.description || "")}</span>
          </div>
        ` : ""}

        <div class="comments-block">
          <h3>Komentar &amp; Laporan Komunitas (${(d.comments || []).length})</h3>
          ${commentsHtml}
        </div>

        ${relatedHtml}
      </div>
    `);

    const copyBtn = document.getElementById("btnCopyResultJson");
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(JSON.stringify(d, null, 2));
        copyBtn.textContent = "Tersalin ✓";
        setTimeout(() => { copyBtn.textContent = "Salin JSON"; }, 1800);
      });
    }

    document.querySelectorAll("[data-rel-slug]").forEach((btn) => {
      btn.addEventListener("click", () => {
        runNumberLookup("+" + btn.dataset.relSlug, d.locale, "", "full");
      });
    });
  }

  document.getElementById("lookupForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = document.getElementById("phoneInput").value.trim();
    const cc = document.getElementById("countryCodeInput").value;
    const loc = document.getElementById("lookupLocaleInput").value;
    const mode = document.getElementById("lookupModeInput").value;
    if (!raw) return;
    runNumberLookup(raw, loc, cc, mode);
  });

  /* ------------------------------------------------ SITEMAP SYSTEM */

  document.getElementById("sitemapFindForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = document.getElementById("sitemapQueryInput").value.trim();
    const loc = document.getElementById("sitemapFindLocale").value;
    const exact = document.getElementById("sitemapExactSelect").value;
    const details = document.getElementById("sitemapDetailsSelect").value;
    if (!q) return;

    showLoadingResult(`Mencari "${q}" di Sitemap XML...`);
    try {
      const res = await fetch(`/api/sitemap?action=find&q=${encodeURIComponent(q)}&locale=${encodeURIComponent(loc)}&exact=${exact}&details=${details}`);
      const json = await res.json();
      if (!json.ok) return showErrorResult("Pencarian Sitemap Gagal", json.error);

      const items = json.data.items || [];
      const rowsHtml = items.length
        ? items.map((it) => `
            <div class="comment-item" style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
              <div>
                <strong>${esc(it.e164 || "+" + it.slug)}</strong>
                <span class="locale-badge" style="margin-left:8px;">${esc(it.locale)}</span>
                ${it.detail && it.detail.risk ? `<span class="spam-badge-red" style="margin-left:8px;">${esc(it.detail.risk.label)} (${esc(it.detail.risk.percentText)})</span>` : ""}
              </div>
              <button type="button" class="btn-secondary-sm" data-sm-inspect="${esc(it.slug)}" data-sm-locale="${esc(it.locale)}">Cek Detail</button>
            </div>
          `).join("")
        : `<p class="section-desc" style="margin-top:10px;">Tidak ditemukan nomor yang cocok di sitemap publik.</p>`;

      showResultHtml(`
        <div class="result-wrapper">
          <div class="result-top-bar">
            <div>
              <div class="result-number-title">
                <span>Hasil Pencarian Sitemap: "${esc(json.data.digits)}"</span>
                <span class="status-pill found">${json.data.count} Cocok</span>
              </div>
              <p class="result-meta-line">Mode: ${exact === "1" ? "Exact Match" : "Partial Match"} • Locale: ${esc(loc.toUpperCase())}</p>
            </div>
          </div>
          <div style="margin-top:14px;">${rowsHtml}</div>
        </div>
      `);

      document.querySelectorAll("[data-sm-inspect]").forEach((btn) => {
        btn.addEventListener("click", () => {
          runNumberLookup("+" + btn.dataset.smInspect, btn.dataset.smLocale, "", "full");
        });
      });
    } catch (err) {
      showErrorResult("Kesalahan Sitemap", err.message);
    }
  });

  document.getElementById("sitemapBatchForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const loc = document.getElementById("batchLocaleInput").value;
    const offset = document.getElementById("batchOffsetInput").value || 0;
    const limit = document.getElementById("batchLimitInput").value || 3;

    showLoadingResult(`Mengambil ${limit} detail halaman dari Sitemap (${loc.toUpperCase()})...`);
    try {
      const res = await fetch(`/api/sitemap?action=numbers&locale=${encodeURIComponent(loc)}&offset=${offset}&limit=${limit}`);
      const json = await res.json();
      if (!json.ok) return showErrorResult("Batch Sitemap Gagal", json.error);

      const items = json.data.items || [];
      showResultHtml(`
        <div class="result-wrapper">
          <div class="result-top-bar">
            <div>
              <div class="result-number-title">
                <span>Batch Detail Sitemap (${items.length} Nomor)</span>
                <span class="status-pill found">Total Indeks: ${json.data.total}</span>
              </div>
              <p class="result-meta-line">Offset: ${json.data.offset} • Locale: ${esc(loc.toUpperCase())}</p>
            </div>
          </div>
          <div style="margin-top:14px;">
            ${items.map((d) => `
              <div class="comment-item" style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:10px;">
                <div>
                  <strong>${esc(d.number || d.e164)}</strong>
                  <span style="font-size:0.82rem; color:#61748f; margin-left:8px;">
                    Risiko: ${esc((d.risk && d.risk.label) || "Normal")} • Pencarian: ${esc((d.stats && d.stats.searchCount) || "0")} • Komentar: ${(d.comments || []).length}
                  </span>
                </div>
                <button type="button" class="btn-secondary-sm" data-batch-open="${esc(d.slug)}" data-batch-loc="${esc(d.locale)}">Buka Lengkap</button>
              </div>
            `).join("")}
          </div>
        </div>
      `);

      document.querySelectorAll("[data-batch-open]").forEach((btn) => {
        btn.addEventListener("click", () => {
          runNumberLookup("+" + btn.dataset.batchOpen, btn.dataset.batchLoc, "", "full");
        });
      });
    } catch (err) {
      showErrorResult("Kesalahan Batch Sitemap", err.message);
    }
  });

  /* ------------------------------------------------ SITEMAP DIRECTORY TABLE */

  async function loadSitemapDirectory() {
    const tbody = document.getElementById("sitemapTableBody");
    tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Memuat entri sitemap...</td></tr>`;

    try {
      const url = `/api/sitemap?action=list&locale=${encodeURIComponent(state.sitemapLocale)}&q=${encodeURIComponent(state.sitemapQuery)}&offset=${state.sitemapOffset}&limit=${state.sitemapLimit}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Gagal memuat direktori sitemap");

      const data = json.data;
      state.sitemapTotal = data.total;
      document.getElementById("statSitemapVal").textContent = (data.sitemapTotal || data.total).toLocaleString("id-ID");
      document.getElementById("sitemapMetaInfo").textContent = `Total ${(data.sitemapTotal || data.total).toLocaleString("id-ID")} nomor publik terindeks di Sitemap XML.`;

      if (!data.items.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Tidak ada nomor ditemukan untuk filter ini.</td></tr>`;
      } else {
        tbody.innerHTML = data.items.map((row, idx) => `
          <tr>
            <td>${state.sitemapOffset + idx + 1}</td>
            <td><strong>${esc(row.e164)}</strong></td>
            <td><code>${esc(row.slug)}</code></td>
            <td><span class="locale-badge">${esc(row.locale)}</span></td>
            <td><a href="${esc(row.url)}" target="_blank" rel="noopener" style="color:#1574d4; text-decoration:none;">/p/${esc(row.slug)} ↗</a></td>
            <td>
              <button type="button" class="btn-secondary-sm" data-dir-check="${esc(row.slug)}" data-dir-loc="${esc(row.locale)}">Cek Detail</button>
            </td>
          </tr>
        `).join("");

        tbody.querySelectorAll("[data-dir-check]").forEach((btn) => {
          btn.addEventListener("click", () => {
            runNumberLookup("+" + btn.dataset.dirCheck, btn.dataset.dirLoc, "", "full");
          });
        });
      }

      const start = data.total === 0 ? 0 : state.sitemapOffset + 1;
      const end = Math.min(state.sitemapOffset + data.items.length, data.total);
      document.getElementById("paginationInfo").textContent = `Menampilkan ${start}–${end} dari ${data.total.toLocaleString("id-ID")} nomor`;
      document.getElementById("btnPrevPage").disabled = state.sitemapOffset <= 0;
      document.getElementById("btnNextPage").disabled = end >= data.total;
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" class="table-empty">${esc(err.message)}</td></tr>`;
    }
  }

  document.getElementById("btnDirFilter").addEventListener("click", () => {
    state.sitemapLocale = document.getElementById("dirLocaleSelect").value;
    state.sitemapQuery = document.getElementById("dirSearchInput").value.trim();
    state.sitemapOffset = 0;
    loadSitemapDirectory();
  });

  document.getElementById("btnPrevPage").addEventListener("click", () => {
    state.sitemapOffset = Math.max(0, state.sitemapOffset - state.sitemapLimit);
    loadSitemapDirectory();
  });

  document.getElementById("btnNextPage").addEventListener("click", () => {
    if (state.sitemapOffset + state.sitemapLimit < state.sitemapTotal) {
      state.sitemapOffset += state.sitemapLimit;
      loadSitemapDirectory();
    }
  });

  /* ------------------------------------------------ INIT */
  loadHomeData(false);
  loadSitemapDirectory();
})();
