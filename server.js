const http = require("http");
const fs = require("fs");
const path = require("path");
const { createWorkspaceApi } = require("./workspace-api");
const { verifyEmailLocally } = require("./email-precheck");

loadEnvFile(path.join(__dirname, ".env"));

const rootDir = __dirname;
const defaultPort = Number(process.env.PORT || 5173);
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

function getConfigDir() {
  return process.env.OUTREACH_CONFIG_DIR || rootDir;
}

function getConfigPath() {
  return path.join(getConfigDir(), "settings.json");
}

function defaultSettings() {
  return {
    mailboxValidatorApiKey: process.env.MAILBOXVALIDATOR_API_KEY || "",
    aiProvider: process.env.AI_PROVIDER || "openai",
    aiApiKey: process.env.OPENAI_API_KEY || "",
    aiBaseUrl: process.env.AI_BASE_URL || "https://api.openai.com/v1",
    aiModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    searchProvider: process.env.SEARCH_PROVIDER || "serpapi",
    searchApiKey: process.env.SEARCH_API_KEY || "",
    searchBaseUrl: process.env.SEARCH_BASE_URL || "",
    searchRegion: process.env.SEARCH_REGION || "global",
  };
}

function loadSettings() {
  const defaults = defaultSettings();
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) return defaults;

  try {
    return { ...defaults, ...JSON.parse(fs.readFileSync(configPath, "utf8")) };
  } catch {
    return defaults;
  }
}

function saveSettings(settings) {
  const configDir = getConfigDir();
  fs.mkdirSync(configDir, { recursive: true });
  const existing = loadSettings();
  const clean = {
    mailboxValidatorApiKey: settings.mailboxValidatorApiKey == null ? existing.mailboxValidatorApiKey : String(settings.mailboxValidatorApiKey || "").trim(),
    aiProvider: settings.aiProvider == null ? existing.aiProvider : String(settings.aiProvider || "openai").trim(),
    aiApiKey: settings.aiApiKey == null ? existing.aiApiKey : String(settings.aiApiKey || "").trim(),
    aiBaseUrl: settings.aiBaseUrl == null ? existing.aiBaseUrl : String(settings.aiBaseUrl || "").trim().replace(/\/+$/, ""),
    aiModel: settings.aiModel == null ? existing.aiModel : String(settings.aiModel || "").trim(),
    searchProvider: settings.searchProvider == null ? existing.searchProvider : String(settings.searchProvider || "serpapi").trim(),
    searchApiKey: settings.searchApiKey == null ? existing.searchApiKey : String(settings.searchApiKey || "").trim(),
    searchBaseUrl: settings.searchBaseUrl == null ? existing.searchBaseUrl : String(settings.searchBaseUrl || "").trim().replace(/\/+$/, ""),
    searchRegion: settings.searchRegion == null ? existing.searchRegion : String(settings.searchRegion || "global").trim(),
  };
  fs.writeFileSync(getConfigPath(), JSON.stringify(clean, null, 2));
  return clean;
}

function createServer(options = {}) {
  const workspaceApi = createWorkspaceApi({ getConfigDir, loadSettings, readJson, sendJson, searchWeb, verifyEmail:verifyWithMailboxValidator, localPrecheck:verifyEmailLocally, renderPdf: options.renderPdf });
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (!['localhost', '127.0.0.1'].includes(url.hostname)) return sendJson(res, 403, { error: 'Host rejected' });
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return sendJson(res, 403, { error: "Origin rejected" });
      if (await workspaceApi(req, res, url)) return;

      if (req.method === "GET" && url.pathname === "/api/settings") {
        const settings = loadSettings();
        return sendJson(res, 200, maskSettings(settings));
      }

      if (req.method === "POST" && url.pathname === "/api/settings") {
        const body = await readJson(req);
        const saved = saveSettings(body);
        return sendJson(res, 200, maskSettings(saved));
      }

      if (req.method === "GET" && url.pathname === "/api/config") {
        const settings = loadSettings();
        return sendJson(res, 200, {
          mailboxValidatorConfigured: Boolean(settings.mailboxValidatorApiKey),
          aiConfigured: Boolean(settings.aiApiKey),
          aiProvider: settings.aiProvider,
          aiModel: settings.aiModel,
          searchConfigured: Boolean(settings.searchApiKey),
          searchProvider: settings.searchProvider,
          configPath: getConfigPath(),
        });
      }

      if (req.method === "POST" && url.pathname === "/api/verify-emails") {
        return await handleVerifyEmails(req, res);
      }

      if (req.method === "POST" && url.pathname === "/api/generate-email") {
        return await handleGenerateEmail(req, res);
      }

      if (req.method === "POST" && url.pathname === "/api/discover-companies") {
        return await handleDiscoverCompanies(req, res);
      }

      if (req.method === "POST" && url.pathname === "/api/discover-contacts") {
        return await handleDiscoverContacts(req, res);
      }

      if (req.method !== "GET") {
        return sendJson(res, 405, { error: "Method not allowed" });
      }

      return serveStatic(url.pathname, res);
    } catch (error) {
      return sendJson(res, 500, { error: error.message || "Server error" });
    }
  });
}

