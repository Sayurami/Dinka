import axios from "axios";
import * as cheerio from "cheerio";

export default async function handler(req, res) {
  try {
    const { action, query, url } = req.query;

    const axiosConfig = {
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; SM-G960U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.5481.153 Mobile Safari/537.36",
        "Referer": "https://dinkamovieslk.blogspot.com/"
      }
    };

    if (!action) return res.status(400).json({ status: false, message: "action missing" });

    // ---------------- SEARCH ----------------
    if (action === "search") {
      if (!query) return res.status(400).json({ status: false, message: "query missing" });

      // මෙහිදී 'search?q=' වෙනුවට '/search/label/' හෝ සාමාන්‍ය සර්ච් එකම තව පාරක් පරීක්ෂා කරමු
      const urlSearch = `https://dinkamovieslk.blogspot.com/search?q=${encodeURIComponent(query)}&m=1`;
      const { data } = await axios.get(urlSearch, axiosConfig);
      const $ = cheerio.load(data);

      const movies = [];

      // Dinka Movies සයිට් එකේ අලුත්ම HTML ව්‍යුහය සඳහා Selectors
      // .post, .item-post, .post-outer යන සියල්ලම බලන්න
      $("div.post-outer, div.post, article.post, div.date-outer").each((i, el) => {
        const titleLink = $(el).find("h3 a, h2 a, .post-title a").first();
        const title = titleLink.text().trim();
        const link = titleLink.attr("href");
        
        // Thumbnail එක ගැනීම
        let image = $(el).find("img").first().attr("src") || 
                    $(el).find("script").text().match(/https:\/\/.*?\.jpg/)?.[0] || "";

        if (title && link) {
          movies.push({
            title: title,
            link: link,
            image: image.replace(/s72-c|w72-h72-p-k-no-nu/, "s1600") // High quality image
          });
        }
      });

      // සර්ච් රිසල්ට් එකේ තියෙන Duplicate අයින් කිරීම
      const uniqueMovies = Array.from(new Set(movies.map(a => a.link)))
        .map(link => movies.find(a => a.link === link));

      return res.json({ 
        status: true, 
        results: uniqueMovies.length, 
        data: uniqueMovies 
      });
    }

    // ---------------- MOVIE DETAILS (වැඩ කරන විදිහට) ----------------
    if (action === "movie") {
      if (!url) return res.status(400).json({ status: false, message: "url missing" });

      const { data } = await axios.get(url, axiosConfig);
      const $ = cheerio.load(data);

      const title = $(".post-title").text().trim() || $("h1").text().trim();
      
      const dl_links = [];
      $("a").each((i, el) => {
        const href = $(el).attr("href") || "";
        const text = $(el).text().trim();
        
        // Vercel decoding logic
        if (href.includes("vercel.app") && href.includes("data=")) {
          try {
            const encodedData = new URL(href).searchParams.get("data");
            const decoded = JSON.parse(Buffer.from(encodedData, 'base64').toString());
            dl_links.push({
              quality: text.replace("Download ", "") || "File",
              direct_link: decoded.u
            });
          } catch (e) {
            dl_links.push({ quality: text, link: href });
          }
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

    return res.status(400).json({ status: false, message: "Invalid action" });

  } catch (err) {
    return res.status(500).json({ status: false, error: err.message });
  }
}
