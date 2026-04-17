const puppeteer = require('puppeteer');

const GOOGLE_MAPS_URL = 'https://www.google.com/maps';
const SCROLL_ITERATIONS = 18;
const SCROLL_DELAY_MS = 1500;
const NAVIGATION_TIMEOUT_MS = 60000;

class ScraperError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.name = 'ScraperError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const buildDeduplicationKey = (business) =>
  [business.name, business.address, business.rating]
    .map((value) => normalizeText(value).toLowerCase())
    .join('|');

const dedupeBusinesses = (businesses) => {
  const seen = new Set();
  const uniqueBusinesses = [];

  for (const business of businesses) {
    const key = buildDeduplicationKey(business);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueBusinesses.push(business);
  }

  return uniqueBusinesses;
};

const scrapeCardsFromPage = async (page) => {
  return page.evaluate(
    ({ normalizeWhitespaceSource }) => {
      const normalizeWhitespace = (value) =>
        String(value || '')
          .replace(new RegExp(normalizeWhitespaceSource, 'g'), ' ')
          .trim();

      const extractAddress = (textLines) => {
        for (const line of textLines) {
          const cleanedLine = normalizeWhitespace(line);

          if (!cleanedLine) {
            continue;
          }

          if (
            /^(open|closed|closes|opens|busy|less busy|more busy|website|directions|call|hours?)\b/i.test(
              cleanedLine
            )
          ) {
            continue;
          }

          if (
            /\b(st|street|rd|road|ave|avenue|ln|lane|dr|drive|blvd|boulevard|nagar|sector|market|marg|cross|floor|building|plaza|complex|mall|colony|area|near)\b/i.test(
              cleanedLine
            )
          ) {
            return cleanedLine.split('·').pop().trim();
          }

          const bulletSegments = cleanedLine
            .split('·')
            .map((segment) => normalizeWhitespace(segment))
            .filter(Boolean);

          if (bulletSegments.length >= 2) {
            return bulletSegments[bulletSegments.length - 1];
          }
        }

        return '';
      };

      const extractRating = (card) => {
        const ratingNode =
          card.querySelector('span[role="img"]') ||
          card.querySelector('.MW4etd') ||
          card.querySelector('[aria-label*="stars"]');

        if (!ratingNode) {
          return '';
        }

        const ariaLabel = normalizeWhitespace(ratingNode.getAttribute('aria-label'));
        const nodeText = normalizeWhitespace(ratingNode.textContent);
        const ratingMatch = (ariaLabel || nodeText).match(/\d+(?:\.\d+)?/);

        return ratingMatch ? ratingMatch[0] : '';
      };

      const getName = (card) => {
        const selectors = ['.qBF1Pd', '.fontHeadlineSmall', '[aria-label][role="link"]'];

        for (const selector of selectors) {
          const node = card.querySelector(selector);
          const text = normalizeWhitespace(
            node?.textContent || node?.getAttribute('aria-label')
          );

          if (text) {
            return text;
          }
        }

        const cardText = normalizeWhitespace(card.innerText);
        return normalizeWhitespace(cardText.split('\n')[0]);
      };

      const cards = Array.from(document.querySelectorAll('div.Nv2PK'));

      return cards
        .map((card) => {
          const name = getName(card);
          const rating = extractRating(card);
          const lines = normalizeWhitespace(card.innerText)
            .split('\n')
            .map((line) => normalizeWhitespace(line))
            .filter(Boolean);
          const address = extractAddress(lines);

          return {
            name,
            rating,
            address,
          };
        })
        .filter((business) => business.name);
    },
    { normalizeWhitespaceSource: '\\s+' }
  );
};

const autoScrollResults = async (page, iterations = SCROLL_ITERATIONS) => {
  await page.waitForSelector('div[role="feed"]', {
    timeout: NAVIGATION_TIMEOUT_MS,
  });

  let previousHeight = 0;

  for (let index = 0; index < iterations; index += 1) {
    const currentHeight = await page.evaluate(() => {
      const feed = document.querySelector('div[role="feed"]');

      if (!feed) {
        return 0;
      }

      feed.scrollBy(0, feed.scrollHeight);
      return feed.scrollHeight;
    });

    await delay(SCROLL_DELAY_MS);

    if (currentHeight === previousHeight) {
      continue;
    }

    previousHeight = currentHeight;
  }
};

const waitForResults = async (page) => {
  await Promise.race([
    page.waitForSelector('div[role="feed"]', {
      timeout: NAVIGATION_TIMEOUT_MS,
    }),
    page.waitForSelector('div.Nv2PK', {
      timeout: NAVIGATION_TIMEOUT_MS,
    }),
  ]);
};

const scrapeGoogleMaps = async ({ query, location }) => {
  const safeQuery = normalizeText(query);
  const safeLocation = normalizeText(location);

  if (!safeQuery) {
    throw new ScraperError('Query parameter "query" is required.', 400);
  }

  if (!safeLocation) {
    throw new ScraperError('Query parameter "location" is required.', 400);
  }

  let browser;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1024 });
    await page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);

    const searchText = `${safeQuery} ${safeLocation}`;
    const searchUrl = `${GOOGLE_MAPS_URL}/search/${encodeURIComponent(searchText)}`;

    await page.goto(searchUrl, {
      waitUntil: 'networkidle2',
      timeout: NAVIGATION_TIMEOUT_MS,
    });

    await waitForResults(page);
    await delay(2500);
    await autoScrollResults(page);

    const businesses = dedupeBusinesses(await scrapeCardsFromPage(page));

    return businesses.map((business) => ({
      name: normalizeText(business.name) || 'N/A',
      rating: normalizeText(business.rating) || 'N/A',
      address: normalizeText(business.address) || 'N/A',
    }));
  } catch (error) {
    if (error instanceof ScraperError) {
      throw error;
    }

    throw new ScraperError('Failed to scrape Google Maps results.', 500, {
      message: error.message,
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};

module.exports = {
  ScraperError,
  scrapeGoogleMaps,
};
