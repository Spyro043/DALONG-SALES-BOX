const storageKey = "outreach-desk-leads";
const statuses = ["待研究", "待发信", "已触达", "已回复", "已退订"];
const freeEmailDomains = new Set(["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "qq.com", "163.com", "126.com", "foxmail.com"]);
const disposableDomains = new Set(["mailinator.com", "10minutemail.com", "tempmail.com", "guerrillamail.com", "yopmail.com"]);
const rolePrefixes = new Set(["info", "sales", "contact", "admin", "support", "hello", "office", "service", "marketing", "procurement", "purchase", "purchasing"]);

let leads = loadLeads();
let activeSearch = "";
let verificationResults = [];
let candidateEmailGuesses = [];

const navItems = document.querySelectorAll(".nav-item");
const tabPanels = document.querySelectorAll(".tab-panel");
const leadForm = document.querySelector("#leadForm");
const foundContactForm = document.querySelector("#foundContactForm");
const finderForm = document.querySelector("#finderForm");
const leadTable = document.querySelector("#leadTable");
const leadCount = document.querySelector("#leadCount");
const leadSelect = document.querySelector("#leadSelect");
const searchInput = document.querySelector("#searchInput");
const csvInput = document.querySelector("#csvInput");
const sampleBtn = document.querySelector("#sampleBtn");
const exportBtn = document.querySelector("#exportBtn");
const generateBtn = document.querySelector("#generateBtn");
const copyBtn = document.querySelector("#copyBtn");
const subjectOutput = document.querySelector("#subjectOutput");
const emailOutput = document.querySelector("#emailOutput");
const pipelineBoard = document.querySelector("#pipelineBoard");
const searchLinks = document.querySelector("#searchLinks");
const runContactSearchBtn = document.querySelector("#runContactSearchBtn");
const showSearchLinksBtn = document.querySelector("#showSearchLinksBtn");
const contactSearchSummary = document.querySelector("#contactSearchSummary");
const contactResults = document.querySelector("#contactResults");
const discoveryForm = document.querySelector("#discoveryForm");
const discoveryIndustry = document.querySelector("#discoveryIndustry");
const discoveryRegion = document.querySelector("#discoveryRegion");
const discoveryCompanyTypes = document.querySelector("#discoveryCompanyTypes");
const discoveryKeywords = document.querySelector("#discoveryKeywords");
const discoveryLanguage = document.querySelector("#discoveryLanguage");
const discoveryLimit = document.querySelector("#discoveryLimit");
const discoverySummary = document.querySelector("#discoverySummary");
const discoveryQueries = document.querySelector("#discoveryQueries");
const discoveryResults = document.querySelector("#discoveryResults");
const guessEmailBtn = document.querySelector("#guessEmailBtn");
const verifyGuessesBtn = document.querySelector("#verifyGuessesBtn");
const copyGuessesBtn = document.querySelector("#copyGuessesBtn");
const importGuessesBtn = document.querySelector("#importGuessesBtn");
const openMailmeteorBtn = document.querySelector("#openMailmeteorBtn");
const emailGuesses = document.querySelector("#emailGuesses");
const verifySource = document.querySelector("#verifySource");
const verifyProvider = document.querySelector("#verifyProvider");
const verifyApiKey = document.querySelector("#verifyApiKey");
const manualEmails = document.querySelector("#manualEmails");
const runVerifyBtn = document.querySelector("#runVerifyBtn");
const applyVerifyBtn = document.querySelector("#applyVerifyBtn");
const exportVerifiedBtn = document.querySelector("#exportVerifiedBtn");
const verifyTable = document.querySelector("#verifyTable");
const verifySummary = document.querySelector("#verifySummary");
const settingsForm = document.querySelector("#settingsForm");
const settingsStatus = document.querySelector("#settingsStatus");
const settingsMailboxKey = document.querySelector("#settingsMailboxKey");
const settingsAiProvider = document.querySelector("#settingsAiProvider");
const settingsAiModel = document.querySelector("#settingsAiModel");
const settingsAiBaseUrl = document.querySelector("#settingsAiBaseUrl");
const settingsAiKey = document.querySelector("#settingsAiKey");
const settingsSearchProvider = document.querySelector("#settingsSearchProvider");
const settingsSearchRegion = document.querySelector("#settingsSearchRegion");
const settingsSearchBaseUrl = document.querySelector("#settingsSearchBaseUrl");
const settingsSearchApiKey = document.querySelector("#settingsSearchApiKey");

const providerDefaults = {
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini" },
  doubao: { baseUrl: "https://ark.cn-beijing.volces.com/api/v3", model: "doubao-seed-1-6-250615" },
  kimi: { baseUrl: "https://api.moonshot.cn/v1", model: "kimi-k2-0711-preview" },
  custom: { baseUrl: "", model: "" },
};

const searchProviderDefaults = {
  serpapi: { baseUrl: "https://serpapi.com/search.json", region: "global" },
  brave: { baseUrl: "https://api.search.brave.com/res/v1/web/search", region: "global" },
  bing: { baseUrl: "https://api.bing.microsoft.com/v7.0/search", region: "global" },
  custom: { baseUrl: "", region: "global" },
};

navItems.forEach((item) => {
  item.addEventListener("click", () => {
    navItems.forEach((nav) => nav.classList.remove("active"));
    tabPanels.forEach((panel) => panel.classList.remove("active"));
    item.classList.add("active");
    document.querySelector(`#${item.dataset.tab}`).classList.add("active");
  });
});

discoveryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  discoverySummary.textContent = "搜索中...";
  discoveryQueries.innerHTML = `<li>正在生成查询并搜索公开网页。</li>`;
  discoveryResults.innerHTML = `<div class="empty-block">正在全网搜索目标公司...</div>`;

  try {
    const data = await discoverCompanies({
      industry: discoveryIndustry.value,
      region: discoveryRegion.value,
      companyTypes: discoveryCompanyTypes.value,
      keywords: discoveryKeywords.value,
      language: discoveryLanguage.value,
      limit: discoveryLimit.value,
    });
    renderDiscovery(data);
  } catch (error) {
    discoverySummary.textContent = "搜索失败";
    discoveryResults.innerHTML = `<div class="empty-block">${escapeHtml(error.message)}。请先在设置里配置全网搜索 API。</div>`;
  }
});

