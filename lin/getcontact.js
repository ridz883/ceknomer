/**
 * getcontact.js — read-only scraper for GETCONTACT number-lookup
 * (https://getcontact.com/number-lookup)
 *
 * UMD: require('getcontact') in Node, window.Getcontact in browser.
 * Public pages + public sitemap + embedded JSON-LD only. No auth, no writes.
 */
(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Getcontact = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var BASE = "https://getcontact.com";
  var LOOKUP = BASE + "/number-lookup";
  var SITEMAP = LOOKUP + "/sitemap.xml";
  var API_BASE = "https://lookupapi.getcontact.com/";
  var LOCALES = ["en", "tr", "ru", "id"];
  var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

  var _sitemapCache = { data: null, expiresAt: 0 };
  var SITEMAP_TTL_MS = 15 * 60 * 1000;

  /* ------------------------------------------------------------------ utils */

  function isNode() {
    return typeof process !== "undefined" && !!process.versions && !!process.versions.node;
  }

  function entities(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&quot;/g, '"').replace(/&#0*39;|&apos;|&#x27;/gi, "'")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;|\u00a0/g, " ")
      .replace(/&#(\d+);/g, function (_, n) { try { return String.fromCodePoint(+n); } catch (e) { return _; } })
      .replace(/&#x([0-9a-f]+);/gi, function (_, n) { try { return String.fromCodePoint(parseInt(n, 16)); } catch (e) { return _; } })
      .replace(/&amp;/g, "&");
  }

  function clean(s) {
    return entities(String(s == null ? "" : s)
      .replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]*>/g, " "))
      .replace(/\s+/g, " ").trim();
  }

  function jsonParse(s) { try { return JSON.parse(s); } catch (e) { return null; } }

  function toInt(s) {
    if (s == null) return null;
    var n = String(s).replace(/[^\d]/g, "");
    return n ? parseInt(n, 10) : null;
  }

  function toFloat(s) {
    if (s == null) return null;
    var m = String(s).replace(/\u00a0/g, " ").match(/[\d.,]+/);
    if (!m) return null;
    return parseFloat(m[0].replace(/\./g, "").replace(",", "."));
  }

  function slugify(s) {
    return String(s || "").toLowerCase().normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  /** Extract the numeric slug from a number, path or full URL. */
  function getSlug(x) {
    if (x == null) return "";
    var s = String(x).trim();
    try { var u = new URL(s); if (u.hostname) s = u.pathname + u.search; } catch (e) {}
    var m = s.match(/\/p\/(\d+)/);
    if (m) return m[1];
    return s.replace(/\D/g, "");
  }

  function pathSlug(x) { return getSlug(x); }

  /** Normalise user input into a digit-only E.164-ish slug with optional default country code. */
  function normalizeNumber(input, defaultCountryCode) {
    var raw = String(input == null ? "" : input).trim();
    var isUrl = /^https?:\/\//i.test(raw) || /\/p\/\d+/.test(raw);
    var hasPlus = /^\+/.test(raw);
    var digits = getSlug(raw);
    var cc = String(defaultCountryCode || "").replace(/\D/g, "");

    if (digits && cc && !isUrl && !hasPlus) {
      if (digits.charAt(0) === "0") {
        digits = cc + digits.replace(/^0+/, "");
      } else if (digits.indexOf(cc) !== 0 && digits.length >= 7 && digits.length <= 12) {
        digits = cc + digits;
      }
    }

    return {
      input: raw,
      digits: digits,
      e164: digits ? "+" + digits : "",
      slug: digits,
      countryCode: cc || null
    };
  }

  function localeOf(x) {
    var s = String(x || "en").toLowerCase();
    if (LOCALES.indexOf(s) >= 0) return s;
    try {
      var u = new URL(s);
      var m = u.pathname.match(/^\/number-lookup\/([a-z]{2})/);
      if (m && LOCALES.indexOf(m[1]) >= 0) return m[1];
    } catch (e) {}
    return "en";
  }

  function detailUrl(input, locale, countryCode) {
    var loc = localeOf(locale);
    var norm = normalizeNumber(input, countryCode);
    return LOOKUP + "/" + loc + "/p/" + norm.digits;
  }

  function homeUrl(locale) { return LOOKUP + "/" + localeOf(locale) + "/"; }

  /* ------------------------------------------------------------- JSON-LD */

  function parseLD(html) {
    var out = [];
    var re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    var m;
    while ((m = re.exec(html))) {
      var o = jsonParse(entities(m[1]));
      if (!o) continue;
      if (Array.isArray(o)) out = out.concat(o); else out.push(o);
    }
    return out;
  }

  function findLD(ld, type) {
    for (var i = 0; i < ld.length; i++) {
      var o = ld[i];
      if (!o) continue;
      if (o["@type"] === type) return o;
      if (o["@graph"] && Array.isArray(o["@graph"])) {
        for (var j = 0; j < o["@graph"].length; j++) {
          if (o["@graph"][j] && o["@graph"][j]["@type"] === type) return o["@graph"][j];
        }
      }
    }
    return null;
  }

  function findAllLD(ld, type) {
    var out = [];
    for (var i = 0; i < ld.length; i++) {
      var o = ld[i];
      if (!o) continue;
      if (o["@type"] === type) out.push(o);
      if (o["@graph"] && Array.isArray(o["@graph"])) {
        o["@graph"].forEach(function (g) { if (g && g["@type"] === type) out.push(g); });
      }
    }
    return out;
  }

  /* -------------------------------------------------------------- parse */

  function parseStatPairs(html) {
    var re = /<p class="font-semibold[^"]*">([^<]*)<\/p><p class="font-medium uppercase[^"]*">([^<]*)<\/p>/g;
    var m, out = [];
    while ((m = re.exec(html))) {
      out.push({ value: clean(m[1]), label: clean(m[2]) });
    }
    return out;
  }

  function statKey(label) {
    var s = clean(label).toLowerCase();
    if (/search|sorgulama|поиск|pencarian|cari/.test(s)) {
      return /total|toplam|всего/.test(s) ? "totalCalls" : "searchCount";
    }
    if (/call|çağrı|звонк|panggilan/.test(s)) return "totalCalls";
    if (/report|rapor|отчет|lapor/.test(s)) return "userReports";
    if (/operator|оператор|operat/.test(s)) return "operator";
    if (/region|bölge|регион|wilayah|daerah/.test(s)) return "region";
    return null;
  }

  function normaliseStats(pairs) {
    var out = {};
    pairs.forEach(function (p) {
      var k = statKey(p.label);
      if (k) out[k] = p.value;
    });
    if (out.searchCount) out.searchCountNum = toInt(out.searchCount);
    if (out.totalCalls) out.totalCallsNum = toInt(out.totalCalls);
    if (out.userReports) out.userReportsNum = toInt(out.userReports);
    return out;
  }

  function parseRisk(html) {
    var m = html.match(/<p class="text-mini-subtitle uppercase tracking-wide text-neutral-600">([^<]*)<\/p>\s*<p class="text-body-md-semibold text-([a-z]+-\d+)">([^<]*)<\/p>\s*<p class="sr-only">([^<]*)<\/p>/);
    if (!m) return null;
    return {
      labelText: clean(m[1]),
      color: m[2],
      label: clean(m[3]),
      percentText: clean(m[4]),
      percent: toFloat(m[4])
    };
  }

  function parseSurface(html) {
    var out = {};
    var re = /<div class="p-xl rounded-lg bg-surface-300"><p class="text-mini-subtitle mb-xs uppercase tracking-wide text-neutral-600">([^<]*)<\/p><p class="text-body-md-semibold text-[a-z]+-\d+">([^<]*)<\/p>/g;
    var m;
    while ((m = re.exec(html))) out[slugify(clean(m[1]))] = clean(m[2]);
    return out;
  }

  function parseSpamCards(html) {
    var out = [];
    var re = /<a aria-label="([^"]*)"[^>]*href="([^"]*)"[^>]*>[\s\S]{0,600}?<span class="text-base font-medium text-neutral-500">([^<]*)<\/span><span class="text-sm text-neutral-600">([^<]*)<\/span>[\s\S]{0,300}?<span class="rounded-lg bg-red-200[^"]*">([^<]*)<\/span><\/a>/g;
    var m;
    while ((m = re.exec(html))) {
      out.push({
        number: clean(m[3]),
        reports: clean(m[4]),
        reportsNum: toInt(m[4]),
        label: clean(m[5]),
        title: clean(m[1]),
        url: /^https?:/.test(m[2]) ? entities(m[2]) : BASE + entities(m[2]),
        slug: getSlug(m[2])
      });
    }
    if (!out.length) {
      var re2 = /<a aria-label="([^"]*,[^"]*(?:reports|laporan|rapor|отчет)[^"]*)"[^>]*href="([^"]*\/p\/\d+)"/gi;
      while ((m = re2.exec(html))) {
        var p = clean(m[1]).split(",");
        out.push({
          number: clean(p[0]),
          reports: clean(p[1]),
          reportsNum: toInt(p[1]),
          label: clean(p[2]),
          url: /^https?:/.test(m[2]) ? entities(m[2]) : BASE + entities(m[2]),
          slug: getSlug(m[2])
        });
      }
    }
    return out;
  }

  function parseCommentsLD(ld, htmlFallback) {
    var lists = findAllLD(ld, "ItemList");
    var out = [];
    lists.forEach(function (list) {
      var items = list.itemListElement || [];
      items.forEach(function (it) {
        if (!it || it["@type"] !== "Comment") return;
        out.push({
          text: clean(it.text),
          date: it.datePublished || null,
          author: it.author && it.author.name ? clean(it.author.name) : null,
          position: it.position || out.length + 1
        });
      });
    });
    if (!out.length && htmlFallback) {
      var re = /<div id="comment-\d+"[\s\S]*?<p class="text-body-md text-neutral-500 mb-lg">([\s\S]*?)<\/p>[\s\S]*?<span class="min-w-0 truncate text-body-sm text-neutral-500">([^<]*)<\/span>[\s\S]*?<span class="shrink-0 text-body-sm text-neutral-600">([^<]*)<\/span>/g;
      var m;
      while ((m = re.exec(htmlFallback))) {
        out.push({ text: clean(m[1]), author: clean(m[2]), date: clean(m[3]), position: out.length + 1 });
      }
    }
    return out;
  }

  function parseFaqLD(ld) {
    var out = [];
    findAllLD(ld, "FAQPage").forEach(function (f) {
      (f.mainEntity || []).forEach(function (q) {
        out.push({
          question: clean(q.name),
          answer: clean(q.acceptedAnswer && q.acceptedAnswer.text)
        });
      });
    });
    return out;
  }

  function parseLive(html) {
    var m = html.match(/([\d.,]+)\s+(?:people are looking up numbers right now|orang sedang mencari nomor sekarang|kişi şu anda numara sorguluyor|человек сейчас ищут номера)/i);
    return m ? { count: toInt(m[1]), text: clean(m[0]) } : null;
  }

  function parseHomeStats(html) {
    var out = [];
    var re = /<span class="text-h4 text-neutral-500">([^<]*)<\/span><span class="text-body-md text-neutral-600">([^<]*)<\/span>/g;
    var m;
    while ((m = re.exec(html))) out.push({ value: clean(m[1]), label: clean(m[2]) });
    return out;
  }

  /* ------------------------------------------------------------- request */

  async function request(url, opts) {
    opts = opts || {};
    var tries = opts.retries == null ? 3 : opts.retries;
    var last;
    for (var i = 0; i < tries; i++) {
      try {
        var r = await fetch(url, {
          method: opts.method || "GET",
          headers: Object.assign({
            "User-Agent": UA,
            "Accept-Language": (opts.locale || "en") + "-US,en;q=0.9,id;q=0.8",
            Accept: opts.accept || "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            Referer: opts.referer || LOOKUP + "/"
          }, opts.headers || {}),
          redirect: "follow"
        });
        if (!r.ok) {
          var err = new Error("HTTP " + r.status);
          err.status = r.status;
          throw err;
        }
        var txt = await r.text();
        return opts.json ? jsonParse(txt) : txt;
      } catch (e) {
        last = e;
        if (i < tries - 1) await new Promise(function (res) { setTimeout(res, 500 * (i + 1)); });
      }
    }
    throw last;
  }

  /* ---------------------------------------------------------------- API */

  async function getHome(locale) {
    var loc = localeOf(locale);
    var url = homeUrl(loc);
    var html = await request(url, { locale: loc });
    var ld = parseLD(html);
    var webSite = findLD(ld, "WebSite");
    return {
      locale: loc,
      url: url,
      title: clean((html.match(/<title>([^<]*)<\/title>/) || [])[1]),
      live: parseLive(html),
      stats: parseHomeStats(html),
      spamNumbers: parseSpamCards(html),
      faqs: parseFaqLD(ld),
      searchAction: webSite && webSite.potentialAction ? webSite.potentialAction : null,
      locales: LOCALES.slice()
    };
  }

  async function getSpamNumbers(locale) {
    var h = await getHome(locale);
    return h.spamNumbers;
  }

  async function getNumber(input, locale, countryCode) {
    var loc = localeOf(locale);
    var norm = normalizeNumber(input, countryCode);
    if (!norm.digits) throw new Error("No digits found in input: " + input);
    var url = detailUrl(norm.digits, loc);
    var html = await request(url, { locale: loc });
    var ld = parseLD(html);
    var qa = findLD(ld, "QAPage");
    var crumb = findLD(ld, "BreadcrumbList");
    var h1 = clean((html.match(/<h1[^>]*>([^<]*)<\/h1>/) || [])[1]);
    var badge = clean((html.match(/rounded-full px-xl py-md[^>]*>([^<]*)</) || [])[1]);
    var timeM = html.match(/<time dateTime="([^"]*)">([^<]*)<\/time>/i);
    var pairs = parseStatPairs(html);
    var stats = normaliseStats(pairs);
    var ans = qa && qa.mainEntity && qa.mainEntity.acceptedAnswer;
    var riskInfo = parseRisk(html);
    var found = !!(h1 || qa || pairs.length || riskInfo);
    return {
      found: found,
      note: found ? null : "No public Getcontact data for this number (soft-200 shell page)",
      locale: loc,
      url: url,
      input: norm.input,
      e164: norm.e164,
      digits: norm.digits,
      slug: norm.slug,
      number: h1 || norm.e164,
      title: qa && qa.mainEntity ? clean(qa.mainEntity.name) : null,
      badge: badge || null,
      description: ans ? clean(ans.text) : null,
      pageDate: timeM ? { iso: entities(timeM[1]), text: clean(timeM[2]) } : null,
      answerCount: qa && qa.mainEntity ? qa.mainEntity.answerCount : null,
      rating: qa && qa.mainEntity ? {
        up: qa.mainEntity.upvoteCount,
        down: qa.mainEntity.downvoteCount
      } : null,
      risk: riskInfo,
      surface: parseSurface(html),
      stats: stats,
      statPairs: pairs,
      comments: parseCommentsLD(ld, html),
      faqs: parseFaqLD(ld),
      breadcrumb: crumb ? (crumb.itemListElement || []).map(function (x) {
        return { name: clean(x.name), url: x.item };
      }) : [],
      relatedSpam: parseSpamCards(html)
    };
  }

  async function getComments(input, locale, countryCode) {
    var d = await getNumber(input, locale, countryCode);
    return d.comments;
  }

  function searchUrl(input, locale, countryCode) { return detailUrl(input, locale, countryCode); }
  async function search(input, locale, countryCode) { return getNumber(input, locale, countryCode); }
  async function lookup(input, locale, countryCode) { return getNumber(input, locale, countryCode); }

  async function getSitemap(forceRefresh) {
    var now = Date.now();
    if (!forceRefresh && _sitemapCache.data && now < _sitemapCache.expiresAt) {
      return _sitemapCache.data;
    }
    var xml = await request(SITEMAP, { accept: "application/xml,text/xml,*/*" });
    var locs = [];
    var re = /<loc>([^<]+)<\/loc>/g;
    var m;
    while ((m = re.exec(xml))) locs.push(entities(m[1]));
    var phones = [];
    locs.forEach(function (u) {
      var mm = u.match(/\/number-lookup\/([a-z]{2})\/p\/(\d+)/);
      if (mm) phones.push({ locale: mm[1], slug: mm[2], e164: "+" + mm[2], url: u });
    });
    var result = {
      url: SITEMAP,
      total: locs.length,
      locales: locs.filter(function (u) { return !/\/p\//.test(u); }),
      phoneCount: phones.length,
      phones: phones
    };
    _sitemapCache = { data: result, expiresAt: now + SITEMAP_TTL_MS };
    return result;
  }

  /** List sitemap phones without fetching each page. */
  async function listNumbers(opts) {
    opts = opts || {};
    var sm = await getSitemap(opts.refresh);
    var rows = sm.phones;
    if (opts.locale && opts.locale !== "all") {
      rows = rows.filter(function (p) { return p.locale === localeOf(opts.locale); });
    }
    if (opts.q) {
      var q = getSlug(opts.q);
      rows = rows.filter(function (p) { return p.slug.indexOf(q) >= 0; });
    }
    var offset = Math.max(0, parseInt(opts.offset, 10) || 0);
    var limit = Math.max(1, parseInt(opts.limit, 10) || rows.length);
    return {
      total: rows.length,
      sitemapTotal: sm.phoneCount,
      offset: offset,
      limit: limit,
      items: rows.slice(offset, offset + limit)
    };
  }

  /** Find a number in the public sitemap, optionally fetch its detail page. */
  async function findNumber(input, opts) {
    opts = opts || {};
    var norm = normalizeNumber(input, opts.countryCode);
    var digits = norm.digits;
    var sm = await getSitemap(opts.refresh);
    var found = sm.phones.filter(function (p) {
      var localeMatch = !opts.locale || opts.locale === "all" || p.locale === localeOf(opts.locale);
      if (!localeMatch) return false;
      return opts.exact ? p.slug === digits : p.slug.indexOf(digits) >= 0;
    });
    var capped = found.slice(0, opts.maxDetails || 5);
    if (capped.length && opts.details) {
      for (var i = 0; i < capped.length; i++) {
        capped[i] = Object.assign({}, capped[i], {
          detail: await getNumber(capped[i].slug, capped[i].locale)
        });
      }
    }
    return {
      query: String(input),
      digits: digits,
      count: found.length,
      items: opts.details ? capped : found.slice(0, opts.limit || 50)
    };
  }

  /** Fetch N detail pages from sitemap (read-only, polite). */
  async function getNumbers(opts) {
    opts = opts || {};
    var limit = Math.min(10, Math.max(1, parseInt(opts.limit, 10) || 5));
    var list = await listNumbers({ locale: opts.locale, offset: opts.offset || 0, limit: limit });
    var out = [];
    for (var i = 0; i < list.items.length; i++) {
      out.push(await getNumber(list.items[i].slug, list.items[i].locale));
    }
    return { total: list.total, offset: list.offset, limit: limit, items: out };
  }

  /* ------------------------------------------------------------------ CLI */

  async function cli() {
    if (!isNode()) return;
    var cmd = process.argv[2] || "home";
    var arg = process.argv[3];
    var arg2 = process.argv[4];
    var out;
    switch (cmd) {
      case "home": out = await getHome(arg || "en"); break;
      case "spam": out = await getSpamNumbers(arg || "en"); break;
      case "number": case "lookup": case "search": out = await getNumber(arg, arg2 || "en", process.argv[5]); break;
      case "comments": out = await getComments(arg, arg2 || "en", process.argv[5]); break;
      case "searchurl": out = { url: searchUrl(arg, arg2 || "en", process.argv[5]) }; break;
      case "sitemap": out = await getSitemap(); break;
      case "list": out = await listNumbers({ locale: arg, limit: +(arg2 || 20) }); break;
      case "find": out = await findNumber(arg, { details: /details/.test(process.argv[5] || "") }); break;
      case "numbers": out = await getNumbers({ locale: arg, limit: +(arg2 || 3) }); break;
      case "locales": out = { locales: LOCALES }; break;
      default: out = { error: "unknown command", commands: ["home", "spam", "number", "lookup", "search", "comments", "searchurl", "sitemap", "list", "find", "numbers", "locales"] };
    }
    console.log(JSON.stringify(out, null, 2));
  }

  if (isNode() && require.main === module) cli().catch(function (e) {
    console.error("ERROR:", e && e.message ? e.message : e);
    process.exit(1);
  });

  return {
    BASE: BASE, LOOKUP: LOOKUP, SITEMAP: SITEMAP, API_BASE: API_BASE,
    LOCALES: LOCALES,
    getSlug: getSlug, pathSlug: pathSlug, normalizeNumber: normalizeNumber,
    detailUrl: detailUrl, searchUrl: searchUrl, homeUrl: homeUrl,
    request: request, parseLD: parseLD,
    getHome: getHome, getSpamNumbers: getSpamNumbers,
    getNumber: getNumber, getComments: getComments,
    search: search, lookup: lookup,
    getSitemap: getSitemap, listNumbers: listNumbers,
    findNumber: findNumber, getNumbers: getNumbers,
    cli: cli
  };
});
