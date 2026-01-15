import axios from "axios";
import * as cheerio from "cheerio";

export default async function handler(req, res) {
  try {
    const { action, query, url } = req.query;
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36"
    };

    if (!action) return res.status(400).json({ status: false, message: "action missing" });

    // ---------------- 1. සෙවුම් කොටස (SEARCH) ----------------
    if (action === "search") {
      if (!query) return res.status(400).json({ status: false, message: "query missing" });

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

    // ---------------- 2. විස්තර සහ ලින්ක් (DETAILS & DL LINKS) ----------------
    if (action === "movie") {
      if (!url) return res.status(400).json({ status: false, message: "url missing" });

      const { data: html } = await axios.get(url, { headers });
      const $ = cheerio.load(html);

      const title = $(".post-title").first().text().trim() || $("h1").text().trim();
      
      // නළු නිළියන් සහ විස්තර
      const cast = [];
      $("div.post-body ul li").each((i, el) => {
        cast.push($(el).text().trim());
      });

      const dl_links = [];
      $("a").each((i, el) => {
        const href = $(el).attr("href") || "";
        const text = $(el).text().trim();

        // Vercel ලින්ක් එක ඇතුළේ තියෙන ලින්ක් එක Decode කිරීම
        if (href.includes("vercel.app") && href.includes("data=")) {
          try {
            const encodedData = new URL(href).searchParams.get("data");
            if (encodedData) {
              const decoded = JSON.parse(Buffer.from(encodedData, 'base64').toString());
              dl_links.push({
                quality: text || "Download",
                direct_link: decoded.u // මෙය da.gd ලින්ක් එකයි
              });
            }
          } catch (e) {}
        }
      });

      return res.json({
        status: true,
        data: {
          title,
          cast,
          download_links: dl_links
        }
      });
    }

    return res.status(400).json({ status: false, message: "Invalid action" });

  } catch (err) {
    return res.status(500).json({ status: false, error: err.message });
  }
}