discoveryResults.addEventListener("click", (event) => {
  const button = event.target.closest("[data-discovery-action]");
  if (!button) return;

  const index = Number(button.dataset.index);
  const company = window.latestDiscoveryCompanies?.[index];
  if (!company) return;

  if (button.dataset.discoveryAction === "finder") {
    document.querySelector("#findCompany").value = company.company || "";
    document.querySelector("#findWebsite").value = company.website || "";
    document.querySelector("#findKeywords").value = company.snippets?.join("; ") || "";
    document.querySelector("#foundCompany").value = company.company || "";
    document.querySelector("#foundWebsite").value = company.website || "";
    document.querySelector("#foundSource").value = "人工确认";
    document.querySelector("#foundNotes").value = `市场发现来源：${company.sources?.[0]?.url || company.website || ""}`;
    activateTab("finder");
  }
});

finderForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const company = document.querySelector("#findCompany").value.trim();
  const website = document.querySelector("#findWebsite").value.trim();
  const role = document.querySelector("#findRole").value.trim();
  const region = document.querySelector("#findRegion").value.trim();
  const keywords = document.querySelector("#findKeywords").value.trim();
  const domain = extractDomain(website);

  document.querySelector("#candidateDomain").value = domain;
  document.querySelector("#foundCompany").value = company;
  document.querySelector("#foundWebsite").value = website;
  document.querySelector("#foundTitle").value = role;
  document.querySelector("#foundRegion").value = region;
  document.querySelector("#foundNotes").value = `寻找目标：${role}${keywords ? `；关键词：${keywords}` : ""}。请记录确认到的公开来源页面。`;

  renderSearchLinks({ company, website, domain, role, region, keywords });
});

runContactSearchBtn.addEventListener("click", async () => {
  const company = document.querySelector("#findCompany").value.trim();
  const website = document.querySelector("#findWebsite").value.trim();
  const role = document.querySelector("#findRole").value.trim();
  const region = document.querySelector("#findRegion").value.trim();
  const keywords = document.querySelector("#findKeywords").value.trim();

  contactSearchSummary.textContent = "搜索中...";
  contactResults.innerHTML = `<div class="empty-block">正在全网搜索公开联系人信息...</div>`;

  try {
    const data = await discoverContacts({ company, website, role, region, keywords });
    renderContactResults(data);
  } catch (error) {
    contactSearchSummary.textContent = "搜索失败";
    contactResults.innerHTML = `<div class="empty-block">${escapeHtml(error.message)}</div>`;
  }
});

showSearchLinksBtn.addEventListener("click", () => {
  searchLinks.classList.toggle("hidden");
});

contactResults.addEventListener("click", (event) => {
  const button = event.target.closest("[data-contact-index]");
  if (!button) return;

  const contact = window.latestContactResults?.[Number(button.dataset.contactIndex)];
  if (!contact) return;

  document.querySelector("#foundCompany").value = contact.company || document.querySelector("#findCompany").value.trim();
  document.querySelector("#foundWebsite").value = document.querySelector("#findWebsite").value.trim();
  document.querySelector("#foundName").value = contact.name || "";
  document.querySelector("#foundTitle").value = contact.title || "";
  document.querySelector("#foundEmail").value = contact.email || "";
  document.querySelector("#foundSource").value = "人工确认";
  document.querySelector("#foundNotes").value = `联网搜索来源：${contact.sourceUrl || ""}\n${contact.snippet || ""}`;
});

