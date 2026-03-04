/**
 * LinkedIn Contact Scraper — Content Script
 * Injected on linkedin.com/in/* pages.
 * Responds to SCRAPE_CONTACT messages from the popup.
 */

const SELECTORS = {
  name: [
    'h1.text-heading-xlarge',
    'h1[class*="top-card__title"]',
    '.pv-top-card h1',
  ],
  headline: [
    '.text-body-medium.break-words',
    'div[class*="headline"]',
    '.pv-top-card--list .pv-top-card--experience-list-item',
  ],
  location: [
    '.pv-top-card--list-bullet > li span',
    'span[class*="location"]',
    '.pv-top-card__location-icon + span',
    '.pb2 span[class*="t-black--light"]',
  ],
  company: [
    // Button inside the top card that shows current company
    'button[aria-label*="Current company"] span',
    '.pv-text-details__right-panel .pv-text-details__right-panel-item-text',
    '[class*="top-card-link__description"]',
  ],
};

function queryFirst(selectors) {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.textContent.trim()) return el.textContent.trim();
  }
  return null;
}

function getProfileLinkedInUrl() {
  // Canonical URL for the profile
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) return canonical.href;
  return window.location.href.split('?')[0];
}

function openContactInfoModal() {
  return new Promise((resolve, reject) => {
    // Find the "Contact info" link/button
    const contactLink =
      document.querySelector('a[href*="overlay/contact-info"]') ||
      document.querySelector('a[id*="contact-info"]') ||
      Array.from(document.querySelectorAll('a, button')).find(
        (el) => el.textContent.trim().toLowerCase() === 'contact info'
      );

    if (!contactLink) {
      resolve(null);
      return;
    }

    // Watch for the modal to appear
    const observer = new MutationObserver(() => {
      const modal = document.querySelector(
        '.pv-contact-info, [class*="contact-info"] section, artdeco-modal .pv-contact-info__contact-type, .artdeco-modal__content'
      );
      if (modal) {
        observer.disconnect();
        clearTimeout(timeout);
        resolve(modal);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    const timeout = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, 5000);

    contactLink.click();
  });
}

function extractContactInfoFromModal(modal) {
  const info = { email: null, phone: null, websites: [], linkedin: null };

  if (!modal) return info;

  // Email
  const emailEl = modal.querySelector('a[href^="mailto:"]');
  if (emailEl) info.email = emailEl.textContent.trim() || emailEl.href.replace('mailto:', '');

  // Phone
  const phoneSection = modal.querySelector(
    '[class*="phone"] span, [data-field="phone_number"] span, [class*="contact-type"]:has(svg[data-test-icon*="phone"]) .t-14'
  );
  if (phoneSection) {
    info.phone = phoneSection.textContent.trim();
  } else {
    // Fallback: look for sections that contain phone-like text
    modal.querySelectorAll('section, li, .pv-contact-info__contact-type').forEach((section) => {
      const icon = section.querySelector('svg use[href*="phone"], svg use[xlink\\:href*="phone"], li-icon[type*="phone"]');
      if (icon) {
        const textEl = section.querySelector('span.t-14, span.t-black, a');
        if (textEl) info.phone = textEl.textContent.trim();
      }
    });
  }

  // Websites
  modal.querySelectorAll('a[href]:not([href^="mailto:"])').forEach((a) => {
    const href = a.href;
    if (
      href &&
      !href.includes('linkedin.com') &&
      !href.startsWith('tel:') &&
      !href.startsWith('javascript:')
    ) {
      info.websites.push(href);
    }
  });

  // LinkedIn URL shown in modal
  const liLink = modal.querySelector('a[href*="linkedin.com/in/"]');
  if (liLink) info.linkedin = liLink.href;

  return info;
}

function closeModal() {
  const dismissBtn = document.querySelector(
    'button[aria-label="Dismiss"], button[aria-label="Close"], .artdeco-modal__dismiss'
  );
  if (dismissBtn) dismissBtn.click();
}

function getCompanyWebsite() {
  // Look for external links near the company/top-card area on the main profile page
  const candidates = Array.from(document.querySelectorAll('a[href]'));
  for (const a of candidates) {
    const href = a.href;
    if (
      href &&
      !href.includes('linkedin.com') &&
      !href.startsWith('javascript:') &&
      !href.startsWith('tel:') &&
      !href.startsWith('mailto:') &&
      /^https?:\/\//.test(href)
    ) {
      // Only pick links that are inside the top card or experience sections
      const inTopCard = a.closest(
        '.pv-top-card, .ph5, [class*="top-card"], [class*="experience-section"], [class*="artdeco-card"]'
      );
      if (inTopCard) return href;
    }
  }
  return null;
}

async function scrapeProfile() {
  const result = {
    name: queryFirst(SELECTORS.name),
    headline: queryFirst(SELECTORS.headline),
    location: queryFirst(SELECTORS.location),
    company: queryFirst(SELECTORS.company),
    profileUrl: getProfileLinkedInUrl(),
    companyWebsite: getCompanyWebsite(),
    email: null,
    phone: null,
    websites: [],
    linkedin: null,
  };

  // Try to open and scrape the contact info modal
  const modal = await openContactInfoModal();
  if (modal) {
    // Brief pause to ensure modal is fully rendered
    await new Promise((r) => setTimeout(r, 600));
    const contactInfo = extractContactInfoFromModal(modal);
    result.email = contactInfo.email;
    result.phone = contactInfo.phone;
    result.websites = contactInfo.websites;
    result.linkedin = contactInfo.linkedin || result.profileUrl;
    closeModal();
  }

  // Always include the profile URL as LinkedIn contact
  if (!result.linkedin) result.linkedin = result.profileUrl;

  return result;
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'SCRAPE_CONTACT') {
    scrapeProfile()
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // keep the channel open for async response
  }
});
