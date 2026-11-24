"use strict";

const gc = require("../lib/getcontact");
const { getQuery, sendJson } = require("../lib/http");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return sendJson(res, 200, { ok: true });

  const q = getQuery(req);
  const action = q.action || "list"; // summary | list | find | numbers
  const locale = q.locale || "all";
  const querySlug = q.q || "";
  const exact = q.exact === "1" || q.exact === "true";
  const details = q.details === "1" || q.details === "true";
  const offset = Math.max(0, parseInt(q.offset, 10) || 0);
  const limit = Math.min(50, Math.max(1, parseInt(q.limit, 10) || 12));
  const refresh = q.refresh === "1" || q.refresh === "true";

  try {
    if (action === "summary") {
      const sm = await gc.getSitemap(refresh);
      return sendJson(res, 200, {
        ok: true,
        url: sm.url,
        total: sm.total,
        phoneCount: sm.phoneCount,
        locales: sm.locales
      });
    }

    if (action === "find") {
      if (!querySlug) {
        return sendJson(res, 400, { ok: false, error: "Parameter pencarian 'q' wajib diisi." });
      }
      const found = await gc.findNumber(querySlug, {
        locale,
        exact,
        details,
        limit,
        maxDetails: 5,
        refresh
      });
      return sendJson(res, 200, { ok: true, action: "find", data: found });
    }

    if (action === "numbers") {
      const batch = await gc.getNumbers({
        locale: locale === "all" ? "en" : locale,
        offset,
        limit: Math.min(6, limit)
      });
      return sendJson(res, 200, { ok: true, action: "numbers", data: batch });
    }

    const list = await gc.listNumbers({ locale, q: querySlug, offset, limit, refresh });
    return sendJson(res, 200, { ok: true, action: "list", data: list });
  } catch (err) {
    return sendJson(res, err.status || 502, {
      ok: false,
      error: "Gagal mengakses Sitemap Getcontact: " + (err.message || "Upstream error"),
      upstreamStatus: err.status || null
    });
  }
};