guessEmailBtn.addEventListener("click", () => {
  const name = document.querySelector("#candidateName").value.trim();
  const domain = extractDomain(document.querySelector("#candidateDomain").value.trim());
  const guesses = buildEmailGuesses(name, domain);

  if (!guesses.length) {
    candidateEmailGuesses = [];
    emailGuesses.innerHTML = `<div class="empty-block">请填写联系人姓名和公司域名。</div>`;
    return;
  }

  candidateEmailGuesses = guesses.map((email) => ({
    email,
    result: null,
    score: scoreEmailPattern(email, name),
  }));
  renderCandidateGuesses(false);
});

verifyGuessesBtn.addEventListener("click", () => {
  if (!candidateEmailGuesses.length) {
    emailGuesses.innerHTML = `<div class="empty-block">请先生成候选邮箱。</div>`;
    return;
  }

  verifyCandidateEmails();
});

copyGuessesBtn.addEventListener("click", async () => {
  const emails = getCandidateEmailsText();
  if (!emails) {
    emailGuesses.innerHTML = `<div class="empty-block">请先生成候选邮箱。</div>`;
    return;
  }

  await navigator.clipboard.writeText(emails);
  copyGuessesBtn.textContent = "已复制";
  setTimeout(() => {
    copyGuessesBtn.textContent = "复制所有邮箱";
  }, 1400);
});

importGuessesBtn.addEventListener("click", () => {
  const emails = getCandidateEmailsText();
  if (!emails) {
    emailGuesses.innerHTML = `<div class="empty-block">请先生成候选邮箱。</div>`;
    return;
  }

  verifySource.value = "manual";
  manualEmails.value = emails;
  verifyProvider.value = "mailboxvalidator";
  verifySummary.textContent = `已导入 ${candidateEmailGuesses.length} 个候选邮箱`;
  verifyTable.innerHTML = `<tr><td colspan="3" class="empty">候选邮箱已导入，点击“开始验证”即可批量验证。</td></tr>`;
  activateTab("verifier");
});

openMailmeteorBtn.addEventListener("click", () => {
  const name = document.querySelector("#candidateName").value.trim();
  const domain = extractDomain(document.querySelector("#candidateDomain").value.trim());

  if (!name || !domain) {
    emailGuesses.innerHTML = `<div class="empty-block">请先填写联系人姓名和公司域名，再打开 Mailmeteor 查询。</div>`;
    return;
  }

  window.open(buildMailmeteorFinderUrl(name, domain), "_blank", "noreferrer");
});

leadForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addLeadFromForm(leadForm);
  leadForm.reset();
});

foundContactForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addLeadFromForm(foundContactForm);
});

searchInput.addEventListener("input", (event) => {
  activeSearch = event.target.value.trim().toLowerCase();
  renderLeadTable();
});

sampleBtn.addEventListener("click", () => {
  const samples = [
    {
      company: "Apex Medical Supply",
      website: "https://example-medical.com",
      name: "Jane Smith",
      title: "Purchasing Manager",
      email: "jane.smith@example-medical.com",
      region: "United States",
      source: "展会名录",
      status: "待发信",
      notes: "进口一次性医疗耗材，关注 FDA 认证和稳定交期。",
    },
    {
      company: "Nordic Lab Partners",
      website: "https://example-lab.eu",
      name: "Erik Hansen",
      title: "Operations Director",
      email: "erik@example-lab.eu",
      region: "Denmark",
      source: "公司官网公开信息",
      status: "待研究",
      notes: "官网提到正在扩展耗材供应商，适合强调小批量定制。",
    },
  ].map((lead) => normalizeLead({ ...lead, id: crypto.randomUUID(), createdAt: new Date().toISOString() }));

  leads = [...samples, ...leads];
  saveLeads();
  render();
});

csvInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const text = await file.text();
  const imported = parseCsv(text).map((row) =>
    normalizeLead({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      company: row.company || row["公司"] || "",
      website: row.website || row["网站"] || "",
      name: row.name || row["联系人"] || "",
      title: row.title || row["职位"] || "",
      email: row.email || row["邮箱"] || "",
      region: row.region || row["国家"] || row["国家/地区"] || "",
      source: row.source || row["来源"] || "手动录入",
      status: row.status || row["状态"] || "待研究",
      notes: row.notes || row["备注"] || row["业务备注"] || "",
    })
  );

  leads = [...imported, ...leads];
  saveLeads();
  csvInput.value = "";
  render();
});

