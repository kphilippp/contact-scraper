/**
 * LinkedIn Contact Scraper — Popup Script
 */

const FIELD_DEFS = [
  { key: 'name',      label: 'Name' },
  { key: 'headline',  label: 'Headline' },
  { key: 'company',   label: 'Company' },
  { key: 'location',  label: 'Location' },
  { key: 'linkedin',  label: 'LinkedIn',  isLink: true },
  { key: 'email',     label: 'Email',     isEmail: true },
  { key: 'phone',     label: 'Phone' },
  { key: 'websites',  label: 'Website',   isArray: true, isLink: true },
];

// Ranked by global frequency across companies
const EMAIL_PATTERNS = [
  (f, l) => `${f}.${l}`,        // firstname.lastname  ~42%
  (f, l) => f,                  // firstname            ~20%
  (f, l) => `${f[0]}${l}`,     // flastname            ~15%
  (f, l) => `${f}${l}`,        // firstnamelastname    ~8%
  (f, l) => l,                  // lastname             ~6%
  (f, l) => `${f[0]}.${l}`,    // f.lastname           ~5%
  (f, l) => `${l}${f[0]}`,     // lastnamef            ~2%
  (f, l) => `${l}.${f}`,       // lastname.firstname   ~2%
];

// --- DOM helpers ---
function $(id) { return document.getElementById(id); }

function showState(name) {
  ['not-linkedin', 'idle', 'loading', 'error', 'results'].forEach((s) => {
    $(`state-${s}`).classList.toggle('hidden', s !== name);
  });
}

// --- Email suggestion helpers ---

function extractDomainFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch { return null; }
}

function inferDomainFromCompany(company) {
  if (!company) return null;
  const cleaned = company
    .toLowerCase()
    .replace(/\b(inc|llc|corp|ltd|co|company|group|holdings|international|global|the|and|&)\b\.?/g, ' ')
    .replace(/[^a-z0-9]/g, '')
    .trim();
  return cleaned ? `${cleaned}.com` : null;
}

function parseName(fullName) {
  if (!fullName) return null;
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  return {
    first: parts[0].toLowerCase().replace(/[^a-z]/g, ''),
    last: parts[parts.length - 1].toLowerCase().replace(/[^a-z]/g, ''),
  };
}

async function validateDomainMX(domain) {
  try {
    const res = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`
    );
    const json = await res.json();
    return json.Status === 0 && Array.isArray(json.Answer) && json.Answer.length > 0;
  } catch {
    return false;
  }
}

async function buildEmailSuggestions(data) {
  // 1. Find domain
  let domain = null;
  const allWebsites = [
    ...(data.websites || []),
    data.companyWebsite,
  ].filter(Boolean);

  for (const url of allWebsites) {
    const d = extractDomainFromUrl(url);
    if (d) { domain = d; break; }
  }

  if (!domain) domain = inferDomainFromCompany(data.company);
  if (!domain) return { status: 'no-domain' };

  // 2. Validate domain accepts email
  const hasMX = await validateDomainMX(domain);
  if (!hasMX) return { status: 'invalid-domain', domain };

  // 3. Generate patterns
  const name = parseName(data.name);
  if (!name || !name.first || !name.last) return { status: 'no-name', domain };

  const patterns = EMAIL_PATTERNS.map((fn, i) => ({
    email: `${fn(name.first, name.last)}@${domain}`,
    mostLikely: i === 0,
  }));

  return { status: 'ok', domain, patterns };
}

// --- Render ---

function renderFields(data) {
  const container = $('fields-container');
  container.innerHTML = '';

  for (const def of FIELD_DEFS) {
    const raw = data[def.key];
    const hasValue = def.isArray ? (Array.isArray(raw) && raw.length > 0) : !!raw;

    const field = document.createElement('div');
    field.className = 'field';

    const label = document.createElement('div');
    label.className = 'field-label';
    label.textContent = def.label;

    const value = document.createElement('div');
    value.className = 'field-value' + (hasValue ? '' : ' empty');

    if (!hasValue) {
      value.textContent = '—';
    } else if (def.isArray) {
      raw.forEach((url, i) => {
        if (i > 0) value.appendChild(document.createElement('br'));
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = url;
        value.appendChild(a);
      });
    } else if (def.isLink) {
      const a = document.createElement('a');
      a.href = raw;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = raw;
      value.appendChild(a);
    } else if (def.isEmail) {
      const a = document.createElement('a');
      a.href = `mailto:${raw}`;
      a.textContent = raw;
      value.appendChild(a);
    } else {
      value.textContent = raw;
    }

    field.appendChild(label);
    field.appendChild(value);
    container.appendChild(field);
  }
}

function renderEmailSuggestions(result) {
  const section = $('email-suggestions');
  const loading = $('suggestions-loading');
  const list = $('suggestions-list');
  const noResult = $('suggestions-no-result');

  // Reset
  list.innerHTML = '';
  noResult.classList.add('hidden');
  loading.classList.add('hidden');

  if (result.status === 'no-domain' || result.status === 'no-name') {
    noResult.textContent = result.status === 'no-name'
      ? "Couldn't parse first/last name."
      : "Couldn't determine company domain.";
    noResult.classList.remove('hidden');
  } else if (result.status === 'invalid-domain') {
    noResult.textContent = `Domain "${result.domain}" doesn't appear to accept email.`;
    noResult.classList.remove('hidden');
  } else {
    result.patterns.forEach(({ email, mostLikely }) => {
      const row = document.createElement('div');
      row.className = 'suggestion-row';

      const emailSpan = document.createElement('span');
      emailSpan.className = 'suggestion-email';
      emailSpan.textContent = email;

      const right = document.createElement('div');
      right.className = 'suggestion-right';

      if (mostLikely) {
        const badge = document.createElement('span');
        badge.className = 'badge-likely';
        badge.textContent = 'Most likely';
        right.appendChild(badge);
      }

      const copyBtn = document.createElement('button');
      copyBtn.className = 'btn-copy-small';
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(email).then(() => {
          copyBtn.textContent = 'Copied!';
          setTimeout(() => (copyBtn.textContent = 'Copy'), 1500);
        });
      });
      right.appendChild(copyBtn);

      row.appendChild(emailSpan);
      row.appendChild(right);
      list.appendChild(row);
    });
  }

  section.classList.remove('hidden');
}

