import axios from "axios";
import * as cheerio from "cheerio";

export default async function handler(req, res) {
  try {
    const { action, query, url } = req.query;
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36"
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

    // ---------------- 2. MOVIE DETAILS & DOWNLOAD LINKS ----------------
    if (action === "movie") {
      if (!url) return res.status(400).json({ status: false, message: "url missing" });

      const { data: html } = await axios.get(url, { headers });
      const $ = cheerio.load(html);

      const title = $(".post-title").first().text().trim() || $("h1").text().trim();
      
      const dl_links = [];

      // සයිට් එකේ තියෙන සියලුම ලින්ක්ස් (<a> tags) එකින් එක පරීක්ෂා කිරීම
      $("a").each((i, el) => {
        const href = $(el).attr("href") || "";
        const text = $(el).text().trim().toLowerCase();
        const imgInside = $(el).find("img").length > 0; // ලින්ක් එක ඇතුළේ පින්තූරයක් තිබේද?

        // 1. Vercel Encoded ලින්ක් එකක් නම් (බොහෝ අලුත් ෆිල්ම් වල මේක තියෙන්නේ)
        if (href.includes("data=") && href.includes("vercel.app")) {
          try {
            const urlObj = new URL(href);
            const encodedData = urlObj.searchParams.get("data");
            const decoded = JSON.parse(Buffer.from(encodedData, 'base64').toString());
            
            if (decoded.u) {
              dl_links.push({
                quality: $(el).text().trim() || "Download Now",
                direct_link: decoded.u
              });
            }
          } catch (e) {}
        }
        
        // 2. Encoded නැති සාමාන්‍ය Download ලින්ක් එකක් නම් (පැරණි ෆිල්ම් වල)
        // ටෙලිග්‍රාම්, වට්ස්ඇප් හෝ බ්ලොගර් ඉමේජ් ලින්ක් අතහරින්න (Filter labels)
        else if (
          (text.includes("download") || imgInside) && 
          href.includes("http") && 
          !href.includes("whatsapp.com") && 
          !href.includes("t.me") && 
          !href.includes("blogger.googleusercontent.com")
        ) {
          // මෙහිදී 'da.gd' වැනි ඩිරෙක්ට් ලින්ක් එකතු කරගන්න
          if (!dl_links.some(l => l.direct_link === href)) {
             dl_links.push({
               quality: $(el).text().trim() || "Download",
               direct_link: href
             });
          }
        }
      });

      // Cast (නළු නිළියන්) - මේක පෝස්ට් එකේ තියෙන විදිහ අනුව ගමු
      const cast = [];
      $("div.post-body").find("ul li, p").each((i, el) => {
        const line = $(el).text().trim();
        if (line.includes(":") || (line.length > 5 && line.length < 40 && !line.toLowerCase().includes("download"))) {
          cast.push(line);
        }
      });

      return res.json({
        status: true,
        data: {
          title,
          cast: [...new Set(cast)].slice(0, 8), // Duplicate අයින් කර මුල් 8 දෙනා ගමු
          download_links: dl_links
        }
      });
    }

  } catch (err) {
    return res.status(500).json({ status: false, error: err.message });
  }
}
