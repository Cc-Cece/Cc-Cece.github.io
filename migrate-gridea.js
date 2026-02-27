const fs = require("fs");
const path = require("path");

const rootDir = __dirname; // 11ty-File
const grideaConfigPathLegacy = path.join(rootDir, "..", "原文件", "config", "posts.json");
const grideaConfigPath = fs.existsSync(grideaConfigPathLegacy)
  ? grideaConfigPathLegacy
  : path.join(rootDir, "..", "config", "posts.json");
const postsDir = path.join(rootDir, "src", "posts");
const dataDir = path.join(rootDir, "src", "_data");
const legacyPostsDir = path.join(rootDir, "..", "原文件", "posts");

function main() {
  if (!fs.existsSync(grideaConfigPath)) {
    console.error("找不到 Gridea 配置文件:", grideaConfigPath);
    process.exit(1);
  }

  const raw = fs.readFileSync(grideaConfigPath, "utf8");
  const cfg = JSON.parse(raw);

  if (!Array.isArray(cfg.posts)) {
    console.error("posts.json 格式不正确：缺少 posts 数组");
    process.exit(1);
  }

  fs.mkdirSync(postsDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });

  // 生成文章 markdown（基于 posts.json，用于早期文章如 about、hello-gridea）
  for (const post of cfg.posts) {
    const data = post.data || {};
    const fileName = post.fileName || (data.title || "untitled").replace(/\s+/g, "-");
    const filePath = path.join(postsDir, `${fileName}.md`);

    const tags = Array.isArray(data.tags) ? data.tags : [];

    const fmLines = [];
    const rawDate = data.date || "";
    const normalizedDate = rawDate.split(" ")[0] || rawDate;
    fmLines.push("---");
    fmLines.push(`title: ${JSON.stringify(data.title || "")}`);
    fmLines.push(`date: "${normalizedDate}"`);

    if (tags.length === 0) {
      fmLines.push("tags: []");
    } else {
      fmLines.push("tags:");
      for (const t of tags) {
        fmLines.push(`  - ${JSON.stringify(t)}`);
      }
    }

    fmLines.push(`published: ${data.published === false ? false : true}`);
    fmLines.push(`hideInList: ${data.hideInList ? true : false}`);
    fmLines.push(`feature: ${data.feature ? JSON.stringify(data.feature) : '""'}`);
    fmLines.push(`isTop: ${data.isTop ? true : false}`);
    fmLines.push(`layout: layouts/post.ejs`);
    fmLines.push(`permalink: "/post/${fileName}/"`);
    fmLines.push("---", "");

    const body = post.content || "";
    const finalContent = fmLines.join("\n") + body + "\n";

    fs.writeFileSync(filePath, finalContent, "utf8");
    console.log("生成文章:", filePath);
  }

  // 迁移 原文件/posts 中的所有 Markdown 文章
  if (fs.existsSync(legacyPostsDir)) {
    const files = fs.readdirSync(legacyPostsDir).filter((f) => f.endsWith(".md"));
    for (const file of files) {
      const srcPath = path.join(legacyPostsDir, file);
      const dstPath = path.join(postsDir, file);
      let text = fs.readFileSync(srcPath, "utf8");

      // 修正 front matter 里的 date 格式为 YYYY-MM-DD
      text = text.replace(
        /^date:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})\s+[0-9:]+/m,
        'date: "$1"'
      );

      // 如果没有 layout 字段，则追加
      if (!/^layout:/m.test(text)) {
        text = text.replace(
          /^---\s*$/m,
          "---\nlayout: layouts/post.ejs"
        );
      }

      // 如果没有 permalink 字段，则追加
      if (!/^permalink:/m.test(text)) {
        const slug = path.basename(file, ".md");
        text = text.replace(
          /^---\s*$/m,
          `---\npermalink: "/post/${slug}/"`
        );
      }

      fs.writeFileSync(dstPath, text, "utf8");
      console.log("迁移原文章:", dstPath);
    }
  }

  // 生成菜单数据，供 header/footer 使用（优先使用当前 cfg 中的 menus）
  const menus = Array.isArray(cfg.menus) ? cfg.menus : [];
  const menusPath = path.join(dataDir, "menus.json");
  fs.writeFileSync(menusPath, JSON.stringify(menus, null, 2), "utf8");
  console.log("生成菜单数据:", menusPath);
}

main();

