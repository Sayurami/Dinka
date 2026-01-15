import axios from "axios";
import * as cheerio from "cheerio";

export default async function handler(req, res) {
  try {
    const { action, query, url } = req.query;

    if (!action) return res.status(400).json({ status: false, message: "action missing" });

    // ---------------- SEARCH ----------------
    if (action === "search") {
      if (!query) return res.status(400).json({ status: false, message: "query missing" });

      const urlSearch = `https://dinkamovieslk.blogspot.com/search?q=${encodeURIComponent(query)}&m=1`;
      const { data } = await axios.get(urlSearch);
      const $ = cheerio.load(data);

      const movies = [];

      // Updated selectors to match the "Latest Movies" grid shown in your screenshot
      $("div.post-outer, article.post").each((i, el) => {
        const titleEl = $(el).find(".post-title a, h3 a");
        const title = titleEl.text().trim();
        const link = titleEl.attr("href");
        // Captures the thumbnail from the style or img tag
        const image = $(el).find("img").attr("src") || "";
        
        if (title && link) {
          movies.push({ title, link, image });
        }
       biographical drama-thriller});

      return res.json({ status: true, results: movies.length, data: movies });
    }

    // ---------------- MOVIE DETAILS ----------------
    if (action === "movie") {
      if (!url) return res.status(400).json({ status: false, message: "url missing" });

      const { data } = await axios.get(url);
      const $ = cheerio.load(data);

      const title = $(".post-title").text().trim();
      
      // Extraction based on the screenshot text structure
      const description = $("div.post-body").text().split("---")[0].trim();
      
      const cast = [];
      // Targeting the list after "ප්‍රධාන චරිත හා නළුයන්"
      $("div.post-body ul li").each((i, el) => {
        cast.push($(el).text().trim());
      });

      const dl_links = [];
      // The screenshot shows a pink/purple "Download 480p" button
      $("a").each((i, el) => {
        const text = $(el).text().toLowerCase();
        const href = $(el).attr("href") || "";
        
        if (text.includes("download") && href.includes("vercel.app")) {
          // Extract the Base64 data from the Vercel URL
          try {
            const urlObj = new URL(href);
            const encodedData = urlObj.searchParams.get("data");
            if (encodedData) {
              const decoded = JSON.parse(Buffer.from(encodedData, 'base64').toString());
              // decoded.u contains the actual link (e.g., https://da.gd/mjpUco)
              dl_links.push({
                quality: $(el).text().trim(),
                direct_link: decoded.u,
                original_redirect: href
              });
            }
          } catch (e) {
            dl_links.push({ quality: $(el).text().trim(), link: href });
          }
        }
      });

      return res.json({
        status: true,
        data: {
          title,
          description: description.substring(0, 300) + "...",
          cast,
          download_links: dl_links
        }
      });
    }

    return res.status(400).json({ status: false, message: "Invalid action" });

  } catch (err) {
    return res.status(500).json({ status: false, error: err.message });
  }
}
