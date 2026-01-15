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

    // ---------------- 2. MOVIE DETAILS (SUPER SCRAPE) ----------------
    if (action === "movie") {
      if (!url) return res.status(400).json({ status: false, message: "url missing" });

      const { data: html } = await axios.get(url, { headers });
      const $ = cheerio.load(html);
      const fullHtml = $.html(); // මුළු පෝස්ට් එකේම source code එක
      const bodyText = $("div.post-body").text();

      const title = $(".post-title").first().text().trim() || $("h1").text().trim();
      const dl_links = [];

      // ක්‍රමය 1: Regex මගින් da.gd ලින්ක්ස් සෙවීම (Text එක ඇතුළේ තිබුණත් අහු වෙනවා)
      const dagdRegex = /https:\/\/da\.gd\/[a-zA-Z0-9]+/g;
      const dagdMatches = fullHtml.match(dagdRegex) || [];
      
      dagdMatches.forEach(link => {
        if (!dl_links.some(l => l.direct_link === link)) {
          dl_links.push({ quality: "Download Link", direct_link: link });
        }
      });

      // ක්‍රමය 2: Vercel Base64 ලින්ක්ස් සෙවීම
      const vercelRegex = /https:\/\/dinkamovieslk-dl\.vercel\.app\/\?data=[a-zA-Z0-9%=\-_]+/g;
      const vercelMatches = fullHtml.match(vercelRegex) || [];

      vercelMatches.forEach(link => {
        try {
          const urlObj = new URL(link.replace(/&amp;/g, '&'));
          const encodedData = urlObj.searchParams.get("data");
          if (encodedData) {
            const decoded = JSON.parse(Buffer.from(encodedData, 'base64').toString());
            if (decoded.u && !dl_links.some(l => l.direct_link === decoded.u)) {
              dl_links.push({ quality: "Direct Download", direct_link: decoded.u });
            }
          }
        } catch (e) {}
      });

      // නළු නිළියන් සෙවීම (Cast)
      const cast = [];
      const castSection = bodyText.split("ප්‍රධාන චරිත")[1] || bodyText;
      const potentialNames = castSection.split("\n");
      
      potentialNames.forEach(name => {
        const cleanName = name.trim();
        if (cleanName.includes(":") && cleanName.length < 50) {
          cast.push(cleanName);
        }
      });

      return res.json({
        status: true,
        data: {
          title,
          cast: [...new Set(cast)].slice(0, 10),
          download_links: dl_links
        }
      });
    }

  } catch (err) {
    return res.status(500).json({ status: false, error: err.message });
  }
}
