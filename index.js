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
      const { data } = await axios.get(urlSearch, { timeout: 5000 });
      const $ = cheerio.load(data);

      const movies = [];
      $("article, div.post-outer").each((i, el) => {
        const titleEl = $(el).find("h3.post-title a");
        const title = titleEl.text().trim();
        const link = titleEl.attr("href") || "";
        const image = $(el).find("img").attr("src") || "";
        const date = $(el).find("h2.date-header span").text().trim() || "";
        if (title && link) movies.push({ title, link, image, date });
      });

      return res.json({ status: true, data: movies });
    }

    // ---------------- MOVIE DETAILS ----------------
    if (action === "movie") {
      if (!url) return res.status(400).json({ status: false, message: "url missing" });

      const { data } = await axios.get(url, { timeout: 5000 });
      const $ = cheerio.load(data);

      const title = $("h3.post-title a").text().trim() || "Unknown";
      const yearMatch = title.match(/\d{4}/);
      const year = yearMatch ? yearMatch[0] : "";
      const description = $("div.post-body > p").first().text().trim() || "";

      // Cast extraction
      const cast = [];
      $("p:contains('ප්‍රධාන චරිත හා නළුයන්')").nextAll("ul li").each((i, el) => {
        const actor = $(el).text().trim();
        if (actor) cast.push(actor);
      });

      // Download links extraction
      const dl_links = [];
      $("a:contains('Download')").each((i, el) => {
        const quality = $(el).text().trim() || "";
        const linkAttr = $(el).attr("href") || "";
        if (linkAttr) dl_links.push({ quality, link: linkAttr });
      });

      return res.json({
        status: true,
        data: { title, year, description, cast, download_links: dl_links }
      });
    }

    return res.status(400).json({ status: false, message: "Invalid action" });

  } catch (err) {
    return res.status(500).json({ status: false, error: err.message });
  }
}
