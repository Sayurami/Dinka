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

    // ---------------- 2. MOVIE DETAILS & DL LINKS ----------------
    if (action === "movie") {
      if (!url) return res.status(400).json({ status: false, message: "url missing" });

      const { data: html } = await axios.get(url, { headers });
      const $ = cheerio.load(html);

      const title = $(".post-title").first().text().trim() || $("h1").text().trim();
      const dl_links = [];

      // සයිට් එකේ තියෙන හැම ලින්ක් එකක්ම සෝදිසි කිරීම
      $("a").each((i, el) => {
        const href = $(el).attr("href") || "";
        const text = $(el).text().trim();
        const htmlContent = $(el).html() || "";

        // වැරදි ලින්ක් (Home page, Telegram, WhatsApp) අතහැරීම
        if (
          href === "https://dinkamovieslk.blogspot.com/" || 
          href.includes("t.me") || 
          href.includes("whatsapp.com") || 
          href.includes("facebook.com")
        ) {
          return; 
        }

        // ක්‍රමය A: Vercel Base64 ලින්ක් (අලුත් පෝස්ට් වලට)
        if (href.includes("vercel.app") && href.includes("data=")) {
          try {
            const encodedData = new URL(href).searchParams.get("data");
            const decoded = JSON.parse(Buffer.from(encodedData, 'base64').toString());
            if (decoded.u) {
              dl_links.push({ quality: text || "Download Now", direct_link: decoded.u });
            }
          } catch (e) {}
        }

        // ක්‍රමය B: 'da.gd' වැනි Short ලින්ක් (පැරණි පෝස්ට් වලට)
        else if (href.includes("da.gd")) {
          dl_links.push({ quality: "Download (" + (text || "Link") + ")", direct_link: href });
        }

        // ක්‍රමය C: "Download" පින්තූරයක් ඇතුළේ ඇති ලින්ක්
        else if (htmlContent.toLowerCase().includes("download") && href.startsWith("http")) {
            if (!dl_links.some(l => l.direct_link === href)) {
              dl_links.push({ quality: "Download Link", direct_link: href });
            }
        }
      });

      // Cast (නළු නිළියන්)
      const cast = [];
      $("div.post-body").find("li, p").each((i, el) => {
        const txt = $(el).text().trim();
        if (txt.includes(":") && txt.length < 60) cast.push(txt);
      });

      return res.json({
        status: true,
        data: {
          title,
          cast: [...new Set(cast)],
          download_links: dl_links
        }
      });
    }

  } catch (err) {
    return res.status(500).json({ status: false, error: err.message });
  }
}
