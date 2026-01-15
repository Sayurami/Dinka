import axios from "axios";
import * as cheerio from "cheerio";

export default async function handler(req, res) {
  try {
    const { action, query, url } = req.query;
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36"
    };

    if (!action) return res.status(400).json({ status: false, message: "action missing" });

    // ---------------- 1. SEARCH (JSON FEED) ----------------
    if (action === "search") {
      const feedUrl = `https://dinkamovieslk.blogspot.com/feeds/posts/default?q=${encodeURIComponent(query)}&alt=json&max-results=10`;
      const { data } = await axios.get(feedUrl, { headers });
      const entries = data.feed.entry || [];
      const movies = entries.map(entry => ({
        title: entry.title.$t,
        link: entry.link.find(l => l.rel === "alternate").href,
        image: entry.media$thumbnail ? entry.media$thumbnail.url.replace(/\/s72\-c/, "/s1600") : ""
      }));
      return res.json({ status: true, results: movies.length, data: movies });
    }

    // ---------------- 2. MOVIE DETAILS (ENHANCED) ----------------
    if (action === "movie") {
      if (!url) return res.status(400).json({ status: false, message: "url missing" });

      const { data: html } = await axios.get(url, { headers });
      const $ = cheerio.load(html);

      const title = $(".post-title").first().text().trim() || $("h1").text().trim();
      
      // CAST EXTRACTION (වැඩි දියුණු කළා)
      const cast = [];
      // ක්‍රමය 1: <ul> ලැයිස්තු පරීක්ෂාව
      $("div.post-body ul li").each((i, el) => {
        const text = $(el).text().trim();
        if (text && text.length < 50) cast.push(text);
      });
      // ක්‍රමය 2: ලැයිස්තු නැතිනම් <p> ටැග් පරීක්ෂාව
      if (cast.length === 0) {
        $("div.post-body p").each((i, el) => {
           const text = $(el).text();
           if (text.includes(":") || text.includes("-")) { // නම සහ චරිතය වෙන් කර ඇත්නම්
              cast.push(text.trim());
           }
        });
      }

      // DOWNLOAD LINKS (සෑම තැනම පරීක්ෂා කරයි)
      const dl_links = [];
      $("a").each((i, el) => {
        const href = $(el).attr("href") || "";
        const text = $(el).text().trim() || "Download";

        // Vercel / Encoded links
        if (href.includes("data=")) {
          try {
            const urlObj = new URL(href);
            const encodedData = urlObj.searchParams.get("data");
            if (encodedData) {
              const decoded = JSON.parse(Buffer.from(encodedData, 'base64').toString());
              dl_links.push({
                quality: text.replace(/Download|now/gi, "").trim() || "Link " + (dl_links.length + 1),
                direct_link: decoded.u
              });
            }
          } catch (e) {}
        } 
        // Direct Short links (da.gd, bit.ly etc)
        else if (href.includes("da.gd") || (text.toLowerCase().includes("download") && href.includes("http"))) {
           if (!dl_links.some(l => l.direct_link === href)) {
              dl_links.push({ quality: text, direct_link: href });
           }
        }
      });

      return res.json({
        status: true,
        data: {
          title,
          cast: cast.slice(0, 10), // මුල් 10 දෙනා පමණක්
          download_links: dl_links
        }
      });
    }

  } catch (err) {
    return res.status(500).json({ status: false, error: err.message });
  }
}
