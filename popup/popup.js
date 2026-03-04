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

// --- DOM helpers ---
function $(id) { return document.getElementById(id); }

function showState(name) {
  ['not-linkedin', 'idle', 'loading', 'error', 'results'].forEach((s) => {
    $(`state-${s}`).classList.toggle('hidden', s !== name);
  });
}

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
  } catch (err) {
    let msg = err.message;
    // Common Chrome error when content script isn't injected yet
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
