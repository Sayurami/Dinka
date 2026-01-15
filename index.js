import axios from "axios";
import * as cheerio from "cheerio";

export default async function handler(req, res) {
  try {
    const { action, query, url } = req.query;

    if (!action) return res.status(400).json({ status: false, message: "action missing" });

    // ---------------- 1. සෙවුම් Endpoint (SEARCH) ----------------
    if (action === "search") {
      if (!query) return res.status(400).json({ status: false, message: "query missing" });

      const urlSearch = `https://dinkamovieslk.blogspot.com/search?q=${encodeURIComponent(query)}&m=1`;
      const { data } = await axios.get(urlSearch);
      const $ = cheerio.load(data);

      const movies = [];
      $("div.post-outer, article").each((i, el) => {
        const titleEl = $(el).find(".post-title a, h3 a");
        const title = titleEl.text().trim();
        const link = titleEl.attr("href");
        const image = $(el).find("img").attr("src") || "";
        
        if (title && link) {
          movies.push({ title, link, image });
        }
      });

      return res.json({ status: true, results: movies.length, data: movies });
    }

    // ---------------- 2. විස්තර ලබාගැනීමේ Endpoint (MOVIE DETAILS) ----------------
    if (action === "movie") {
      if (!url) return res.status(400).json({ status: false, message: "url missing" });

      const { data } = await axios.get(url);
      const $ = cheerio.load(data);

      const title = $(".post-title").first().text().trim();
      const description = $("div.post-body").text().split("---")[0].trim();
      
      const cast = [];
      $("div.post-body ul li").each((i, el) => {
        cast.push($(el).text().trim());
      });

      const dl_links = [];
      $("a").each((i, el) => {
        const href = $(el).attr("href") || "";
        const text = $(el).text().trim();
        
        if (href.includes("vercel.app") && href.includes("data=")) {
          try {
            const urlObj = new URL(href);
            const encodedData = urlObj.searchParams.get("data");
            if (encodedData) {
              const decoded = JSON.parse(Buffer.from(encodedData, 'base64').toString());
              dl_links.push({
                quality: text,
                direct_link: decoded.u,
                original_redirect: href
              });
            }
          } catch (e) {
            dl_links.push({ quality: text, link: href });
          }
        }
      });

      return res.json({
        status: true,
        data: {
          title,
          description: description.substring(0, 300) + "...",
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