exportBtn.addEventListener("click", () => {
  const headers = ["company", "website", "name", "title", "email", "region", "source", "status", "notes"];
  const rows = leads.map((lead) => headers.map((header) => csvEscape(lead[header] || "")).join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  downloadFile(`outreach-leads-${dateStamp()}.csv`, csv, "text/csv;charset=utf-8");
});

generateBtn.addEventListener("click", async () => {
  const lead = leads.find((item) => item.id === leadSelect.value);
  if (!lead) return;

  const product = document.querySelector("#productInput").value.trim() || "our products";
  const value = document.querySelector("#valueInput").value.trim() || "stable quality, responsive service, and flexible supply options";
  const tone = document.querySelector("#toneInput").value;

  generateBtn.textContent = "生成中...";
  generateBtn.disabled = true;

  try {
    const draft = await generateEmailWithOpenAI({ lead, product, value, tone });
    subjectOutput.value = draft.subject || "";
    emailOutput.value = draft.body || "";
  } catch (error) {
    subjectOutput.value = "OpenAI generation failed";
    emailOutput.value = `${error.message}

请确认：
1. 使用 http://localhost:5173 打开工具
2. .env 里已设置 OPENAI_API_KEY
3. server.js 正在运行`;
  } finally {
    generateBtn.textContent = "生成邮件草稿";
    generateBtn.disabled = false;
  }
});

copyBtn.addEventListener("click", async () => {
  const content = `Subject: ${subjectOutput.value}\n\n${emailOutput.value}`;
  await navigator.clipboard.writeText(content);
  copyBtn.textContent = "已复制";
  setTimeout(() => {
    copyBtn.textContent = "复制";
  }, 1400);
});

runVerifyBtn.addEventListener("click", async () => {
  const emails = getEmailsForVerification();
  const provider = verifyProvider.value;

  if (provider !== "local" && provider !== "mailboxvalidator") {
    verifySummary.textContent = "暂未接入";
    verifyTable.innerHTML = `<tr><td colspan="3" class="empty">当前已接入 MailboxValidator。其他服务需要后续增加对应 API 适配器。</td></tr>`;
    return;
  }

  if (!emails.length) {
    verificationResults = [];
    renderVerificationResults();
    return;
  }

  verifySummary.textContent = "验证中...";
  verifyTable.innerHTML = `<tr><td colspan="3" class="empty">正在验证 ${emails.length} 个邮箱。</td></tr>`;

  try {
    verificationResults = provider === "mailboxvalidator" ? await verifyEmailsWithServer(emails) : emails.map((email) => verifyEmailLocally(email));
    renderVerificationResults();
  } catch (error) {
    verifySummary.textContent = "验证失败";
    verifyTable.innerHTML = `<tr><td colspan="3" class="empty">${escapeHtml(error.message)}。如果你是直接打开 file:// 页面，请改用本地服务器 http://localhost:5173。</td></tr>`;
  }
});

applyVerifyBtn.addEventListener("click", () => {
  if (!verificationResults.length) return;

  const resultMap = new Map(verificationResults.map((result) => [result.email.toLowerCase(), result]));
  leads = leads.map((lead) => {
    const result = resultMap.get(lead.email.toLowerCase());
    if (!result) return lead;

    const statusNote = `邮箱验证：${result.label}；${result.reasons.join("；")}；验证时间：${new Date().toLocaleString()}`;
    const nextStatus = result.status === "valid" && lead.status === "待研究" ? "待发信" : lead.status;
    return {
      ...lead,
      status: nextStatus,
      notes: appendNote(lead.notes, statusNote),
      emailVerification: result.status,
      emailVerifiedAt: new Date().toISOString(),
    };
  });

  saveLeads();
  render();
  verifySummary.textContent = "已写回线索";
});

exportVerifiedBtn.addEventListener("click", () => {
  const passedEmails = new Set(verificationResults.filter((result) => result.status === "valid").map((result) => result.email.toLowerCase()));
  const exportLeads = leads.filter((lead) => passedEmails.has(lead.email.toLowerCase()));
  const headers = ["company", "website", "name", "title", "email", "region", "source", "status", "notes"];
  const rows = exportLeads.map((lead) => headers.map((header) => csvEscape(lead[header] || "")).join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  downloadFile(`verified-leads-${dateStamp()}.csv`, csv, "text/csv;charset=utf-8");
});

settingsAiProvider.addEventListener("change", () => {
  const defaults = providerDefaults[settingsAiProvider.value] || providerDefaults.custom;
  if (!settingsAiBaseUrl.value || Object.values(providerDefaults).some((item) => item.baseUrl === settingsAiBaseUrl.value)) {
    settingsAiBaseUrl.value = defaults.baseUrl;
  }
  if (!settingsAiModel.value || Object.values(providerDefaults).some((item) => item.model === settingsAiModel.value)) {
    settingsAiModel.value = defaults.model;
  }
});

settingsSearchProvider.addEventListener("change", () => {
  const defaults = searchProviderDefaults[settingsSearchProvider.value] || searchProviderDefaults.custom;
  settingsSearchBaseUrl.value = defaults.baseUrl;
  settingsSearchRegion.value = defaults.region;
});

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  settingsStatus.textContent = "保存中...";

  try {
    await saveApiSettings({
      mailboxValidatorApiKey: settingsMailboxKey.value,
      aiProvider: settingsAiProvider.value,
      aiApiKey: settingsAiKey.value,
      aiBaseUrl: settingsAiBaseUrl.value,
      aiModel: settingsAiModel.value,
      searchProvider: settingsSearchProvider.value,
      searchApiKey: settingsSearchApiKey.value,
      searchBaseUrl: settingsSearchBaseUrl.value,
      searchRegion: settingsSearchRegion.value,
    });
    settingsMailboxKey.value = "";
    settingsAiKey.value = "";
    settingsSearchApiKey.value = "";
    settingsStatus.textContent = "已保存";
  } catch (error) {
    settingsStatus.textContent = error.message;
  }
});

