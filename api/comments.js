"use strict";

const gc = require("../lib/getcontact");
const { getQuery, sendJson } = require("../lib/http");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return sendJson(res, 200, { ok: true });

  const q = getQuery(req);
  const rawNumber = q.number || q.q || "";
  const locale = q.locale || "id";
  const countryCode = q.countryCode !== undefined ? q.countryCode : "62";

  const normalized = gc.normalizeNumber(rawNumber, countryCode);
  if (!normalized.digits) {
    return sendJson(res, 400, {
      ok: false,
      error: "Nomor telepon wajib diisi untuk mengambil komentar."
    });
  }

  try {
    const comments = await gc.getComments(normalized.digits, locale);
    return sendJson(res, 200, {
      ok: true,
      normalized,
      locale,
      count: comments.length,
      comments
    });
  } catch (err) {
    return sendJson(res, err.status || 502, {
      ok: false,
      error: "Gagal memuat komentar: " + (err.message || "Upstream error"),
      upstreamStatus: err.status || null
    });
  }
};
