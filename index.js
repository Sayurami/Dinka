import axios from "axios";
import cheerio from "cheerio";

export default async function handler(req, res) {
  try {
    const { action, query, url, category } = req.query;

    // ---------------- HOME / MENU ----------------
    if (action === "home") {
      const { data } = await axios.get("https://dinkamovieslk.blogspot.com/?m=1");
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

    // ---------------- SEARCH ----------------
    if (action === "search") {
      if (!query) return res.json({ status: false, message: "Query missing" });

      const urlSearch = `https://dinkamovieslk.blogspot.com/search?q=${encodeURIComponent(query)}&m=1`;
      const { data } = await axios.get(urlSearch);
      const $ = cheerio.load(data);

      const movies = [];
      $("div.blog-posts div.post-outer").each((i, el) => {
        const title = $(el).find("h3.post-title a").text().trim();
        const link = $(el).find("h3.post-title a").attr("href");
        const image = $(el).find("div.post-body img").attr("src");
        const date = $(el).find("h2.date-header span").text().trim();
        if (title && link) movies.push({ title, link, image, date });
      });

      return res.json({ status: true, data: movies });
    }

    // ---------------- CATEGORY ----------------
    if (action === "category") {
      if (!category) return res.json({ status: false, message: "Category missing" });

      const urlCat = `https://dinkamovieslk.blogspot.com/search/label/${encodeURIComponent(category)}?m=1`;
      const { data } = await axios.get(urlCat);
      const $ = cheerio.load(data);

      const movies = [];
      $("div.blog-posts div.post-outer").each((i, el) => {
        const title = $(el).find("h3.post-title a").text().trim();
        const link = $(el).find("h3.post-title a").attr("href");
        const image = $(el).find("div.post-body img").attr("src");
        const date = $(el).find("h2.date-header span").text().trim();
        if (title && link) movies.push({ title, link, image, date });
      });

      return res.json({ status: true, data: movies });
    }

    // ---------------- MOVIE DETAILS ----------------
    if (action === "movie") {
      if (!url) return res.json({ status: false, message: "URL missing" });

      const { data } = await axios.get(url);
      const $ = cheerio.load(data);

      const title = $("h3.post-title a").text().trim();
      const yearMatch = title.match(/\d{4}/);
      const year = yearMatch ? yearMatch[0] : "";
      const director = $("div.post-body p:contains('අධ්‍යක්ෂක')").text().replace("අධ්‍යක්ෂක:", "").trim();
      const language = $("div.post-body p:contains('භාෂාව')").text().replace("භාෂාව:", "").trim();
      const production = $("div.post-body p:contains('සිනම production')").text().replace("සිනම production:", "").trim();
      const imdbMatch = $("div.post-body p:contains('IMDb rating')").text().match(/~?([\d.]+)/);
      const imdb = imdbMatch ? imdbMatch[1] : "";
      const description = $("div.post-body > p").first().text().trim();

      const cast = [];
      $("div.post-body p:contains('ප්‍රධාන චරිත හා නළුයන්')").nextAll("ul li").each((i, el) => {
        cast.push($(el).text().trim());
      });

      const dl_links = [];
      $("a:contains('Download')").each((i, el) => {
        dl_links.push({
          quality: $(el).text().trim(),
          link: $(el).attr("href")
        });
      });

      return res.json({
        status: true,
        data: { title, year, director, language, production, imdb, description, cast, download_links: dl_links }
      });
    }

    return res.json({ status: false, message: "Invalid action" });
  } catch (err) {
    return res.json({ status: false, error: err.message });
  }
}
