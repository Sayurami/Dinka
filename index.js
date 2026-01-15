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

    // ---------------- 2. MOVIE DETAILS & DL LINKS ----------------
    if (action === "movie") {
      if (!url) return res.status(400).json({ status: false, message: "url missing" });

      const { data: html } = await axios.get(url, { headers });
      const $ = cheerio.load(html);
      const postContent = $("div.post-body").html() || ""; // මුළු පෝස්ට් එකේම HTML එක

      const title = $(".post-title").first().text().trim() || $("h1").text().trim();
      const dl_links = [];

      // ලින්ක්ස් සෙවීමේ ප්‍රධාන ලොජික් එක
      // 1. Regex එකක් මගින් HTML එක ඇතුළේ තියෙන සියලුම da.gd ලින්ක්ස් සොයා ගැනීම
      const shortLinkRegex = /https:\/\/da\.gd\/[a-zA-Z0-9]+/g;
      const shortLinks = postContent.match(shortLinkRegex) || [];
      
      shortLinks.forEach(link => {
        if (!dl_links.some(l => l.direct_link === link)) {
          dl_links.push({ quality: "Direct Download", direct_link: link });
        }
      });

      // 2. Vercel Encoded ලින්ක්ස් පරීක්ෂාව
      $("a").each((i, el) => {
        const href = $(el).attr("href") || "";
        if (href.includes("vercel.app") && href.includes("data=")) {
          try {
            const encodedData = new URL(href).searchParams.get("data");
            const decoded = JSON.parse(Buffer.from(encodedData, 'base64').toString());
            if (decoded.u && !dl_links.some(l => l.direct_link === decoded.u)) {
              dl_links.push({ quality: "Encoded Download", direct_link: decoded.u });
            }
          } catch (e) {}
        }
      });

      // 3. Cast (නළු නිළියන්) - ටිකක් වෙනස් විදිහකට සෙවීම
      const cast = [];
      $(".post-body").find("li, p, div").each((i, el) => {
        const txt = $(el).text().trim();
        // නමක් සහ චරිතයක් තියෙන පේළි අහුලගමු
        if ((txt.includes(":") || txt.includes("-")) && txt.length < 50 && txt.length > 5) {
          if(!txt.toLowerCase().includes("download") && !txt.toLowerCase().includes("upload")) {
             cast.push(txt);
          }
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
