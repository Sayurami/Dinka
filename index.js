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
      let watch_link = "";

      $("a.dl-btn").each((_, el) => {
        const href = $(el).attr("href") || "";
        const text = $(el).text().replace(/\s+/g, " ").trim();

        if (!href || !href.startsWith("http")) return;
        // Skip Telegram, WhatsApp, Facebook links
        if (
          href.includes("t.me") ||
          href.includes("telegram.me") ||
          href.includes("whatsapp.com") ||
          href.includes("facebook.com")
        ) return;
        // Separate watch/stream links from download links
        if (
          text.toLowerCase() === "watch" ||
          href.includes("/p/") && href.includes("watch")
        ) {
          if (!watch_link) watch_link = href;
          return;
        }

        if (!dl_links.some((l) => l.link === href)) {
          dl_links.push({ quality: text || "Download", link: href });
        }
      });

      // Fallback: old da.gd short links (older posts)
      if (dl_links.length === 0) {
        $("a").each((_, el) => {
          const href = $(el).attr("href") || "";
          const text = $(el).text().replace(/\s+/g, " ").trim();

          if (
            !href.startsWith("http") ||
            href === BASE + "/" ||
            href.includes("t.me") ||
            href.includes("telegram.me") ||
            href.includes("whatsapp.com") ||
            href.includes("facebook.com") ||
            href.includes(BASE + "/search")
          ) return;

          if (href.includes("da.gd") || href.includes("dl.dinkamovieslk.app")) {
            if (!dl_links.some((l) => l.link === href)) {
              dl_links.push({ quality: text || "Download", link: href });
            }
          }
        });
      }

      // Labels — post uses class="m-card" for its own genre tags (not sidebar)
      const labels = [];
      $("a.m-card[href*='/search/label/']").each((_, el) => {
        const lbl = $(el).text().replace(/\s+/g, " ").trim();
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
          watch_link: watch_link || null,
          download_links: dl_links
        }
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 5. RESOLVE REAL DOWNLOAD LINKS from dl.dinkamovieslk.app
    //    ?action=resolve&url=https://dl.dinkamovieslk.app/?data=...
    //
    //    Strategy: ZenRows JS render → suppress ad popup → wait 13s
    //    for countdown → click #dlBtn → browser navigates to real
    //    link (GDrive / Pixeldrain / Mega) → extract final URL.
    // ─────────────────────────────────────────────────────────────
    if (action === "resolve") {
      if (!url)
        return res.status(400).json({ status: false, message: "url missing" });

      // Only allow dl.dinkamovieslk.app links
      let parsedDl;
      try {
        parsedDl = new URL(url);
      } catch {
        return res.status(400).json({ status: false, message: "invalid url" });
      }
      if (parsedDl.protocol !== "https:" || parsedDl.hostname !== "dl.dinkamovieslk.app") {
        return res.status(400).json({
          status: false,
          message: "url must be a valid https URL on dl.dinkamovieslk.app"
        });
      }

      const ZENROWS_KEY = process.env.ZENROWS_API_KEY || "75bdab6643e5c9a8a0523ee4a544b263a87fc17d";

      // js_instructions:
      //  1. Suppress ad pop-up that fires on button click
      //  2. Wait 13s (10s countdown + 3s buffer)
      //  3. Click the download button — page does window.location.replace(realUrl)
      //  4. Wait 3s for navigation to complete
      //  5. Evaluate final document.location.href to capture the real URL
      const jsInstructions = JSON.stringify([
        { evaluate: "window.open = function(){}; window._capturedUrl = null; var _origReplace = window.location.replace.bind(window.location); window.location.replace = function(u){ window._capturedUrl = u; _origReplace(u); };" },
        { wait: 13000 },
        { click: "#dlBtn" },
        { wait: 3000 },
        { evaluate: "window._capturedUrl || document.location.href" }
      ]);

      const zenrowsUrl = `https://api.zenrows.com/v1/?apikey=${ZENROWS_KEY}&url=${encodeURIComponent(url)}&js_render=true&js_instructions=${encodeURIComponent(jsInstructions)}`;
      const { data: dlHtml } = await axios.get(zenrowsUrl, { timeout: 90000 });

      // ------------------------------------------------------------------
      // Extract the real download URL from the resolved page.
      // After clicking the button the ZenRows browser follows the redirect,
      // so the returned HTML is from the destination (GDrive, Pixeldrain…).
      // We pull the canonical / og:url first, then fall back to URL patterns.
      // ------------------------------------------------------------------
      const $dl = cheerio.load(dlHtml);

      // Canonical URL meta tags set by GDrive / Pixeldrain etc.
      let resolvedUrl =
        $dl("meta[property='og:url']").attr("content") ||
        $dl("link[rel='canonical']").attr("href") ||
        null;

      // If no meta tag, try regex on raw HTML for known hosts
      if (!resolvedUrl) {
        const patterns = [
          /https:\/\/drive\.google\.com\/file\/d\/[^"'\s&]+/,
          /https:\/\/mega\.nz\/[^"'\s]+/,
          /https:\/\/pixeldrain\.com\/[^"'\s]+/,
          /https:\/\/www\.mediafire\.com\/[^"'\s]+/,
          /https:\/\/1drv\.ms\/[^"'\s]+/,
          /https:\/\/gofile\.io\/[^"'\s]+/,
        ];
        for (const pat of patterns) {
          const m = dlHtml.match(pat);
          if (m) { resolvedUrl = m[0].split('"')[0].split("'")[0]; break; }
        }
      }

      // Determine link type label
      let linkType = "direct";
      if (resolvedUrl) {
        if (resolvedUrl.includes("drive.google.com")) linkType = "gdrive";
        else if (resolvedUrl.includes("mega.nz")) linkType = "mega";
        else if (resolvedUrl.includes("pixeldrain.com")) linkType = "pixeldrain";
        else if (resolvedUrl.includes("mediafire.com")) linkType = "mediafire";
      }

      // Page title from the destination (e.g. "filename.mp4 - Google Drive")
      const pageTitle = $dl("title").first().text().trim() || null;

      if (!resolvedUrl) {
        return res.json({
          status: false,
          source: url,
          error: "Could not extract real URL — page structure may have changed",
          page_title: pageTitle
        });
      }

      return res.json({
        status: true,
        source: url,
        data: {
          link: resolvedUrl,
          type: linkType,
          page_title: pageTitle
        }
      });
    }

    // Unknown action
    return res.status(400).json({
      status: false,
      message: `Unknown action '${action}'. Available: search, latest, movie, label, resolve`
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
