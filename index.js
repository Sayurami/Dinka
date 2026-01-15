import axios from "axios";

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

    // ---------------- 2. MOVIE DETAILS (DEEP SOURCE SCAN) ----------------
    if (action === "movie") {
      if (!url) return res.status(400).json({ status: false, message: "url missing" });

      const { data: htmlSource } = await axios.get(url, { headers });
      const dl_links = [];

      // Regex 1: Vercel Encoded ලින්ක් එක සොයා ගැනීම (මේක තමයි Avengers ලින්ක් එක අල්ලන්නේ)
      const vercelRegex = /https:\/\/dinkamovieslk-dl\.vercel\.app\/\?data=[a-zA-Z0-9%=\-_.]+/g;
      const vercelMatches = htmlSource.match(vercelRegex) || [];

      vercelMatches.forEach(match => {
        try {
          const cleanUrl = match.replace(/&amp;/g, '&');
          const encodedData = new URL(cleanUrl).searchParams.get("data");
          if (encodedData) {
            const decoded = JSON.parse(Buffer.from(encodedData, 'base64').toString());
            if (decoded.u) {
              let finalLink = decoded.u;
              // Google Drive ලින්ක් එකක් නම් එය Direct Download ලින්ක් එකක් බවට පත් කිරීම
              if (finalLink.includes("drive.google.com")) {
                const fileId = finalLink.match(/[-\w]{25,}/);
                if (fileId) {
                  finalLink = `https://drive.usercontent.google.com/download?id=${fileId[0]}&export=download&authuser=0`;
                }
              }
              
              if (!dl_links.some(l => l.direct_link === finalLink)) {
                dl_links.push({
                  quality: decoded.t ? decoded.t.split('|')[0].trim() : "Direct Download",
                  direct_link: finalLink
                });
              }
            }
          }
        } catch (e) {}
      });

      // Regex 2: da.gd ලින්ක්ස් තිබේ නම් ඒවා සොයා ගැනීම
      const dagdRegex = /https:\/\/da\.gd\/[a-zA-Z0-9]+/g;
      const dagdMatches = htmlSource.match(dagdRegex) || [];
      dagdMatches.forEach(link => {
        if (!dl_links.some(l => l.direct_link === link)) {
          dl_links.push({ quality: "Download (Short)", direct_link: link });
        }
      });

      // Title එක ගැනීම (Regex මගින්)
      const titleMatch = htmlSource.match(/<title>(.*?)<\/title>/);
      const title = titleMatch ? titleMatch[1].split("|")[0].trim() : "Movie Details";

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