function buildCopyText(data) {
  const lines = [];
  if (data.name)     lines.push(`Name:     ${data.name}`);
  if (data.headline) lines.push(`Headline: ${data.headline}`);
  if (data.company)  lines.push(`Company:  ${data.company}`);
  if (data.location) lines.push(`Location: ${data.location}`);
  if (data.linkedin) lines.push(`LinkedIn: ${data.linkedin}`);
  if (data.email)    lines.push(`Email:    ${data.email}`);
  if (data.phone)    lines.push(`Phone:    ${data.phone}`);
  if (data.websites && data.websites.length > 0) {
    data.websites.forEach((url) => lines.push(`Website:  ${url}`));
  }
  return lines.join('\n');
}

// --- Core logic ---
let lastData = null;

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function scrape() {
  const tab = await getActiveTab();

  if (!tab.url || !tab.url.includes('linkedin.com/in/')) {
    showState('not-linkedin');
    return;
  }

  showState('loading');

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_CONTACT' });

    if (!response || !response.success) {
      throw new Error(response?.error || 'No response from page. Try refreshing the LinkedIn profile.');
    }

    lastData = response.data;
    renderFields(lastData);
    showState('results');

    // If no email found, auto-generate suggestions
    if (!lastData.email) {
      $('suggestions-loading').classList.remove('hidden');
      $('email-suggestions').classList.remove('hidden');

      const suggestions = await buildEmailSuggestions(lastData);
      renderEmailSuggestions(suggestions);
    } else {
      $('email-suggestions').classList.add('hidden');
    }
  } catch (err) {
    let msg = err.message;
    if (msg.includes('Could not establish connection') || msg.includes('Receiving end does not exist')) {
      msg = 'Could not connect to the page. Please refresh the LinkedIn profile and try again.';
    }
    $('error-message').textContent = msg;
    showState('error');
  }
}

function copyAll() {
  if (!lastData) return;
  const text = buildCopyText(lastData);
  navigator.clipboard.writeText(text).then(() => {
    const feedback = $('copy-feedback');
    feedback.classList.remove('hidden');
    setTimeout(() => feedback.classList.add('hidden'), 2000);
  });
}

// --- Init ---
document.addEventListener('DOMContentLoaded', async () => {
  const tab = await getActiveTab();
  if (!tab.url || !tab.url.includes('linkedin.com/in/')) {
    showState('not-linkedin');
  } else {
    showState('idle');
  }

  $('btn-scrape').addEventListener('click', scrape);
  $('btn-retry').addEventListener('click', scrape);
  $('btn-rescrape').addEventListener('click', scrape);
  $('btn-copy').addEventListener('click', copyAll);
});