function renderSearchLinks(context) {
  const { company, website, domain, role, region, keywords } = context;
  const queryParts = [company, role, region, keywords].filter(Boolean).join(" ");
  const siteQuery = domain ? `site:${domain} (${role} OR procurement OR purchasing OR sourcing OR sales OR contact)` : queryParts;
  const links = [
    { label: "Google 搜公司+职位", url: `https://www.google.com/search?q=${encodeURIComponent(queryParts)}` },
    { label: "Google 搜官网联系人", url: `https://www.google.com/search?q=${encodeURIComponent(siteQuery)}` },
    { label: "Google 搜邮箱格式", url: `https://www.google.com/search?q=${encodeURIComponent(`"${company}" email OR contact OR purchasing`)}` },
    { label: "官网 Contact 页", url: website ? joinUrl(website, "contact") : "" },
    { label: "官网 About 页", url: website ? joinUrl(website, "about") : "" },
    { label: "官网 Team 页", url: website ? joinUrl(website, "team") : "" },
  ].filter((link) => link.url);

  searchLinks.innerHTML = links
    .map(
      (link) => `
        <a class="source-link" href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">
          ${escapeHtml(link.label)}
          <span>${escapeHtml(link.url)}</span>
        </a>
      `
    )
    .join("");
}

function getEmailsForVerification() {
  if (verifySource.value === "manual") {
    return uniqueEmails(manualEmails.value.split(/[\s,;]+/));
  }

  return uniqueEmails(leads.map((lead) => lead.email));
}

function getCandidateEmailsText() {
  return candidateEmailGuesses.map((candidate) => candidate.email).filter(Boolean).join("\n");
}

async function verifyCandidateEmails() {
  emailGuesses.innerHTML = `<div class="empty-block">正在用 MailboxValidator 验证候选邮箱...</div>`;
  const emails = candidateEmailGuesses.map((candidate) => candidate.email);

  let results;
  try {
    results = await verifyEmailsWithServer(emails);
  } catch (error) {
    results = emails.map((email) => {
      const localResult = verifyEmailLocally(email);
      return {
        ...localResult,
        label: localResult.status === "valid" ? "本地通过" : localResult.label,
        reasons: [`MailboxValidator 暂不可用：${error.message}`, ...localResult.reasons],
      };
    });
  }

  const resultMap = new Map(results.map((result) => [result.email.toLowerCase(), result]));
  candidateEmailGuesses = candidateEmailGuesses
    .map((candidate) => ({
      ...candidate,
      result: resultMap.get(candidate.email.toLowerCase()) || verifyEmailLocally(candidate.email),
    }))
    .sort((a, b) => rankCandidate(b) - rankCandidate(a));
  renderCandidateGuesses(true);
}

async function verifyEmailsWithServer(emails) {
  const response = await fetch("/api/verify-emails", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ emails }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "MailboxValidator request failed");
  return data.results || [];
}

