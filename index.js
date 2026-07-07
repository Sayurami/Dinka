import axios from "axios";
import * as cheerio from "cheerio";

const BASE = "https://www.dinkamovieslk.app";
const FEED = `${BASE}/feeds/posts/default`;
const ALLOWED_HOST = "www.dinkamovieslk.app";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9"
};

/** Parse page param safely — always returns a finite integer >= 1 */
function parsePage(raw) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** Validate that a URL is safe to fetch (https + allowed host only) */
function validateMovieUrl(raw) {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return null;
    if (parsed.hostname !== ALLOWED_HOST) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { action, query, url, label, page } = req.query;

    if (!action)
      return res.status(400).json({ status: false, message: "action missing. Available: search, latest, movie, label" });

    // ─────────────────────────────────────────────────────────────
    // 1. SEARCH  — uses Blogger JSON feed
    //    ?action=search&query=<movie name>
    // ─────────────────────────────────────────────────────────────
    if (action === "search") {
      if (!query)
        return res.status(400).json({ status: false, message: "query missing" });

      const feedUrl = `${FEED}?q=${encodeURIComponent(query)}&alt=json&max-results=20`;
      const { data } = await axios.get(feedUrl, { headers: HEADERS });
      const entries = data.feed.entry || [];

      const results = entries.map((e) => {
        const link = e.link.find((l) => l.rel === "alternate")?.href || "";
        const thumb = e.media$thumbnail
          ? e.media$thumbnail.url.replace(/\/s\d+\-c/, "/s400")
          : "";
        const labels = (e.category || []).map((c) => c.term);
        return {
          title: e.title.$t,
          url: link,
          thumbnail: thumb,
          published: e.published.$t,
          labels
        };
      });

      return res.json({ status: true, results: results.length, data: results });
    }

    // ─────────────────────────────────────────────────────────────
    // 2. LATEST MOVIES  — newest posts from JSON feed
    //    ?action=latest&page=1   (page default: 1, 12 per page)
    // ─────────────────────────────────────────────────────────────
    if (action === "latest") {
      const perPage = 12;
      const pageNum = parsePage(page);
      const startIndex = (pageNum - 1) * perPage + 1;

      const feedUrl = `${FEED}?alt=json&max-results=${perPage}&start-index=${startIndex}`;
      const { data } = await axios.get(feedUrl, { headers: HEADERS });
      const entries = data.feed.entry || [];
      const total = parseInt(data.feed.openSearch$totalResults?.$t || "0", 10);

      const results = entries.map((e) => {
        const link = e.link.find((l) => l.rel === "alternate")?.href || "";
        const thumb = e.media$thumbnail
          ? e.media$thumbnail.url.replace(/\/s\d+\-c/, "/s400")
          : "";
        const labels = (e.category || []).map((c) => c.term);
        return {
          title: e.title.$t,
          url: link,
          thumbnail: thumb,
          published: e.published.$t,
          labels
        };
      });

      return res.json({
        status: true,
        page: pageNum,
        per_page: perPage,
        total_results: total,
        total_pages: Math.ceil(total / perPage),
        data: results
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 3. MOVIES BY LABEL / CATEGORY
    //    ?action=label&label=Action&page=1
    // ─────────────────────────────────────────────────────────────
    if (action === "label") {
      if (!label)
        return res.status(400).json({ status: false, message: "label missing" });

      const perPage = 12;
      const pageNum = parsePage(page);
      const startIndex = (pageNum - 1) * perPage + 1;

      const feedUrl = `${FEED}/-/${encodeURIComponent(label)}?alt=json&max-results=${perPage}&start-index=${startIndex}`;
      const { data } = await axios.get(feedUrl, { headers: HEADERS });
      const entries = data.feed.entry || [];
      const total = parseInt(data.feed.openSearch$totalResults?.$t || "0", 10);

      const results = entries.map((e) => {
        const link = e.link.find((l) => l.rel === "alternate")?.href || "";
        const thumb = e.media$thumbnail
          ? e.media$thumbnail.url.replace(/\/s\d+\-c/, "/s400")
          : "";
        return {
          title: e.title.$t,
          url: link,
          thumbnail: thumb,
          published: e.published.$t
        };
      });

      return res.json({
        status: true,
        label,
        page: pageNum,
        per_page: perPage,
        total_results: total,
        total_pages: Math.ceil(total / perPage),
        data: results
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 4. MOVIE DETAILS + DOWNLOAD LINKS  (scrapes the post page)
    //    ?action=movie&url=<full post URL>
    // ─────────────────────────────────────────────────────────────
    if (action === "movie") {
      if (!url)
        return res.status(400).json({ status: false, message: "url missing" });

      const safeUrl = validateMovieUrl(url);
      if (!safeUrl)
        return res.status(400).json({
          status: false,
          message: `url must be a valid https URL on ${ALLOWED_HOST}`
        });

      const { data: html } = await axios.get(safeUrl, { headers: HEADERS, timeout: 15000 });
      const $ = cheerio.load(html);

      // Title
      const title =
        $("meta[property='og:title']").attr("content")?.trim() ||
        $(".post-title").first().text().trim() ||
        $("h1").first().text().trim();

      // Poster image: prefer og:image, fallback to first hidden img
      const poster =
        $("meta[property='og:image']").first().attr("content") ||
        $("div[style*='display:none'] img").first().attr("src") ||
        $(".poster-img").first().attr("src") ||
        "";

      // Download links — new site uses class="dl-btn"
      const dl_links = [];

      $("a.dl-btn").each((_, el) => {
        const href = $(el).attr("href") || "";
        const text = $(el).text().replace(/\s+/g, " ").trim();
        if (href && href.startsWith("http") && !dl_links.some((l) => l.link === href)) {
          dl_links.push({ quality: text || "Download", link: href });
        }
      });

      // Fallback: old da.gd short links (older posts)
      if (dl_links.length === 0) {
        $("a").each((_, el) => {
          const href = $(el).attr("href") || "";
          const text = $(el).text().replace(/\s+/g, " ").trim();

          if (
            href === BASE + "/" ||
            href.includes("t.me") ||
            href.includes("whatsapp.com") ||
            href.includes("facebook.com") ||
            href.includes(BASE + "/search") ||
            !href.startsWith("http")
          ) return;

          if (href.includes("da.gd") || href.includes("dl.dinkamovieslk.app")) {
            if (!dl_links.some((l) => l.link === href)) {
              dl_links.push({ quality: text || "Download", link: href });
            }
          }
        });
      }

      // Labels / categories
      const labels = [];
      $("a[href*='/search/label/']").each((_, el) => {
        const lbl = $(el).text().trim();
        if (lbl && !labels.includes(lbl)) labels.push(lbl);
      });

      // Basic metadata from info-box (year, runtime, genre etc.)
      const meta = {};
      $(".info-box, .info-row").each((_, el) => {
        const txt = $(el).text().replace(/\s+/g, " ").trim();
        if (txt.includes(":")) {
          const [key, ...rest] = txt.split(":");
          meta[key.trim()] = rest.join(":").trim();
        }
      });

      return res.json({
        status: true,
        data: {
          title,
          poster,
          labels,
          meta,
          download_links: dl_links
        }
      });
    }

    // Unknown action
    return res.status(400).json({
      status: false,
      message: `Unknown action '${action}'. Available: search, latest, movie, label`
    });

  } catch (err) {
    // Distinguish upstream failures from unexpected internal errors
    if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND" || err.code === "ETIMEDOUT") {
      return res.status(502).json({ status: false, error: "Failed to reach upstream server. Try again later." });
    }
    if (err.response) {
      // Upstream returned an HTTP error
      return res.status(502).json({
        status: false,
        error: `Upstream returned HTTP ${err.response.status}`
      });
    }
    // Generic fallback — do not expose raw err.message
    return res.status(500).json({ status: false, error: "Internal server error" });
  }
}
