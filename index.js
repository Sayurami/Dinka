import axios from "axios";
import * as cheerio from "cheerio";

export default async function handler(req, res) {
  try {
    const { action, query, url } = req.query;

    // Browser එකකින් යනවා වගේ පෙන්වීමට Headers එකතු කිරීම
    const axiosConfig = {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9"
      }
    };

    if (!action) return res.status(400).json({ status: false, message: "action missing" });

    // ---------------- SEARCH ----------------
    if (action === "search") {
      if (!query) return res.status(400).json({ status: false, message: "query missing" });

      const urlSearch = `https://dinkamovieslk.blogspot.com/search?q=${encodeURIComponent(query)}&m=1`;
      const { data } = await axios.get(urlSearch, axiosConfig);
      const $ = cheerio.load(data);

      const movies = [];

      // Blogspot හි සර්ච් රිසල්ට්ස් එන පොදු පන්ති (Classes) කිහිපයක්ම පරීක්ෂා කිරීම
      $(".post-outer, article, .date-outer").each((i, el) => {
        const titleEl = $(el).find(".post-title a, h3 a, h2 a");
        const title = titleEl.text().trim();
        const link = titleEl.attr("href");
        
        // පින්තූරය ලබාගැනීම
        let image = $(el).find("img").attr("src") || "";
        
        // පින්තූරයේ size එක වැඩි කිරීම (Blogspot default කුඩා පින්තූර වෙනුවට)
        if (image.includes("s72-c") || image.includes("w72-h72-p-k-no-nu")) {
            image = image.replace(/s72-c|w72-h72-p-k-no-nu/, "s1600");
        }

        if (title && link) {
          movies.push({ title, link, image });
        }
      });

      return res.json({ 
        status: true, 
        results: movies.length, 
        data: movies 
      });
    }

    // ---------------- MOVIE DETAILS ----------------
    if (action === "movie") {
      if (!url) return res.status(400).json({ status: false, message: "url missing" });

      const { data } = await axios.get(url, axiosConfig);
      const $ = cheerio.load(data);

      const title = $(".post-title").first().text().trim() || $("h1").text().trim();
      const cast = [];
      
      // නළු නිළියන් ලැයිස්තුව
      $("div.post-body ul li").each((i, el) => {
        cast.push($(el).text().trim());
      });

      const dl_links = [];
      $("a").each((i, el) => {
        const href = $(el).attr("href") || "";
        const text = $(el).text().trim();
        
        if (href.includes("vercel.app") && href.includes("data=")) {
          try {
            const encodedData = new URL(href).searchParams.get("data");
            const decoded = JSON.parse(Buffer.from(encodedData, 'base64').toString());
            dl_links.push({
              quality: text || "Download",
              direct_link: decoded.u,
              original: href
            });
          } catch (e) {
            dl_links.push({ quality: text, link: href });
          }
        }
      });

      return res.json({
        status: true,
        data: { title, cast, download_links: dl_links }
      });
    }

    return res.status(400).json({ status: false, message: "Invalid action" });

  } catch (err) {
    return res.status(500).json({ status: false, error: err.message });
  }
}