async function generateEmailWithOpenAI(payload) {
  const response = await fetch("/api/generate-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "OpenAI request failed");
  return data;
}

async function discoverCompanies(payload) {
  const response = await fetch("/api/discover-companies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "搜索失败");
  return data;
}

async function discoverContacts(payload) {
  const response = await fetch("/api/discover-contacts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "联系人搜索失败");
  return data;
}

function renderDiscovery(data) {
  const companies = data.companies || [];
  window.latestDiscoveryCompanies = companies;
  discoverySummary.textContent = `找到 ${companies.length} 个候选公司${data.errors?.length ? "，部分来源失败" : ""}`;
  discoveryQueries.innerHTML = (data.queries || [])
    .slice(0, 8)
    .map((query) => `<li>${escapeHtml(query)}</li>`)
    .join("");

  if (!companies.length) {
    const errors = data.errors?.length ? `<br>${escapeHtml(data.errors.join("；"))}` : "";
    discoveryResults.innerHTML = `<div class="empty-block">没有找到候选公司。可以换更宽泛的关键词或地区。${errors}</div>`;
    return;
  }

  discoveryResults.innerHTML = companies
    .map((company, index) => {
      const website = company.website || company.sources?.[0]?.url || "";
      const snippets = (company.snippets || []).map((item) => `<span>${escapeHtml(item)}</span>`).join("");
      const directories = (company.directories || [])
        .map((url) => `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">目录来源</a>`)
        .join("");
      return `
        <article class="company-card">
          <div class="company-main">
            <strong>${escapeHtml(company.company || company.domain)}</strong>
            <span>${escapeHtml(company.domain || "")}</span>
            <div class="company-snippets">${snippets}</div>
          </div>
          <div class="company-actions">
            ${website ? `<a class="external-verify-link" href="${escapeHtml(website)}" target="_blank" rel="noreferrer">官网/来源</a>` : ""}
            ${company.linkedin ? `<a class="external-verify-link" href="${escapeHtml(company.linkedin)}" target="_blank" rel="noreferrer">LinkedIn</a>` : ""}
            ${directories}
            <button class="small-button use-email-button" type="button" data-discovery-action="finder" data-index="${index}">找联系人</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderContactResults(data) {
  const contacts = data.contacts || [];
  window.latestContactResults = contacts;
  contactSearchSummary.textContent = `找到 ${contacts.length} 个候选${data.errors?.length ? "，部分来源失败" : ""}`;

  if (!contacts.length) {
    const errors = data.errors?.length ? `<br>${escapeHtml(data.errors.join("；"))}` : "";
    contactResults.innerHTML = `<div class="empty-block">没有找到明确联系人。可以换职位关键词，或打开搜索入口人工确认。${errors}</div>`;
    return;
  }

  contactResults.innerHTML = contacts
    .map(
      (contact, index) => `
        <article class="contact-card">
          <div class="contact-main">
            <strong>${escapeHtml(contact.name || "未识别姓名")}</strong>
            <span>${escapeHtml(contact.title || "未识别职位")}</span>
            <span>${escapeHtml(contact.email || "未发现公开邮箱")}</span>
            <p>${escapeHtml(contact.snippet || "")}</p>
          </div>
          <div class="company-actions">
            ${contact.sourceUrl ? `<a class="external-verify-link" href="${escapeHtml(contact.sourceUrl)}" target="_blank" rel="noreferrer">来源</a>` : ""}
            <button class="small-button use-email-button" type="button" data-contact-index="${index}">填入线索</button>
          </div>
        </article>
      `
    )
    .join("");
}

async function loadApiSettings() {
  try {
    const response = await fetch("/api/settings");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "读取设置失败");
    settingsAiProvider.value = data.aiProvider || "openai";
    settingsAiBaseUrl.value = data.aiBaseUrl || providerDefaults.openai.baseUrl;
    settingsAiModel.value = data.aiModel || providerDefaults.openai.model;
    settingsSearchProvider.value = data.searchProvider || "serpapi";
    settingsSearchBaseUrl.value = data.searchBaseUrl || searchProviderDefaults.serpapi.baseUrl;
    settingsSearchRegion.value = data.searchRegion || "global";
    settingsMailboxKey.placeholder = data.mailboxValidatorConfigured ? "已保存，如需更换请重新输入" : "用于邮箱验证";
    settingsAiKey.placeholder = data.aiConfigured ? "已保存，如需更换请重新输入" : "用于自动生成开发信";
    settingsSearchApiKey.placeholder = data.searchConfigured ? "已保存，如需更换请重新输入" : "用于全网搜索目标公司";
    settingsStatus.textContent = "已读取";
  } catch {
    settingsStatus.textContent = "请使用桌面程序或本地服务器打开";
  }
}

async function saveApiSettings(settings) {
  const payload = { ...settings };
  if (!payload.mailboxValidatorApiKey) delete payload.mailboxValidatorApiKey;
  if (!payload.aiApiKey) delete payload.aiApiKey;
  if (!payload.searchApiKey) delete payload.searchApiKey;

  const response = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "保存设置失败");
  return data;
}

function renderCandidateGuesses(hasVerified) {
  const name = document.querySelector("#candidateName").value.trim();

  emailGuesses.innerHTML = candidateEmailGuesses
    .map((candidate) => {
      const result = candidate.result;
      const badge = result
        ? `<span class="verify-badge ${result.status}">${escapeHtml(result.label)}</span>`
        : `<span class="verify-badge pending">待验证</span>`;
      const reasons = result ? result.reasons.join("；") : "先点击“验证所有候选邮箱”，再选择最合适的邮箱。";
      const canUse = result && result.status !== "invalid";

      return `
        <article class="guess-card ${result?.status || "pending"}">
          <div>
            <strong>${escapeHtml(candidate.email)}</strong>
            <span>${escapeHtml(reasons)}</span>
          </div>
          <div class="guess-actions">
            ${badge}
            <a class="external-verify-link" href="${escapeHtml(buildMailmeteorVerifierUrl(candidate.email))}" target="_blank" rel="noreferrer">外部验证</a>
            <button class="small-button use-email-button" data-email="${escapeHtml(candidate.email)}" type="button" ${canUse ? "" : "disabled"}>使用</button>
          </div>
        </article>
      `;
    })
    .join("");

  document.querySelectorAll(".use-email-button").forEach((button) => {
    button.addEventListener("click", () => {
      const candidate = candidateEmailGuesses.find((item) => item.email === button.dataset.email);
      if (!candidate?.result || candidate.result.status === "invalid") return;

      document.querySelector("#foundName").value = name;
      document.querySelector("#foundEmail").value = candidate.email;
      document.querySelector("#foundNotes").value = appendNote(
        document.querySelector("#foundNotes").value,
        `候选邮箱已预检查：${candidate.result.label}；${candidate.result.reasons.join("；")}。真正发送前建议接邮箱验证 API 做最终确认。`
      );
    });
  });

  if (hasVerified) {
    const best = candidateEmailGuesses.find((candidate) => candidate.result?.status === "valid");
    if (best) {
      document.querySelector("#foundName").value = name;
      document.querySelector("#foundEmail").value = best.email;
      document.querySelector("#foundNotes").value = appendNote(
        document.querySelector("#foundNotes").value,
        `系统推荐候选邮箱：${best.email}；本地预检查通过。`
      );
    }
  }
}

function scoreEmailPattern(email, name) {
  const [local] = email.split("@");
  const parts = name.toLowerCase().replace(/[^a-z\s.-]/g, "").split(/\s+/).filter(Boolean);
  const first = parts[0] || "";
  const last = parts.at(-1) || "";

  if (local === `${first}.${last}`) return 5;
  if (local === `${first}_${last}`) return 4;
  if (local === `${first}${last}`) return 3;
  if (local === first) return 2;
  return 1;
}

function rankCandidate(candidate) {
  const statusScore = candidate.result?.status === "valid" ? 100 : candidate.result?.status === "risky" ? 50 : 0;
  return statusScore + candidate.score;
}

function buildMailmeteorFinderUrl(name, domain) {
  const params = new URLSearchParams({ name, domain });
  return `https://mailmeteor.com/tools/email-finder?${params.toString()}`;
}

function buildMailmeteorVerifierUrl(email) {
  const params = new URLSearchParams({ email });
  return `https://mailmeteor.com/tools/email-verifier?${params.toString()}`;
}

function uniqueEmails(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean).map((email) => email.toLowerCase()))];
}

function verifyEmailLocally(email) {
  const reasons = [];
  const normalized = email.trim().toLowerCase();
  const basicPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  if (!basicPattern.test(normalized)) {
    return {
      email: normalized,
      status: "invalid",
      label: "无效",
      reasons: ["邮箱格式不正确"],
    };
  }

  const [local, domain] = normalized.split("@");
  const prefix = local.split(/[._+-]/)[0];

  if (disposableDomains.has(domain)) {
    return {
      email: normalized,
      status: "invalid",
      label: "无效",
      reasons: ["疑似一次性邮箱域名"],
    };
  }

  if (!domain.includes(".")) reasons.push("域名缺少后缀");
  if (freeEmailDomains.has(domain)) reasons.push("免费邮箱，B2B 精准度较低");
  if (rolePrefixes.has(prefix)) reasons.push("角色邮箱，可能不是具体采购联系人");
  if (local.length < 2) reasons.push("邮箱前缀过短");
  if (domain.length < 4) reasons.push("域名过短");

  const status = reasons.length ? "risky" : "valid";
  return {
    email: normalized,
    status,
    label: status === "valid" ? "可发送" : "需复核",
    reasons: reasons.length ? reasons : ["格式正常；仍建议用 API 验证 MX/SMTP 可达性"],
  };
}

function renderVerificationResults() {
  if (!verificationResults.length) {
    verifySummary.textContent = "无邮箱";
    verifyTable.innerHTML = `<tr><td colspan="3" class="empty">没有可验证的邮箱。</td></tr>`;
    return;
  }

  const counts = verificationResults.reduce(
    (acc, item) => {
      acc[item.status] += 1;
      return acc;
    },
    { valid: 0, risky: 0, invalid: 0 }
  );

  verifySummary.textContent = `可发送 ${counts.valid}，需复核 ${counts.risky}，无效 ${counts.invalid}`;
  verifyTable.innerHTML = verificationResults
    .map(
      (result) => `
        <tr>
          <td>${escapeHtml(result.email)}</td>
          <td><span class="verify-badge ${result.status}">${escapeHtml(result.label)}</span></td>
          <td>${escapeHtml(result.reasons.join("；"))}</td>
        </tr>
      `
    )
    .join("");
}

function addLeadFromForm(form) {
  const formData = new FormData(form);
  const lead = Object.fromEntries(formData.entries());
  lead.id = crypto.randomUUID();
  lead.createdAt = new Date().toISOString();
  leads.unshift(normalizeLead(lead));
  saveLeads();
  render();
  activateTab("leads");
}

function activateTab(tabId) {
  navItems.forEach((nav) => nav.classList.toggle("active", nav.dataset.tab === tabId));
  tabPanels.forEach((panel) => panel.classList.toggle("active", panel.id === tabId));
}

function buildEmailGuesses(name, domain) {
  if (!name || !domain) return [];
  const parts = name.toLowerCase().replace(/[^a-z\s.-]/g, "").split(/\s+/).filter(Boolean);
  if (!parts.length) return [];

  const first = parts[0];
  const last = parts.at(-1);
  const firstInitial = first[0];
  const lastInitial = last[0];
  const patterns = [first, `${first}.${last}`, `${first}_${last}`, `${first}${last}`, `${firstInitial}${last}`, `${first}.${lastInitial}`, `${last}.${first}`, `${last}${firstInitial}`];
  return [...new Set(patterns)].map((local) => `${local}@${domain}`);
}

function extractDomain(value) {
  if (!value) return "";
  try {
    const url = value.startsWith("http") ? new URL(value) : new URL(`https://${value}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return value.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  }
}

function joinUrl(base, path) {
  const normalized = base.startsWith("http") ? base : `https://${base}`;
  return `${normalized.replace(/\/+$/, "")}/${path}`;
}

function appendNote(current, note) {
  return current ? `${current}\n${note}` : note;
}

function render() {
  renderLeadTable();
  renderLeadSelect();
  renderPipeline();
  leadCount.textContent = `${leads.length} 个线索`;
}

function renderLeadTable() {
  const filtered = leads.filter((lead) => {
    const haystack = [lead.company, lead.name, lead.email, lead.region, lead.title].join(" ").toLowerCase();
    return !activeSearch || haystack.includes(activeSearch);
  });

  if (!filtered.length) {
    leadTable.innerHTML = document.querySelector("#emptyStateTemplate").innerHTML;
    return;
  }

  leadTable.innerHTML = filtered
    .map(
      (lead) => `
        <tr>
          <td><strong>${escapeHtml(lead.company)}</strong><br><span>${escapeHtml(lead.website)}</span></td>
          <td>${escapeHtml(lead.name)}<br><span>${escapeHtml(lead.title)}</span></td>
          <td>${escapeHtml(lead.email)}<br><span>${escapeHtml(lead.source)}</span></td>
          <td>
            <select class="status-select" data-id="${lead.id}">
              ${statuses.map((status) => `<option ${status === lead.status ? "selected" : ""}>${status}</option>`).join("")}
            </select>
          </td>
          <td><button class="small-button" data-delete="${lead.id}" type="button">删除</button></td>
        </tr>
      `
    )
    .join("");

  document.querySelectorAll(".status-select").forEach((select) => {
    select.addEventListener("change", (event) => {
      updateLead(event.target.dataset.id, { status: event.target.value });
    });
  });

  document.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      leads = leads.filter((lead) => lead.id !== button.dataset.delete);
      saveLeads();
      render();
    });
  });
}

