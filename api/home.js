"use strict";

const gc = require("../lib/getcontact");
const { getQuery, sendJson, getCache, setCache } = require("../lib/http");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return sendJson(res, 200, { ok: true });

  const q = getQuery(req);
  const locale = q.locale || "id";
  const refresh = q.refresh === "1" || q.refresh === "true";
  const cacheKey = `home:${locale}`;

  if (!refresh) {
    const cached = getCache(cacheKey);
    if (cached) return sendJson(res, 200, { ok: true, cached: true, data: cached });
  }

  try {
    const data = await gc.getHome(locale);
    setCache(cacheKey, data, 5 * 60 * 1000);
    return sendJson(res, 200, { ok: true, cached: false, data });
  } catch (err) {
    return sendJson(res, err.status || 502, {
      ok: false,
      error: "Gagal mengambil data beranda Getcontact: " + (err.message || "Upstream error"),
      upstreamStatus: err.status || null
    });
  }
};
