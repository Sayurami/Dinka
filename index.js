import axios from "axios";

export default async function handler(req, res) {
  try {
    const { action, query, url } = req.query;

    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36"
    };

    if (!action) return res.status(400).json({ status: false, message: "action missing" });

    // ---------------- සෙවුම් කොටස (SEARCH හරහා JSON FEED) ----------------
    if (action === "search") {
      if (!query) return res.status(400).json({ status: false, message: "query missing" });

      // Blogspot වල සර්ච් එකට තියෙන හොඳම ක්‍රමය මේකයි
      const feedUrl = `https://dinkamovieslk.blogspot.com/feeds/posts/default?q=${encodeURIComponent(query)}&alt=json&max-results=10`;
      
      const { data } = await axios.get(feedUrl, { headers });
      const entries = data.feed.entry || [];

      const movies = entries.map(entry => {
        const title = entry.title.$t;
        const link = entry.link.find(l => l.rel === "alternate").href;
        
        // පින්තූරය ගැනීම
        let image = "";
        if (entry.media$thumbnail) {
          image = entry.media$thumbnail.url.replace(/\/s72\-c/, "/s1600"); // High Quality
        } else if (entry.content && entry.content.$t) {
          const imgMatch = entry.content.$t.match(/src="([^"]+)"/);
          image = imgMatch ? imgMatch[1] : "";
        }

        return { title, link, image };
      });

      return res.json({ 
        status: true, 
        results: movies.length, 
        data: movies 
      });
    }

    // ---------------- විස්තර ගැනීම (MOVIE DETAILS) ----------------
    if (action === "movie") {
      if (!url) return res.status(400).json({ status: false, message: "url missing" });

      const { data: html } = await axios.get(url, { headers });
      
      // Cheerio පාවිච්චි කරලා Download links විතරක් ගමු
      const cheerio = await import("cheerio");
      const $ = cheerio.load(html);

      const title = $(".post-title").text().trim() || $("h1").text().trim();
      const dl_links = [];

      $("a").each((i, el) => {
        const href = $(el).attr("href") || "";
        const text = $(el).text().trim();
        
        if (href.includes("vercel.app") && href.includes("data=")) {
          try {
            const encodedData = new URL(href).searchParams.get("data");
            const decoded = JSON.parse(Buffer.from(encodedData, 'base64').toString());
            dl_links.push({
              quality: text.replace("Download", "").trim() || "Download",
              direct_link: decoded.u
            });
          } catch (e) {}
        }
      });

      return res.json({
        status: true,
        data: { title, download_links: dl_links }
      });
    }

    return res.status(400).json({ status: false, message: "Invalid action" });

  } catch (err) {
    return res.status(500).json({ status: false, error: err.message, data: [] });
  }
}