function startServer(options = {}) {
  if (options.configDir) process.env.OUTREACH_CONFIG_DIR = options.configDir;
  const port = Number(options.port ?? defaultPort);
  const server = createServer(options);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      const actualPort = typeof address === "object" ? address.port : port;
      console.log(`Outreach Desk running at http://localhost:${actualPort}`);
      resolve({ server, port: actualPort, url: `http://localhost:${actualPort}` });
    });
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

async function handleVerifyEmails(req, res) {
  const settings = loadSettings();
  if (!settings.mailboxValidatorApiKey) {
    return sendJson(res, 400, {
      error: "请先在设置里填写 MailboxValidator API Key",
    });
  }

  const body = await readJson(req);
  const emails = uniqueEmails(body.emails || []);

  if (!emails.length) {
    return sendJson(res, 400, { error: "No emails provided" });
  }

  const results = [];
  for (const email of emails.slice(0, 50)) {
    results.push(await verifyWithMailboxValidator(email, settings.mailboxValidatorApiKey));
  }

  return sendJson(res, 200, { results });
}

async function handleGenerateEmail(req, res) {
  const settings = loadSettings();
  if (!settings.aiApiKey) {
    return sendJson(res, 400, {
      error: "请先在设置里填写 AI 邮件生成 API Key",
    });
  }

  const body = await readJson(req);
  const prompt = buildSalesEmailPrompt(body);

  const response = await fetch(`${settings.aiBaseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.aiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: settings.aiModel,
      messages: [
        {
          role: "system",
          content: "You write concise, compliant B2B cold outreach emails. Return JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    return sendJson(res, response.status, {
      error: data.error?.message || `${settings.aiProvider} request failed`,
    });
  }

  const text = data.choices?.[0]?.message?.content || "";
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { subject: "Introductory supplier option", body: text };
  }

  return sendJson(res, 200, parsed);
}

async function handleDiscoverCompanies(req, res) {
  const settings = loadSettings();
  const body = await readJson(req);
  const queries = buildDiscoveryQueries(body).slice(0, 8);
  const limit = clamp(Number(body.limit || 20), 5, 50);
  const rawResults = [];
  const errors = [];

  for (const query of queries) {
    try {
      const results = await searchWeb(query, settings, Math.min(10, limit));
      rawResults.push(...results.map((result) => ({ ...result, query })));
    } catch (error) {
      errors.push(`${query}: ${error.message}`);
    }
    if (rawResults.length >= limit * 2) break;
  }

  const companies = normalizeDiscoveryResults(rawResults).slice(0, limit);
  return sendJson(res, 200, { queries, companies, errors: errors.slice(0, 5) });
}

async function handleDiscoverContacts(req, res) {
  const settings = loadSettings();
  const body = await readJson(req);
  const company = String(body.company || "").trim();
  const website = String(body.website || "").trim();
  const role = String(body.role || "").trim();
  const region = String(body.region || "").trim();
  const keywords = String(body.keywords || "").trim();

  if (!company && !website) {
    return sendJson(res, 400, { error: "请至少填写公司名或官网" });
  }

  const domain = website ? parseResultUrl(website).hostname : "";
  const queries = buildContactQueries({ company, website, domain, role, region, keywords }).slice(0, 8);
  const rawResults = [];
  const errors = [];

  for (const query of queries) {
    try {
      const results = await searchWeb(query, settings, 10);
      rawResults.push(...results.map((result) => ({ ...result, query })));
    } catch (error) {
      errors.push(`${query}: ${error.message}`);
    }
    if (rawResults.length >= 40) break;
  }

  const contacts = normalizeContactResults(rawResults, { company, domain, role }).slice(0, 20);
  return sendJson(res, 200, { queries, contacts, errors: errors.slice(0, 5) });
}

function buildContactQueries({ company, website, domain, role, region, keywords }) {
  const target = company || domain || website;
  const roleTerms = splitLines(role || "procurement manager\npurchasing manager\nsourcing manager\nsales manager\noperations director");
  const baseTerms = [target, region, keywords].filter(Boolean).join(" ");
  const queries = [];

  for (const term of roleTerms.slice(0, 6)) {
    queries.push([target, term, "email contact", region].filter(Boolean).join(" "));
    queries.push([target, term, "LinkedIn", region].filter(Boolean).join(" "));
  }
  queries.push([baseTerms, "team contact email"].filter(Boolean).join(" "));
  queries.push([baseTerms, "about team"].filter(Boolean).join(" "));
  queries.push([baseTerms, "procurement purchasing contact"].filter(Boolean).join(" "));
  if (domain) {
    queries.push(`site:${domain} contact email procurement purchasing`);
    queries.push(`site:${domain} team ${role || "procurement"}`);
  }

  return [...new Set(queries.filter(Boolean))];
}

function buildDiscoveryQueries(body) {
  const industry = String(body.industry || "").trim();
  const region = String(body.region || "").trim();
  const language = String(body.language || "en").trim();
  const companyTypes = splitLines(body.companyTypes || "owner\noperator\ndistributor\ntrading company\nagent");
  const keywords = splitLines(body.keywords || industry);
  const queries = [];
  const negativeTerms = "-news -article -百科 -知乎 -百度百科 -论坛 -招聘 -pdf -论文 -报告";

  for (const type of companyTypes.slice(0, 5)) {
    for (const keyword of keywords.slice(0, 5)) {
      const parts = [industry, keyword, type, "company official website contact", region, negativeTerms].filter(Boolean);
      queries.push(parts.join(" "));
      queries.push([industry, keyword, type, "supplier distributor manufacturer company", region, negativeTerms].filter(Boolean).join(" "));
    }
  }

  if (language === "zh" || language === "mixed") {
    for (const keyword of keywords.slice(0, 4)) {
      queries.push([industry, keyword, "公司 官网 联系方式 供应商 代理商", region, negativeTerms].filter(Boolean).join(" "));
      queries.push([industry, keyword, "代理商 贸易商 船东 运营商 公司 官网", region, negativeTerms].filter(Boolean).join(" "));
    }
  }

  return [...new Set(queries.filter(Boolean))];
}

async function searchWeb(query, settings, count) {
  if (settings.searchApiKey) {
    if (settings.searchProvider === "brave") return searchBrave(query, settings, count);
    if (settings.searchProvider === "bing") return searchBing(query, settings, count);
    if (settings.searchProvider === "custom") return searchCustom(query, settings, count);
    return searchSerpApi(query, settings, count);
  }

  return searchPublicWeb(query, count);
}

async function searchPublicWeb(query, count) {
  const attempts = [() => searchDuckDuckGoHtml(query, count), () => searchBingHtml(query, count)];
  const errors = [];

  for (const attempt of attempts) {
    try {
      const results = await attempt();
      if (results.length) return results;
    } catch (error) {
      errors.push(error.message);
    }
  }

  throw new Error(`公开搜索暂不可用：${errors.join(" / ")}`);
}

async function searchDuckDuckGoHtml(query, count) {
  const url = new URL("https://html.duckduckgo.com/html/");
  url.searchParams.set("q", query);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: {
      "User-Agent": "Mozilla/5.0 OutreachDesk/0.1",
      Accept: "text/html",
    },
  });
  const html = await response.text();
  if (!response.ok) throw new Error(`公开搜索失败：HTTP ${response.status}`);
  return parseDuckDuckGoHtml(html).slice(0, count);
}

async function searchBingHtml(query, count) {
  const url = new URL("https://www.bing.com/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(count));
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: {
      "User-Agent": "Mozilla/5.0 OutreachDesk/0.1",
      Accept: "text/html",
    },
  });
  const html = await response.text();
  if (!response.ok) throw new Error(`Bing 公开搜索失败：HTTP ${response.status}`);
  return parseBingHtml(html).slice(0, count);
}

async function searchSerpApi(query, settings, count) {
  const url = new URL(settings.searchBaseUrl || "https://serpapi.com/search.json");
  url.searchParams.set("api_key", settings.searchApiKey);
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("num", String(count));
  if (settings.searchRegion && settings.searchRegion !== "global") url.searchParams.set("gl", settings.searchRegion);

  const data = await fetchJson(url);
  return (data.organic_results || []).map((item) => ({
    title: item.title,
    url: item.link,
    snippet: item.snippet || item.rich_snippet?.top?.detected_extensions?.description || "",
    source: "SerpAPI",
  }));
}

async function searchBrave(query, settings, count) {
  const url = new URL(settings.searchBaseUrl || "https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(Math.min(count, 20)));
  const data = await fetchJson(url, {
    headers: {
      "X-Subscription-Token": settings.searchApiKey,
      Accept: "application/json",
    },
  });
  return (data.web?.results || []).map((item) => ({
    title: item.title,
    url: item.url,
    snippet: item.description || "",
    source: "Brave",
  }));
}

async function searchBing(query, settings, count) {
  const url = new URL(settings.searchBaseUrl || "https://api.bing.microsoft.com/v7.0/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(Math.min(count, 50)));
  const data = await fetchJson(url, {
    headers: {
      "Ocp-Apim-Subscription-Key": settings.searchApiKey,
      Accept: "application/json",
    },
  });
  return (data.webPages?.value || []).map((item) => ({
    title: item.name,
    url: item.url,
    snippet: item.snippet || "",
    source: "Bing",
  }));
}

async function searchCustom(query, settings, count) {
  if (!settings.searchBaseUrl) throw new Error("自定义搜索 API 需要填写 Base URL");
  const url = new URL(settings.searchBaseUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(count));
  const data = await fetchJson(url, {
    headers: {
      Authorization: `Bearer ${settings.searchApiKey}`,
      Accept: "application/json",
    },
  });
  const items = data.results || data.items || data.web?.results || [];
  return items.map((item) => ({
    title: item.title || item.name,
    url: item.url || item.link,
    snippet: item.snippet || item.description || "",
    source: "Custom",
  }));
}

function normalizeDiscoveryResults(results) {
  const seen = new Map();
  for (const result of results) {
    if (!result.url) continue;
    const urlInfo = parseResultUrl(result.url);
    if (!urlInfo.hostname) continue;
    if (isLowValueSearchResult(urlInfo.hostname, result.url, result)) continue;
    if (!isLikelyCompanyResult(result, urlInfo)) continue;

    const key = urlInfo.rootDomain || urlInfo.hostname;
    const existing = seen.get(key);
    const item = existing || {
      company: inferCompanyName(result.title, urlInfo.hostname),
      website: urlInfo.isCompanySite ? urlInfo.origin : "",
      domain: key,
      linkedin: "",
      directories: [],
      snippets: [],
      sources: [],
      score: 0,
    };

    if (urlInfo.isLinkedIn && isLinkedInCompanyUrl(result.url) && !item.linkedin) item.linkedin = result.url;
    if (!urlInfo.isCompanySite && !urlInfo.isLinkedIn) item.directories.push(result.url);
    if (urlInfo.isCompanySite && !item.website) item.website = urlInfo.origin;
    item.snippets.push(result.snippet || result.title || "");
    item.sources.push({ title: result.title, url: result.url, source: result.source, query: result.query });
    item.score += scoreDiscoveryResult(result, urlInfo);
    seen.set(key, item);
  }

  return [...seen.values()]
    .map((item) => ({
      ...item,
      snippets: [...new Set(item.snippets.filter(Boolean))].slice(0, 3),
      directories: [...new Set(item.directories)].slice(0, 3),
      sources: item.sources.slice(0, 5),
    }))
    .filter((item) => isValidCompanyCandidate(item))
    .sort((a, b) => b.score - a.score);
}

function normalizeContactResults(results, context) {
  const contacts = [];
  const seen = new Set();

  for (const result of results) {
    const text = decodeHtml(`${result.title || ""} ${result.snippet || ""}`);
    const emails = extractEmails(text);
    const name = inferContactName(text);
    const title = inferContactTitle(text, context.role);
    const sourceUrl = result.url || "";
    const key = `${name}|${title}|${emails.join(",")}|${sourceUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (!name && !title && !emails.length && !looksLikeContactPage(result)) continue;

    contacts.push({
      name,
      title,
      email: emails[0] || "",
      company: context.company || "",
      sourceUrl,
      sourceTitle: result.title || "",
      snippet: result.snippet || "",
      confidence: scoreContactResult({ name, title, emails, result, context }),
    });
  }

  return contacts.sort((a, b) => b.confidence - a.confidence);
}

function parseDuckDuckGoHtml(html) {
  const results = [];
  const blocks = html.split(/<div class="result results_links/).slice(1);

  for (const block of blocks) {
    const linkMatch = block.match(/<a rel="nofollow" class="result__a" href="([^"]+)">([\s\S]*?)<\/a>/);
    if (!linkMatch) continue;
    const url = cleanDuckDuckGoUrl(decodeHtml(linkMatch[1]));
    const title = stripHtml(linkMatch[2]);
    const snippetMatch = block.match(/<a class="result__snippet"[\s\S]*?>([\s\S]*?)<\/a>/) || block.match(/<div class="result__snippet"[\s\S]*?>([\s\S]*?)<\/div>/);
    const snippet = snippetMatch ? stripHtml(snippetMatch[1]) : "";
    if (url) results.push({ title, url, snippet, source: "DuckDuckGo" });
  }

  return results;
}

function parseBingHtml(html) {
  const results = [];
  const blocks = html.split(/<li class="b_algo"/).slice(1);

  for (const block of blocks) {
    const linkMatch = block.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!linkMatch) continue;
    const url = decodeHtml(linkMatch[1]);
    const title = stripHtml(linkMatch[2]);
    const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    const snippet = snippetMatch ? stripHtml(snippetMatch[1]) : "";
    if (url && title) results.push({ title, url, snippet, source: "Bing Public" });
  }

  return results;
}

