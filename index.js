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

    // ---------------- 2. MOVIE DETAILS (DEEP SCAN) ----------------
    if (action === "movie") {
      if (!url) return res.status(400).json({ status: false, message: "url missing" });

      const { data: html } = await axios.get(url, { headers });
      const $ = cheerio.load(html);
      const fullPageSource = $.html(); // මුළු වෙබ් පිටුවේම source එක

      const title = $(".post-title").first().text().trim() || $("h1").text().trim();
      const dl_links = [];

      // මූලිකවම Vercel ලින්ක් එකක් ඇතුළේ තියෙන දත්ත Decode කිරීමේ Logic එක
      const decodeVercelData = (link) => {
        try {
          const cleanUrl = link.replace(/&amp;/g, '&');
          const urlObj = new URL(cleanUrl);
          const encodedData = urlObj.searchParams.get("data");
          if (encodedData) {
            const decoded = JSON.parse(Buffer.from(encodedData, 'base64').toString());
            return {
              quality: decoded.t ? decoded.t.split('|')[0].trim() : "Download",
              direct_link: decoded.u,
              type: decoded.y || "direct"
            };
          }
        } catch (e) { return null; }
      };

      // ක්‍රමය 1: මුළු HTML එකේම ඇති Vercel ලින්ක්ස් Regex මගින් සෙවීම
      const vercelRegex = /https:\/\/dinkamovieslk-dl\.vercel\.app\/\?data=[a-zA-Z0-9%=\-_.]+/g;
      const allMatches = fullPageSource.match(vercelRegex) || [];
      
      allMatches.forEach(match => {
        const decodedResult = decodeVercelData(match);
        if (decodedResult && !dl_links.some(l => l.direct_link === decodedResult.direct_link)) {
          dl_links.push(decodedResult);
        }
      });

      // ක්‍රමය 2: da.gd ලින්ක්ස් ඇත්නම් ඒවාත් සොයා ගැනීම
      const dagdRegex = /https:\/\/da\.gd\/[a-zA-Z0-9]+/g;
      const dagdMatches = fullPageSource.match(dagdRegex) || [];
      dagdMatches.forEach(link => {
        if (!dl_links.some(l => l.direct_link === link)) {
          dl_links.push({ quality: "Download", direct_link: link });
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
