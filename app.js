const listElement = document.querySelector("#news-list");
const countElement = document.querySelector("#article-count");
const todayElement = document.querySelector("#today");
const resultsSummaryElement = document.querySelector("#results-summary");
const sourceFilter = document.querySelector("#source-filter");
const timeFilter = document.querySelector("#time-filter");
const resetFiltersButton = document.querySelector("#reset-filters");
const generateDailyReportButton = document.querySelector(
  "#generate-daily-report",
);

let allArticles = [];

const knownSources = [
  "中国农业大学",
  "西北农林科技大学",
  "南京农业大学",
  "华中农业大学",
  "北京林业大学",
  "四川农业大学",
  "东北林业大学",
  "东北农业大学",
  "南京林业大学",
  "华南农业大学",
  "山东农业大学",
  "福建农林大学",
  "湖南农业大学",
  "中南林业科技大学",
  "河北农业大学",
  "沈阳农业大学",
  "河南农业大学",
  "山西农业大学",
  "江西农业大学",
  "内蒙古农业大学",
  "云南农业大学",
  "西南林业大学",
  "甘肃农业大学",
  "新疆农业大学",
  "浙江农林大学",
  "黑龙江八一农垦大学",
  "吉林农业大学",
  "北京农学院",
  "天津农学院",
  "仲恺农业工程学院",
  "北京大学现代农学院",
  "浙江大学",
  "上海交通大学",
  "西南大学",
  "广西大学",
  "海南大学",
  "石河子大学",
  "扬州大学",
];

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const now = new Date();
todayElement.dateTime = now.toISOString();
todayElement.textContent = dateFormatter.format(now);

function formatPublishTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeSourceName(source) {
  const universityName = String(source || "").match(/^(.+?大学)/);
  return universityName ? universityName[1] : source || "其他来源";
}

async function fetchNewsData() {
  const response = await fetch("data.json", { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const articles = await response.json();

  if (!Array.isArray(articles)) {
    throw new TypeError("data.json 的根节点必须是数组");
  }

  return articles;
}

function addFilterOptions(selectElement, values) {
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    selectElement.append(option);
  });
}

function initializeFilters(articles) {
  const dataSources = articles.map((article) => article.source).filter(Boolean);
  const sources = [...new Set([...knownSources, ...dataSources])];

  addFilterOptions(sourceFilter, sources);
}

