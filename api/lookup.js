"use strict";

const gc = require("../lib/getcontact");
const { getQuery, sendJson, getCache, setCache } = require("../lib/http");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return sendJson(res, 200, { ok: true });

  const q = getQuery(req);
  const rawNumber = q.number || q.q || "";
  const locale = q.locale || "id";
  const countryCode = q.countryCode !== undefined ? q.countryCode : "62";
  const mode = q.mode || "full"; // full | url
  const refresh = q.refresh === "1" || q.refresh === "true";

  const normalized = gc.normalizeNumber(rawNumber, countryCode);
  if (!normalized.digits) {
    return sendJson(res, 400, {
      ok: false,
      error: "Masukkan nomor telepon atau URL Getcontact yang valid."
    });
  }

  if (mode === "url") {
    return sendJson(res, 200, {
      ok: true,
      mode: "url",
      normalized,
      url: gc.searchUrl(normalized.digits, locale)
    });
  }

  const cacheKey = `lookup:${locale}:${normalized.digits}`;
  if (!refresh) {
    const cached = getCache(cacheKey);
    if (cached) return sendJson(res, 200, { ok: true, cached: true, normalized, data: cached });
  }

  try {
    const data = await gc.getNumber(normalized.digits, locale);
    setCache(cacheKey, data, 3 * 60 * 1000);
    return sendJson(res, 200, { ok: true, cached: false, normalized, data });
  } catch (err) {
    return sendJson(res, err.status || 502, {
      ok: false,
      normalized,
      searchUrl: gc.searchUrl(normalized.digits, locale),
      error: "Gagal mengambil data nomor dari Getcontact: " + (err.message || "Upstream error"),
      upstreamStatus: err.status || null
    });
  }
};