function cleanDuckDuckGoUrl(value) {
  try {
    const decoded = decodeURIComponent(value);
    const url = new URL(decoded.startsWith("//") ? `https:${decoded}` : decoded);
    const uddg = url.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : url.href;
  } catch {
    return value;
  }
}

function extractEmails(text) {
  return [...new Set(String(text).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [])].map((email) => email.toLowerCase());
}

function inferContactName(text) {
  const cleaned = decodeHtml(text);
  const patterns = [
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\s*[-–—|,]\s*(?:Procurement|Purchasing|Sourcing|Sales|Operations|Business Development|Director|Manager|Head)/,
    /(?:Procurement|Purchasing|Sourcing|Sales|Operations|Business Development|Director|Manager|Head)[^A-Z]{0,20}\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/,
  ];
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) return match[1].trim();
  }
  return "";
}

function inferContactTitle(text, fallback) {
  const match = decodeHtml(text).match(/\b(Procurement Manager|Purchasing Manager|Sourcing Manager|Sales Manager|Operations Director|Business Development Manager|Managing Director|General Manager|Head of Procurement|Procurement Lead|Purchasing Lead)\b/i);
  if (match) return titleCase(match[1]);
  return fallback || "";
}

function looksLikeContactPage(result) {
  const text = `${result.title || ""} ${result.snippet || ""} ${result.url || ""}`.toLowerCase();
  return /(contact|team|about|procurement|purchasing|sourcing|linkedin|email)/.test(text);
}