function renderLeadSelect() {
  if (!leads.length) {
    leadSelect.innerHTML = `<option value="">暂无线索</option>`;
    return;
  }

  leadSelect.innerHTML = leads
    .map((lead) => `<option value="${lead.id}">${escapeHtml(lead.company)} - ${escapeHtml(lead.name || "未填联系人")}</option>`)
    .join("");
}

function renderPipeline() {
  pipelineBoard.innerHTML = statuses
    .map((status) => {
      const laneLeads = leads.filter((lead) => lead.status === status);
      const cards = laneLeads
        .map(
          (lead) => `
            <article class="lead-card">
              <strong>${escapeHtml(lead.company)}</strong>
              <span>${escapeHtml(lead.name || "未填联系人")} ${lead.title ? `· ${escapeHtml(lead.title)}` : ""}</span>
              <span>${escapeHtml(lead.region || "未填地区")} · ${escapeHtml(lead.source)}</span>
            </article>
          `
        )
        .join("");

      return `
        <section class="lane">
          <h2>${status}<span>${laneLeads.length}</span></h2>
          ${cards || `<div class="empty">暂无</div>`}
        </section>
      `;
    })
    .join("");
}

function updateLead(id, patch) {
  leads = leads.map((lead) => (lead.id === id ? { ...lead, ...patch } : lead));
  saveLeads();
  render();
}

