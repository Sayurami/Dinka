import axios from "axios";
import * as cheerio from "cheerio";

export default async function handler(req, res) {
  try {
    const { action, query, url } = req.query;
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36"
    };

    if (!action) return res.status(400).json({ status: false, message: "action missing" });

    // ---------------- MOVIE DETAILS & DOWNLOAD LINKS ----------------
    if (action === "movie") {
      if (!url) return res.status(400).json({ status: false, message: "url missing" });

      const { data: html } = await axios.get(url, { headers });
      const $ = cheerio.load(html);

      const title = $(".post-title").first().text().trim() || $("h1").text().trim();
      const dl_links = [];

      // සයිට් එකේ තියෙන සියලුම ලින්ක්ස් පරීක්ෂා කිරීම
      $("a").each((i, el) => {
        const href = $(el).attr("href") || "";
        const text = $(el).text().trim();
        
        // Vercel decoding logic - මේක තමයි රහස් ලින්ක් එක ගලවන්නේ
        if (href.includes("vercel.app") && href.includes("data=")) {
          try {
            const urlObj = new URL(href);
            const encodedData = urlObj.searchParams.get("data");
            
            if (encodedData) {
              const decoded = JSON.parse(Buffer.from(encodedData, 'base64').toString());
              
              dl_links.push({
                quality: text || "Download Now",
                direct_link: decoded.u, // මෙතන තමයි da.gd ලින්ක් එක එන්නේ
                source: "Direct"
              });
            }
          } catch (e) {
            // Decode කරන්න බැරි වුණොත් සාමාන්‍ය ලින්ක් එක දෙනවා
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

    // (Search කොටස කලින් දීපු විදිහටම මෙතනට දාගන්න)
    
  } catch (err) {
    return res.status(500).json({ status: false, error: err.message });
  }
}