function scoreContactResult({ name, title, emails, result, context }) {
  let score = 0;
  const text = `${result.title || ""} ${result.snippet || ""} ${result.url || ""}`.toLowerCase();
  if (name) score += 3;
  if (title) score += 2;
  if (emails.length) score += 4;
  if (text.includes("linkedin")) score += 2;
  if (text.includes("contact")) score += 1;
  if (context.domain && text.includes(context.domain)) score += 2;
  if (context.company && text.includes(context.company.toLowerCase())) score += 2;
  return score;
}

function stripHtml(value) {
  return decodeHtml(String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function titleCase(value) {
  return String(value || "").replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function scoreDiscoveryResult(result, urlInfo) {
  let score = 1;
  const text = `${result.title || ""} ${result.snippet || ""}`.toLowerCase();
  if (urlInfo.isCompanySite) score += 4;
  if (urlInfo.isLinkedIn && isLinkedInCompanyUrl(result.url)) score += 2;
  if (/\b(contact|about|company|supplier|distributor|manufacturer|owner|operator|official|website|services|products)\b/.test(text)) score += 3;
  if (/(公司|官网|供应商|代理商|贸易商|制造商|船东|运营商|联系我们|产品|服务)/.test(text)) score += 3;
  if (/\b(job|career|news|pdf|login|facebook|youtube|wiki|article|blog)\b/.test(text)) score -= 6;
  if (/(新闻|百科|知乎|问答|论坛|招聘|论文|报告|资讯|文章|客户案例|采购项目)/.test(text)) score -= 8;
  return score;
}

async function verifyWithMailboxValidator(email, apiKey) {
  const url = new URL("https://api.mailboxvalidator.com/v2/validation/single");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("email", email);
  url.searchParams.set("format", "json");

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const data = await response.json();

    if (!response.ok || data.error) {
      return {
        email,
        status: "risky",
        label: "API 异常",
        reasons: [data.error?.error_message || `MailboxValidator HTTP ${response.status}`],
        raw: data,
      };
    }

    return normalizeMailboxValidatorResult(email, data);
  } catch (error) {
    return {
      email,
      status: "risky",
      label: "API 异常",
      reasons: [error.message || "MailboxValidator request failed"],
    };
  }
}

function normalizeMailboxValidatorResult(email, data) {
  data={...data};
  for(const key of ['status','is_syntax','is_domain','is_smtp','is_verified','is_disposable','is_role','is_free','is_catchall','is_high_risk','is_server_down'])if(typeof data[key]==='string'&&/^(true|false)$/i.test(data[key]))data[key]=data[key].toLowerCase()==='true';
  const reasons = [];
  const score = Number(data.mailboxvalidator_score || 0);

  if (data.is_syntax === false) reasons.push("语法无效");
  if (data.is_domain === false) reasons.push("域名 MX 无效");
  if (data.is_smtp === false) reasons.push("SMTP 不响应");
  if (data.is_verified === false) reasons.push("收件箱未确认存在");
  if (data.is_disposable === true) reasons.push("一次性邮箱");
  if (data.is_role === true) reasons.push("角色邮箱");
  if (data.is_free === true) reasons.push("免费邮箱");
  if (data.is_catchall === true) reasons.push("Catch-all 域名");
  if (data.is_high_risk === true) reasons.push("高风险邮箱");
  if (data.is_server_down === true) reasons.push("邮件服务器无响应");
  if (score) reasons.push(`评分 ${score}`);

  let status = "invalid";
  let label = "无效";

  if (data.status === true && data.is_verified !== false && data.is_disposable !== true && score > 0.7) {
    status = data.is_role === true || data.is_free === true || data.is_catchall === true ? "risky" : "valid";
    label = status === "valid" ? "可发送" : "需复核";
  } else if (data.status === true || score > 0.4) {
    status = "risky";
    label = "需复核";
  }

  return {
    email: data.email_address || email,
    status,
    label,
    reasons: reasons.length ? reasons : ["MailboxValidator 验证通过"],
    raw: {
      score,
      credits_available: data.credits_available,
      is_verified: data.is_verified,
      is_domain: data.is_domain,
      is_smtp: data.is_smtp,
      status: data.status,
    },
  };
}

function buildSalesEmailPrompt(body) {
  const lead = body.lead || {};
  const product = body.product || "our products";
  const value = body.value || "stable quality, responsive service, and flexible supply options";
  const tone = body.tone || "简洁专业";

  return `Write a concise, compliant cold outreach email in English.

Rules:
- Do not claim an existing relationship.
- Do not overpromise.
- Keep it under 140 words.
- Include a polite opt-out line.
- Return JSON only: {"subject":"...","body":"..."}.

Lead:
- Company: ${lead.company || ""}
- Contact name: ${lead.name || ""}
- Title: ${lead.title || ""}
- Region: ${lead.region || ""}
- Website: ${lead.website || ""}
- Source/notes: ${lead.notes || ""}

Offer:
- Product/service: ${product}
- Value points: ${value}
- Tone: ${tone}`;
}

function maskSettings(settings) {
  return {
    mailboxValidatorConfigured: Boolean(settings.mailboxValidatorApiKey),
    mailboxValidatorApiKey: settings.mailboxValidatorApiKey ? "********" : "",
    aiProvider: settings.aiProvider,
    aiConfigured: Boolean(settings.aiApiKey),
    aiApiKey: settings.aiApiKey ? "********" : "",
    aiBaseUrl: settings.aiBaseUrl,
    aiModel: settings.aiModel,
    searchProvider: settings.searchProvider,
    searchConfigured: Boolean(settings.searchApiKey),
    searchApiKey: settings.searchApiKey ? "********" : "",
    searchBaseUrl: settings.searchBaseUrl,
    searchRegion: settings.searchRegion,
    configPath: getConfigPath(),
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || data.message || `Search request failed: HTTP ${response.status}`);
  }
  return data;
}

function parseResultUrl(value) {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.replace(/^www\./, "").toLowerCase();
    const rootDomain = getRegistrableDomain(hostname);
    const isLinkedIn = hostname.includes("linkedin.com");
    const nonCompanyHosts = ["google.com", "bing.com", "facebook.com", "youtube.com", "twitter.com", "x.com", "instagram.com", "wikipedia.org"];
    return {
      hostname,
      rootDomain,
      origin: parsed.origin,
      isLinkedIn,
      isCompanySite: !isLinkedIn && !nonCompanyHosts.some((host) => hostname.endsWith(host)),
    };
  } catch {
    return { hostname: "", rootDomain: "", origin: "", isLinkedIn: false, isCompanySite: false };
  }
}