function normalizeLead(lead) {
  return {
    id: lead.id || crypto.randomUUID(),
    company: String(lead.company || "").trim(),
    website: String(lead.website || "").trim(),
    name: String(lead.name || "").trim(),
    title: String(lead.title || "").trim(),
    email: String(lead.email || "").trim(),
    region: String(lead.region || "").trim(),
    source: String(lead.source || "手动录入").trim(),
    status: statuses.includes(lead.status) ? lead.status : "待研究",
    notes: String(lead.notes || "").trim(),
    emailVerification: lead.emailVerification || "",
    emailVerifiedAt: lead.emailVerifiedAt || "",
    createdAt: lead.createdAt || new Date().toISOString(),
  };
}

function loadLeads() {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || "[]");
  } catch {
    return [];
  }
}

function saveLeads() {
  localStorage.setItem(storageKey, JSON.stringify(leads));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const headers = rows.shift()?.map((header) => header.trim()) || [];
  return rows
    .filter((items) => items.some((item) => item.trim()))
    .map((items) => Object.fromEntries(headers.map((header, index) => [header, items[index]?.trim() || ""])));
}

function csvEscape(value) {
  const text = String(value).replaceAll('"', '""');
  return /[",\n\r]/.test(text) ? `"${text}"` : text;
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

render();
loadApiSettings();
