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

    // ---------------- 2. MOVIE DETAILS (FULL SUPPORT) ----------------
    if (action === "movie") {
      if (!url) return res.status(400).json({ status: false, message: "url missing" });

      const { data: html } = await axios.get(url, { headers });
      const $ = cheerio.load(html);
      const fullPageSource = $.html(); 

      const title = $(".post-title").first().text().trim() || $("h1").text().trim();
      const dl_links = [];

      // Vercel ලින්ක් එක ඇතුළේ තියෙන ඕනෑම Google Drive ලින්ක් එකක් හඳුනාගෙන 
      // එය Direct Download Link එකක් බවට පත් කරන Logic එක
      const extractAndFixLink = (rawUrl) => {
        let finalLink = rawUrl;
        
        // Google Drive "uc?id=" ලින්ක් එකක් නම් එය Direct Download එකක් කරන්න
        if (rawUrl.includes("drive.google.com/uc?id=")) {
          const fileId = rawUrl.split("id=")[1].split("&")[0];
          finalLink = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0`;
        }
        // සාමාන්‍ය Drive "file/d/" ලින්ක් එකක් නම්
        else if (rawUrl.includes("drive.google.com/file/d/")) {
          const fileId = rawUrl.split("/d/")[1].split("/")[0];
          finalLink = `https://drive.usercontent.com/download?id=${fileId}&export=download&authuser=0`;
        }
        return finalLink;
      };

      // ක්‍රමය 1: Vercel Base64 Decode (ඔයා එවපු ලින්ක් එක මේකට අහුවෙනවා)
      const vercelRegex = /https:\/\/dinkamovieslk-dl\.vercel\.app\/\?data=[a-zA-Z0-9%=\-_.]+/g;
      const vercelMatches = fullPageSource.match(vercelRegex) || [];

      vercelMatches.forEach(match => {
        try {
          const cleanUrl = match.replace(/&amp;/g, '&');
          const encodedData = new URL(cleanUrl).searchParams.get("data");
          if (encodedData) {
            const decoded = JSON.parse(Buffer.from(encodedData, 'base64').toString());
            if (decoded.u) {
              dl_links.push({
                quality: decoded.t ? decoded.t.split('|')[0].trim() : "Direct Download",
                direct_link: extractAndFixLink(decoded.u),
                original_url: decoded.u
              });
            }
          }
        } catch (e) {}
      });

      // ක්‍රමය 2: da.gd සහ අනෙකුත් ලින්ක්ස්
      const dagdRegex = /https:\/\/da\.gd\/[a-zA-Z0-9]+/g;
      const dagdMatches = fullPageSource.match(dagdRegex) || [];
      dagdMatches.forEach(link => {
        if (!dl_links.some(l => l.direct_link === link)) {
          dl_links.push({ quality: "Download (Short)", direct_link: link });
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
