import axios from "axios";
import * as cheerio from "cheerio";

export default async function handler(req, res) {
  try {
    const { action, query, url } = req.query;
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
      "Referer": "https://dinkamovieslk.blogspot.com/"
    };

    if (!action) return res.status(400).json({ status: false, message: "action missing" });

    // ---------------- 1. SEARCH ----------------
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

    // ---------------- 2. MOVIE DETAILS (GOOGLE DRIVE SUPPORTED) ----------------
    if (action === "movie") {
      if (!url) return res.status(400).json({ status: false, message: "url missing" });

      const { data: html } = await axios.get(url, { headers });
      const $ = cheerio.load(html);
      const pageSource = $.html(); 

      const title = $(".post-title").first().text().trim() || $("h1").text().trim();
      const dl_links = [];

      // 1. Vercel Encoded Link wala thiyena Google Drive links ganna method eka
      const vercelRegex = /https:\/\/dinkamovieslk-dl\.vercel\.app\/\?data=[a-zA-Z0-9%=\-_.]+/g;
      const vercelMatches = pageSource.match(vercelRegex) || [];

      vercelMatches.forEach(link => {
        try {
          const cleanUrl = link.replace(/&amp;/g, '&');
          const urlParams = new URL(cleanUrl);
          const encodedData = urlParams.searchParams.get("data");
          
          if (encodedData) {
            const decoded = JSON.parse(Buffer.from(encodedData, 'base64').toString());
            if (decoded.u) {
              dl_links.push({
                quality: "Download (G-Drive)",
                direct_link: decoded.u,
                type: decoded.y || "direct"
              });
            }
          }
        } catch (e) {}
      });

      // 2. da.gd saha anith short links ganna method eka
      const generalRegex = /https:\/\/(da\.gd|bit\.ly|mega\.nz|drive\.google\.com)\/[a-zA-Z0-9?%=\-_/.]+/g;
      const generalMatches = pageSource.match(generalRegex) || [];

      generalMatches.forEach(link => {
        if (!dl_links.some(l => l.direct_link === link) && !link.includes("uc?export")) {
          dl_links.push({ quality: "Direct Download", direct_link: link });
        }
      });

      return res.json({
        status: true,
        data: {
          title,
          download_links: dl_links
        }
      });
    }

  } catch (err) {
    return res.status(500).json({ status: false, error: err.message });
  }
}