function isWithinTimeRange(value, selectedRange, currentTime = Date.now()) {
  if (selectedRange === "all") {
    return true;
  }

  const rangeDays = {
    "1d": 1,
    "2d": 2,
    "3d": 3,
    "7d": 7,
    "30d": 30,
  };
  const days = rangeDays[selectedRange];
  const publishedTime = new Date(value).getTime();

  if (!days || !Number.isFinite(publishedTime)) {
    return false;
  }

  const rangeMilliseconds = days * 24 * 60 * 60 * 1000;

  return (
    publishedTime <= currentTime &&
    publishedTime >= currentTime - rangeMilliseconds
  );
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function uint16LittleEndian(value) {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

function uint32LittleEndian(value) {
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
}

function joinByteArrays(parts) {
  const totalLength = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  parts.forEach((part) => {
    result.set(part, offset);
    offset += part.length;
  });

  return result;
}

function crc32(bytes) {
  let crc = 0xffffffff;

  bytes.forEach((byte) => {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  });

  return (crc ^ 0xffffffff) >>> 0;
}

function getDosDateTime(date) {
  const year = Math.max(date.getFullYear(), 1980);
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
  };
}

function createZipBlob(files) {
  const encoder = new TextEncoder();
  const localRecords = [];
  const centralRecords = [];
  const modifiedAt = getDosDateTime(new Date());
  let localOffset = 0;

  files.forEach(({ name, content }) => {
    const nameBytes = encoder.encode(name);
    const contentBytes = encoder.encode(content);
    const checksum = crc32(contentBytes);
    const commonHeader = [
      uint16LittleEndian(20),
      uint16LittleEndian(0x0800),
      uint16LittleEndian(0),
      uint16LittleEndian(modifiedAt.time),
      uint16LittleEndian(modifiedAt.date),
      uint32LittleEndian(checksum),
      uint32LittleEndian(contentBytes.length),
      uint32LittleEndian(contentBytes.length),
      uint16LittleEndian(nameBytes.length),
      uint16LittleEndian(0),
    ];
    const localRecord = joinByteArrays([
      uint32LittleEndian(0x04034b50),
      ...commonHeader,
      nameBytes,
      contentBytes,
    ]);
    const centralRecord = joinByteArrays([
      uint32LittleEndian(0x02014b50),
      uint16LittleEndian(20),
      ...commonHeader,
      uint16LittleEndian(0),
      uint16LittleEndian(0),
      uint16LittleEndian(0),
      uint32LittleEndian(0),
      uint32LittleEndian(localOffset),
      nameBytes,
    ]);

    localRecords.push(localRecord);
    centralRecords.push(centralRecord);
    localOffset += localRecord.length;
  });

  const centralDirectory = joinByteArrays(centralRecords);
  const endRecord = joinByteArrays([
    uint32LittleEndian(0x06054b50),
    uint16LittleEndian(0),
    uint16LittleEndian(0),
    uint16LittleEndian(files.length),
    uint16LittleEndian(files.length),
    uint32LittleEndian(centralDirectory.length),
    uint32LittleEndian(localOffset),
    uint16LittleEndian(0),
  ]);

  return new Blob(
    [joinByteArrays([...localRecords, centralDirectory, endRecord])],
    {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
  );
}

// 日报按北京时间自然日期收录昨天和今天；网页时间筛选仍使用原来的滚动天数。
function getBeijingDateKey(timestamp) {
  return new Date(timestamp + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function selectDailyReportArticles(articles, currentTime) {
  const today = getBeijingDateKey(currentTime);
  const yesterday = getBeijingDateKey(currentTime - 24 * 60 * 60 * 1000);
  const byTitle = new Map();

  articles.forEach((article) => {
    const publishedTime = new Date(article.publishedAt).getTime();
    if (!Number.isFinite(publishedTime) || publishedTime > currentTime) return;
    const dateKey = getBeijingDateKey(publishedTime);
    if (dateKey !== yesterday && dateKey !== today) return;

    const title = String(article.title || "").trim();
    if (!title) return;
    const previous = byTitle.get(title);
    // 相同标题只保留较新记录；时间相同时 Map 中的第一条不变。
    if (!previous || publishedTime > previous.publishedTime) {
      byTitle.set(title, {
        article: { ...article, title },
        dateKey,
        publishedTime,
      });
    }
  });

  return {
    dates: [yesterday, today],
    entries: [...byTitle.values()],
  };
}

function createDailyReportBlob(report) {
  const { dates, entries } = report;

  const relationships = [];
  const bodyParts = [
    `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="160"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>农业科技资讯日报</w:t></w:r></w:p>`,
    `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="280"/></w:pPr><w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>生成日期：${escapeXml(
      dates[1].replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$1年$2月$3日"),
    )}</w:t></w:r></w:p>`,
  ];
  let relationshipIndex = 1;

  dates.forEach((dateKey, dayIndex) => {
    bodyParts.push(
      `<w:p><w:pPr><w:spacing w:before="280" w:after="160"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="30"/></w:rPr><w:t>${dayIndex === 0 ? "一" : "二"}、${escapeXml(
        dateKey.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$1年$2月$3日"),
      )}资讯</w:t></w:r></w:p>`,
    );

    const groups = new Map();
    entries
      .filter((entry) => entry.dateKey === dateKey)
      .sort((a, b) => b.publishedTime - a.publishedTime)
      .forEach(({ article }) => {
        const sourceName = normalizeSourceName(article.source);
        if (!groups.has(sourceName)) groups.set(sourceName, []);
        groups.get(sourceName).push(article);
      });

    if (groups.size === 0) {
      bodyParts.push(`<w:p><w:r><w:t>暂无资讯</w:t></w:r></w:p>`);
    }

    groups.forEach((groupArticles, sourceName) => {
      bodyParts.push(
        `<w:p><w:pPr><w:spacing w:before="180" w:after="100"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>${escapeXml(
          sourceName,
        )}</w:t></w:r></w:p>`,
      );

      groupArticles.forEach((article, index) => {
        const relationshipId = `rId${relationshipIndex}`;
        relationshipIndex += 1;
        relationships.push(
          `<Relationship Id="${relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeXml(
            article.url,
          )}" TargetMode="External"/>`,
        );
        bodyParts.push(
          `<w:p><w:pPr><w:spacing w:before="80" w:after="40"/><w:ind w:left="360" w:hanging="360"/></w:pPr><w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>${index + 1}. ${escapeXml(
            article.title,
          )}</w:t></w:r></w:p>`,
          `<w:p><w:pPr><w:spacing w:after="100"/><w:ind w:left="360"/></w:pPr><w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t>原文链接：</w:t></w:r><w:hyperlink r:id="${relationshipId}"><w:r><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/><w:sz w:val="20"/></w:rPr><w:t>${escapeXml(
            article.url,
          )}</w:t></w:r></w:hyperlink></w:p>`,
        );
      });
    });
  });

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${bodyParts.join(
    "",
  )}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const documentRelationshipsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships.join(
    "",
  )}</Relationships>`;

  return createZipBlob([
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    },
    { name: "word/document.xml", content: documentXml },
    {
      name: "word/_rels/document.xml.rels",
      content: documentRelationshipsXml,
    },
  ]);
}

async function generateDailyReport() {
  const originalLabel = generateDailyReportButton.textContent;
  generateDailyReportButton.disabled = true;
  generateDailyReportButton.textContent = "正在生成…";

  try {
    const articles = await fetchNewsData();
    const report = selectDailyReportArticles(articles, Date.now());
    const reportDate = report.dates[1];
    const reportBlob = createDailyReportBlob(report);
    const downloadUrl = URL.createObjectURL(reportBlob);
    const downloadLink = document.createElement("a");

    downloadLink.href = downloadUrl;
    downloadLink.download = `农业科技资讯日报_${reportDate}.docx`;
    document.body.append(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  } catch (error) {
    console.error("生成今日日报失败：", error);
    window.alert("日报生成失败，请稍后重试并确认 data.json 可以正常读取。");
  } finally {
    generateDailyReportButton.disabled = false;
    generateDailyReportButton.textContent = originalLabel;
  }
}

function createNewsItem(article) {
  const item = document.createElement("article");
  item.className = "news-item";

  const content = document.createElement("div");
  content.className = "news-content";

  const meta = document.createElement("div");
  meta.className = "news-meta";

  const source = document.createElement("span");
  source.className = "source";
  source.textContent = article.source;

  const time = document.createElement("time");
  time.dateTime = article.publishedAt;
  time.textContent = formatPublishTime(article.publishedAt);

  const title = document.createElement("h3");
  title.className = "news-title";
  title.textContent = article.title;

  const action = document.createElement("div");
  action.className = "news-action";

  const link = document.createElement("a");
  link.className = "read-link";
  link.href = article.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "查看原文";
  link.setAttribute("aria-label", `查看原文：${article.title}`);

  meta.append(source, time);
  content.append(meta, title);
  action.append(link);
  item.append(content, action);

  return item;
}

function renderArticles(articles) {
  listElement.replaceChildren();

  if (articles.length === 0) {
    listElement.innerHTML = `
      <div class="status-card empty-state">
        <strong>没有符合条件的资讯</strong>
        <p>可以调整来源单位或发布时间筛选条件。</p>
      </div>
    `;
  } else {
    articles.forEach((article) => listElement.append(createNewsItem(article)));
  }

  listElement.setAttribute("aria-busy", "false");
  resultsSummaryElement.textContent = `筛选结果 ${articles.length} 条`;
}

function applyFilters() {
  const selectedSource = sourceFilter.value;
  const selectedTime = timeFilter.value;

  const filteredArticles = allArticles.filter((article) => {
    const matchesSource = selectedSource === "all" || article.source === selectedSource;
    const matchesTime = isWithinTimeRange(article.publishedAt, selectedTime);

    return matchesSource && matchesTime;
  });

  renderArticles(filteredArticles);
}

function showError() {
  listElement.innerHTML = `
    <div class="status-card error" role="alert">
      <strong>资讯加载失败</strong>
      <p>请通过本地服务器访问页面，并确认 data.json 与页面位于同一目录。</p>
    </div>
  `;
  listElement.setAttribute("aria-busy", "false");
  countElement.textContent = "暂无数据";
  resultsSummaryElement.textContent = "资讯读取失败";
}

async function loadNews() {
  try {
    const articles = await fetchNewsData();

    allArticles = [...articles].sort(
      (a, b) => new Date(b.publishedAt) - new Date(a.publishedAt),
    );

    initializeFilters(allArticles);
    countElement.textContent = `共 ${allArticles.length} 条`;
    generateDailyReportButton.disabled = false;
    applyFilters();
  } catch (error) {
    console.error("加载农业资讯失败：", error);
    showError();
  }
}

sourceFilter.addEventListener("change", applyFilters);
timeFilter.addEventListener("change", applyFilters);
resetFiltersButton.addEventListener("click", () => {
  sourceFilter.value = "all";
  timeFilter.value = "all";
  applyFilters();
});
generateDailyReportButton.addEventListener("click", generateDailyReport);

loadNews();
