import axios from "axios";
import * as cheerio from "cheerio"; // ✅ Fixed import

export default async function handler(req, res) {
  try {
    const { action, query, url, category } = req.query;

    if (!action) return res.status(400).json({ status: false, message: "action missing" });

    // ---------- HOME ----------
    if (action === "home") {
      const { data } = await axios.get("https://dinkamovieslk.blogspot.com/?m=1", { timeout: 5000 });
      const $ = cheerio.load(data);

      const menu = [];
      $("a").each((i, el) => {
        const text = $(el).text().trim();
        const link = $(el).attr("href");
        if (text && link && !link.startsWith("#")) menu.push({ text, link });
      });

      const categories = [];
      $("div.widget-content ul li a").each((i, el) => {
        const text = $(el).text().trim();
        const link = $(el).attr("href");
        if (text && link) categories.push({ text, link });
      });

      return res.json({ status: true, menu, categories });
    }

    // ---------- SEARCH ----------
    if (action === "search") {
      if (!query) return res.status(400).json({ status: false, message: "query missing" });

      const urlSearch = `https://dinkamovieslk.blogspot.com/search?q=${encodeURIComponent(query)}&m=1`;
      const { data } = await axios.get(urlSearch, { timeout: 5000 });
      const $ = cheerio.load(data);

      const movies = [];
      $("div.blog-posts div.post-outer").each((i, el) => {
        const titleEl = $(el).find("h3.post-title a");
        const title = titleEl.length ? titleEl.text().trim() : "Unknown";
        const link = titleEl.attr("href") || "";
        const image = $(el).find("div.post-body img").attr("src") || "";
        const date = $(el).find("h2.date-header span").text().trim() || "";
        if (title && link) movies.push({ title, link, image, date });
      });

      return res.json({ status: true, data: movies });
    }

    // ---------- CATEGORY ----------
    if (action === "category") {
      if (!category) return res.status(400).json({ status: false, message: "category missing" });

      const urlCat = `https://dinkamovieslk.blogspot.com/search/label/${encodeURIComponent(category)}?m=1`;
      const { data } = await axios.get(urlCat, { timeout: 5000 });
      const $ = cheerio.load(data);

      const movies = [];
      $("div.blog-posts div.post-outer").each((i, el) => {
        const titleEl = $(el).find("h3.post-title a");
        const title = titleEl.length ? titleEl.text().trim() : "Unknown";
        const link = titleEl.attr("href") || "";
        const image = $(el).find("div.post-body img").attr("src") || "";
        const date = $(el).find("h2.date-header span").text().trim() || "";
        if (title && link) movies.push({ title, link, image, date });
      });

      return res.json({ status: true, data: movies });
    }

    // ---------- MOVIE DETAILS ----------
    if (action === "movie") {
      if (!url) return res.status(400).json({ status: false, message: "url missing" });

      const { data } = await axios.get(url, { timeout: 5000 });
      const $ = cheerio.load(data);

      const titleEl = $("h3.post-title a");
      const title = titleEl.length ? titleEl.text().trim() : "Unknown";
      const yearMatch = title.match(/\d{4}/);
      const year = yearMatch ? yearMatch[0] : "";

      const director = $("div.post-body p:contains('අධ්‍යක්ෂක')").text().replace("අධ්‍යක්ෂක:", "").trim() || "";
      const language = $("div.post-body p:contains('භාෂාව')").text().replace("භාෂාව:", "").trim() || "";
      const production = $("div.post-body p:contains('සිනම production')").text().replace("සිනම production:", "").trim() || "";
      const imdbMatch = $("div.post-body p:contains('IMDb rating')").text().match(/~?([\d.]+)/);
      const imdb = imdbMatch ? imdbMatch[1] : "";
      const description = $("div.post-body > p").first().text().trim() || "";

      const cast = [];
      $("div.post-body p:contains('ප්‍රධාන චරිත හා නළුයන්')").nextAll("ul li").each((i, el) => {
        const actor = $(el).text().trim();
        if (actor) cast.push(actor);
      });

      const dl_links = [];
      $("a:contains('Download')").each((i, el) => {
        const quality = $(el).text().trim() || "";
        const linkAttr = $(el).attr("href") || "";
        if (linkAttr) dl_links.push({ quality, link: linkAttr });
      });

      return res.json({
        status: true,
        data: { title, year, director, language, production, imdb, description, cast, download_links: dl_links }
      });
    }

    return res.status(400).json({ status: false, message: "Invalid action" });

  } catch (err) {
    return res.status(500).json({ status: false, error: err.message });
  }
}