function isLowValueSearchResult(hostname, url, result = {}) {
  const lowValueHosts = [
    "google.com",
    "bing.com",
    "youtube.com",
    "facebook.com",
    "instagram.com",
    "x.com",
    "twitter.com",
    "reddit.com",
    "wikipedia.org",
    "baidu.com",
    "zhihu.com",
    "sohu.com",
    "163.com",
    "qq.com",
    "sina.com.cn",
    "csdn.net",
    "docin.com",
    "wenku.baidu.com",
    "baike.baidu.com",
    "news.cn",
    "thepaper.cn",
    "toutiao.com",
    "bilibili.com",
  ];
  const lowValuePaths = ["/search", "/login", "/signin", "/jobs", "/careers", "/news", "/article", "/blog", "/wiki", "/baike"];
  const text = `${result.title || ""} ${result.snippet || ""} ${url || ""}`.toLowerCase();
  return (
    lowValueHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`)) ||
    lowValuePaths.some((pathPart) => url.toLowerCase().includes(pathPart)) ||
    /(百科|知乎|新闻|资讯|论坛|问答|招聘|论文|报告|是什么意思|是什么|介绍|客户案例)/.test(text)
  );
}

function isLikelyCompanyResult(result, urlInfo) {
  const title = String(result.title || "");
  const snippet = String(result.snippet || "");
  const text = `${title} ${snippet} ${result.url || ""}`;
  const lower = text.toLowerCase();

  if (urlInfo.isLinkedIn) return isLinkedInCompanyUrl(result.url);
  if (!urlInfo.isCompanySite) return false;

  const positive =
    /\b(company|official website|supplier|distributor|manufacturer|trading company|owner|operator|contact us|about us|products|services)\b/i.test(text) ||
    /(公司|官网|官方网站|供应商|代理商|贸易商|制造商|船东|运营商|联系我们|关于我们|产品|服务)/.test(text);
  const negative =
    /\b(news|article|blog|wiki|job|career|research|report|pdf|forum|question|answer)\b/i.test(text) ||
    /(新闻|百科|知乎|论坛|问答|招聘|论文|报告|资讯|文章|是什么|是什么意思)/.test(text);

  if (negative) return false;
  if (positive) return true;

  return looksLikeCorporateDomain(urlInfo.hostname, title);
}

function isValidCompanyCandidate(item) {
  if (!item.website && !item.linkedin && !item.directories.length) return false;
  if (item.score < 3) return false;
  const text = `${item.company || ""} ${(item.snippets || []).join(" ")}`;
  if (/(百科|新闻|知乎|论坛|问答|招聘|论文|报告|是什么|是什么意思)/.test(text)) return false;
  if (/^(com|com\.cn|cn|org|net|baidu|zhihu|sohu)$/i.test(item.company || "")) return false;
  if (isGenericContentTitle(item.company || "")) return false;
  if (isPublicSuffixOnly(item.domain || "")) return false;
  return true;
}

function isLinkedInCompanyUrl(url) {
  return /linkedin\.com\/company\//i.test(url || "");
}

function looksLikeCorporateDomain(hostname, title) {
  const firstLabel = hostname.split(".")[0];
  if (!firstLabel || firstLabel.length < 3) return false;
  if (/^\d+$/.test(firstLabel)) return false;
  if (/(blog|news|wiki|baike|search|bbs|forum|docs|wenku)/i.test(hostname)) return false;
  return Boolean(title && title.length >= 3);
}

function inferCompanyName(title, hostname) {
  const cleaned = String(title || "")
    .replace(/\s*[-|–—]\s*(official site|home|linkedin|facebook|youtube).*$/i, "")
    .replace(/\s*[-|–—]\s*.*$/i, "")
    .replace(/\s*\|.*$/i, "")
    .trim();
  if (cleaned && cleaned.length <= 80 && !isGenericContentTitle(cleaned)) return cleaned;
  return domainLabelToCompany(hostname);
}

function getRegistrableDomain(hostname) {
  const parts = hostname.split(".");
  if (parts.length <= 2) return hostname;
  const lastTwo = parts.slice(-2).join(".");
  const lastThree = parts.slice(-3).join(".");
  const secondLevelSuffixes = new Set([
    "com.cn",
    "net.cn",
    "org.cn",
    "gov.cn",
    "edu.cn",
    "com.hk",
    "com.sg",
    "com.my",
    "com.au",
    "co.uk",
    "co.jp",
    "co.kr",
    "co.id",
    "co.th",
    "co.in",
  ]);
  return secondLevelSuffixes.has(lastTwo) ? lastThree : lastTwo;
}

function isPublicSuffixOnly(domain) {
  return /^(com|net|org|cn|com\.cn|net\.cn|org\.cn|co\.uk|com\.sg|com\.hk)$/i.test(domain);
}

function isGenericContentTitle(value) {
  const text = String(value || "").trim();
  if (!text) return true;
  return (
    /(是什么|是什么意思|百科|了解|关键|介绍|原理|系统|装置|分类|类型|优缺点|成本|发展|研究|报告|新闻|资讯|文章|论文)/.test(text) ||
    /\b(what is|overview|guide|definition|wiki|news|article|report|research|introduction)\b/i.test(text) ||
    /^浮式生产储卸油轮/i.test(text) ||
    /^你所不知道/.test(text)
  );
}

function domainLabelToCompany(hostname) {
  const domain = getRegistrableDomain(hostname);
  const first = domain.split(".")[0] || hostname.split(".")[0];
  const cleaned = first.replace(/[-_]/g, " ");
  return cleaned.length <= 5 ? cleaned.toUpperCase() : cleaned;
}

function splitLines(value) {
  return String(value || "")
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function clamp(value, min, max) {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function serveStatic(requestPath, res) {
  const cleanPath = decodeURIComponent(requestPath.split("?")[0]);
  const target = cleanPath === "/" ? "/desk.html" : cleanPath;
  const allowed = new Set(["/desk.html", "/desk.js", "/desk.css", "/crm-core.js", "/crm-ui.js", "/index.html", "/app.js", "/styles.css"]);
  if (!allowed.has(target)) return sendJson(res, 404, { error: "Not found" });
  const filePath = path.resolve(rootDir, `.${target}`);

  if (!filePath.startsWith(rootDir)) {
    return sendJson(res, 403, { error: "Forbidden" });
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      return sendJson(res, 404, { error: "Not found" });
    }
    res.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream" });
    res.end(content);
  });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 24 * 1024 * 1024) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function uniqueEmails(values) {
  return [...new Set(values.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean))];
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

module.exports = { createServer, startServer, loadSettings, saveSettings };
