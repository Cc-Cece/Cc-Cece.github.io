const fs = require("fs");
const path = require("path");
const markdownIt = require("markdown-it");
const markdownItAnchor = require("markdown-it-anchor");
const markdownItToc = require("markdown-it-toc-done-right");
const markdownItKatex = require("markdown-it-katex");
const markdownItFootnote = require("markdown-it-footnote");
const { minify } = require("html-minifier-terser");
const Image = require("@11ty/eleventy-img");
const { parse } = require("node-html-parser");
const { execFileSync } = require("child_process");

module.exports = function (eleventyConfig) {
  const pathPrefix = process.env.PATH_PREFIX || "/";
  const isProduction = (process.env.ELEVENTY_ENV || process.env.NODE_ENV) === "production";
  const basePath = (pathPrefix && pathPrefix !== "/")
    ? (pathPrefix.endsWith("/") ? pathPrefix.slice(0, -1) : pathPrefix)
    : "";

  function shouldIncludePostInLists(post) {
    // hideInList: 永远从列表/归档/标签/Feed/Sitemap 等集合里隐藏，但仍允许生成单页
    if (post.data.hideInList === true) return false;

    // draft / published: 仅生产环境过滤
    if (!isProduction) return true;
    if (post.data.draft === true) return false;
    if (post.data.published === false) return false;
    return true;
  }

  function withPathPrefix(urlPath) {
    if (!urlPath) return urlPath;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(urlPath) || urlPath.startsWith("//")) return urlPath;
    if (pathPrefix === "/" || !pathPrefix) return urlPath;
    const prefix = pathPrefix.endsWith("/") ? pathPrefix.slice(0, -1) : pathPrefix;
    const suffix = urlPath.startsWith("/") ? urlPath : `/${urlPath}`;
    return `${prefix}${suffix}`;
  }

  function absUrl(urlPath, base) {
    const b = (base || "").replace(/\/$/, "");
    if (!b) return withPathPrefix(urlPath);
    return `${b}${withPathPrefix(urlPath)}`;
  }

  eleventyConfig.addGlobalData("pathPrefix", pathPrefix);
  eleventyConfig.addGlobalData("isProduction", isProduction);
  eleventyConfig.addGlobalData("basePath", basePath);

  // 静态资源直接拷贝
  // eleventyConfig.setServerPassthroughCopy(true);
  eleventyConfig.addPassthroughCopy({ "src/static": "static" });
  eleventyConfig.addPassthroughCopy({ "src/images": "images" });
  eleventyConfig.addPassthroughCopy({ "src/post-images": "post-images" });
  eleventyConfig.addPassthroughCopy({ "src/styles": "styles" });
  eleventyConfig.addPassthroughCopy({ "src/favicon.ico": "favicon.ico" });
  eleventyConfig.addPassthroughCopy({ "src/CNAME": "CNAME" });
  eleventyConfig.addPassthroughCopy({ "node_modules/@pagefind/default-ui/dist": "pagefind-ui" });

  // Markdown & TOC
  const md = markdownIt({
    html: true,
    breaks: false,
    linkify: true
  })
    .use(markdownItKatex)
    .use(markdownItFootnote)
    .use(markdownItAnchor, {
      permalink: markdownItAnchor.permalink.linkInsideHeader({
        symbol: "",
        placement: "before"
      })
    })
    .use(markdownItToc, {
      listType: "ul"
    });

  eleventyConfig.setLibrary("md", md);

  // 从文章原始内容提取 <!-- more --> 前的摘要
  function extractAbstract(rawInput) {
    // rawInput 包含 front matter，需去掉
    const body = rawInput.replace(/^---[\s\S]*?---\s*/m, "");
    const parts = body.split(/<!--\s*more\s*-->/i);
    if (parts.length > 1) {
      return md.render(parts[0].trim());
    }
    return "";
  }

  // 计算阅读时间（中英文混合，约 400 字/分钟）
  function calcReadingTime(content) {
    const text = (content || "").replace(/<[^>]+>/g, "");
    const minutes = Math.max(1, Math.round(text.length / 400));
    return `${minutes} min read`;
  }

  // 文章集合（按日期倒序，过滤未发布，注入摘要和阅读时间）
  eleventyConfig.addCollection("posts", function (collectionApi) {
    return collectionApi.getFilteredByGlob("src/posts/*.md")
      .filter(shouldIncludePostInLists)
      .sort((a, b) => {
        const aTop = a.data.isTop === true ? 1 : 0;
        const bTop = b.data.isTop === true ? 1 : 0;
        if (aTop !== bTop) return bTop - aTop;
        return b.date - a.date;
      })
      .map(post => {
        const raw = fs.readFileSync(post.inputPath, "utf8");
        const body = raw.replace(/^---[\s\S]*?---\n/, "");
        post.data.abstract = extractAbstract(raw);
        post.data.readingTime = calcReadingTime(body);
        return post;
      });
  });

  // 仅按时间排序的文章集合：用于上一篇/下一篇、Feed、Sitemap（不受置顶影响）
  eleventyConfig.addCollection("postsChrono", function (collectionApi) {
    return collectionApi.getFilteredByGlob("src/posts/*.md")
      .filter(shouldIncludePostInLists)
      .sort((a, b) => b.date - a.date);
  });

  eleventyConfig.addGlobalData("draftsEnabled", !isProduction);

  // 标签集合：[{ name, posts }]，用于分页生成标签单页
  eleventyConfig.addCollection("tagList", function (collectionApi) {
    const tagMap = {};
    collectionApi.getFilteredByGlob("src/posts/*.md")
      .filter(shouldIncludePostInLists)
      .forEach(post => {
        (post.data.tags || []).forEach(tag => {
          if (!tagMap[tag]) tagMap[tag] = [];
          tagMap[tag].push(post);
        });
      });
    return Object.entries(tagMap)
      .map(([name, posts]) => ({
        name,
        posts: posts.sort((a, b) => {
          const aTop = a.data.isTop === true ? 1 : 0;
          const bTop = b.data.isTop === true ? 1 : 0;
          if (aTop !== bTop) return bTop - aTop;
          return b.date - a.date;
        })
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  // 阅读时间过滤器（EJS 中以函数形式调用）
  eleventyConfig.addFilter("readingTime", calcReadingTime);

  // 日期格式化过滤器
  eleventyConfig.addFilter("dateFormat", function (date) {
    if (!date) return "";
    const d = date instanceof Date ? date : new Date(date);
    return d.toISOString().slice(0, 10);
  });

  eleventyConfig.addTransform("htmlmin", async function (content, outputPath) {
    if (!isProduction) return content;
    if (!outputPath || !outputPath.endsWith(".html")) return content;

    return await minify(content, {
      collapseWhitespace: true,
      conservativeCollapse: true,
      removeComments: true,
      minifyCSS: true,
      minifyJS: true,
      useShortDoctype: true,
      keepClosingSlash: true,
      removeRedundantAttributes: true,
      removeEmptyAttributes: true
    });
  });

  eleventyConfig.addTransform("responsiveImages", async function (content, outputPath) {
    if (!outputPath || !outputPath.endsWith(".html")) return content;

    const root = parse(content);
    const imgs = root.querySelectorAll("img");
    if (!imgs.length) return content;

    for (const img of imgs) {
      const src = img.getAttribute("src") || "";
      if (!src) continue;
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(src) || src.startsWith("//")) continue;
      if (src.startsWith("data:")) continue;
      if (!src.startsWith("/images/") && !src.startsWith("/post-images/")) continue;

      const inputPath = path.join(__dirname, "src", src.replace(/^\//, ""));
      if (!fs.existsSync(inputPath)) continue;

      const alt = img.getAttribute("alt") || "";
      const className = img.getAttribute("class") || undefined;
      const sizes = img.getAttribute("sizes") || "(min-width: 800px) 800px, 100vw";

      const ext = path.extname(inputPath).toLowerCase();
      const fallbackFormat = ext === ".png" ? "png" : "jpeg";
      const formats = ["avif", "webp", fallbackFormat];

      const metadata = await Image(inputPath, {
        widths: [320, 640, 960, 1280, 1600],
        formats,
        outputDir: path.join(__dirname, "_site", "img"),
        urlPath: withPathPrefix("/img/"),
        filenameFormat: function (id, srcPath, width, format) {
          const name = path.parse(srcPath).name;
          const dir = path.basename(path.dirname(srcPath));
          return `${dir}-${name}-${width}w.${format}`;
        }
      });

      const html = Image.generateHTML(metadata, {
        alt,
        sizes,
        loading: img.getAttribute("loading") || "lazy",
        decoding: img.getAttribute("decoding") || "async",
        class: className
      });

      img.replaceWith(html);
    }

    return root.toString();
  });

  eleventyConfig.on("afterBuild", () => {
    const siteDir = path.join(__dirname, "_site");
    const bin = path.join(
      __dirname,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "pagefind.cmd" : "pagefind"
    );
    try {
      if (process.platform === "win32") {
        execFileSync(bin, ["--site", siteDir], { stdio: "inherit", shell: true });
      } else {
        execFileSync(bin, ["--site", siteDir], { stdio: "inherit" });
      }
    } catch (e) {
      console.error("Pagefind indexing failed:", e.message);
    }
  });

  return {
    templateFormats: ["md", "ejs"],
    dir: {
      input: "src",
      includes: "_includes",
      data: "_data",
      output: "_site"
    },
    markdownTemplateEngine: "ejs",
    htmlTemplateEngine: "ejs",
    dataTemplateEngine: "js",
    pathPrefix
  };
};
