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

const extractCityFromAddress = (address, fallbackCity = 'N/A') => {
  const normalizedAddress = normalizeText(address);
  const normalizedFallbackCity = normalizeText(fallbackCity);
  const addressLikePattern =
    /\b(road|rd|street|st|sector|tower|complex|park|hotel|block|phase|plot|floor|building|plaza|mall|unit|colony|nagar|marg|cross|near|opposite)\b/i;
  const knownStates = [
    'andhra pradesh',
    'arunachal pradesh',
    'assam',
    'bihar',
    'chhattisgarh',
    'goa',
    'gujarat',
    'haryana',
    'himachal pradesh',
    'jharkhand',
    'karnataka',
    'kerala',
    'madhya pradesh',
    'maharashtra',
    'manipur',
    'meghalaya',
    'mizoram',
    'nagaland',
    'odisha',
    'punjab',
    'rajasthan',
    'sikkim',
    'tamil nadu',
    'telangana',
    'tripura',
    'uttar pradesh',
    'uttarakhand',
    'west bengal',
    'delhi',
  ];

  if (!normalizedAddress || normalizedAddress === 'N/A') {
    return normalizedFallbackCity || 'N/A';
  }

  const commaSegments = normalizedAddress
    .split(',')
    .map((segment) => normalizeText(segment))
    .filter(Boolean);

  if (
    normalizedFallbackCity &&
    commaSegments.some(
      (segment) => segment.toLowerCase() === normalizedFallbackCity.toLowerCase()
    )
  ) {
    return normalizedFallbackCity;
  }

  const stateIndex = commaSegments.findIndex((segment) =>
    knownStates.includes(segment.toLowerCase().replace(/\b\d{5,6}\b/g, '').trim())
  );

  if (stateIndex > 0) {
    const previousSegment = normalizeText(commaSegments[stateIndex - 1]);

    if (
      previousSegment &&
      !/\d{5,6}/.test(previousSegment) &&
      !addressLikePattern.test(previousSegment)
    ) {
      return previousSegment;
    }
  }

  for (let index = commaSegments.length - 1; index >= 0; index -= 1) {
    const candidate = commaSegments[index]
      .replace(/\b\d{5,6}\b/g, '')
      .replace(
        /\b(india|maharashtra|delhi|karnataka|telangana|gujarat|rajasthan|uttar pradesh|madhya pradesh|west bengal|tamil nadu|punjab|haryana|kerala|bihar|odisha|assam|jharkhand|chhattisgarh|andhra pradesh)\b/gi,
        ''
      );
    const normalizedCandidate = normalizeText(candidate);

    if (
      normalizedCandidate &&
      !/\d/.test(normalizedCandidate) &&
      !addressLikePattern.test(normalizedCandidate)
    ) {
      return normalizedCandidate;
    }
  }

  return normalizedFallbackCity || 'N/A';
};

const buildDeduplicationKey = (business) =>
  [business.companyName, business.location, business.rating]
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

      const phonePattern =
        /(?:\+91[\s-]?)?(?:0?\d{10}|(?:\d{3,5}[\s-]\d{5,8}))/;

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

        return '';
      };

      const getRating = (card) => {
        const ratingNode =
          card.querySelector('span[role="img"]') ||
          card.querySelector('.MW4etd') ||
          card.querySelector('[aria-label*="stars"]');

        if (!ratingNode) {
          return '';
        }

        const ratingSource = normalizeWhitespace(
          ratingNode.getAttribute('aria-label') || ratingNode.textContent
        );
        const match = ratingSource.match(/\d+(?:\.\d+)?/);

        return match ? match[0] : '';
      };

      const getCategory = (lines) => {
        for (const line of lines) {
          const cleanedLine = normalizeWhitespace(line);

          if (
            !cleanedLine ||
            /^(open|closed|closes|opens|hours?|website|directions|call)\b/i.test(
              cleanedLine
            )
          ) {
            continue;
          }

          const bulletSegments = cleanedLine
            .split('·')
            .map((segment) => normalizeWhitespace(segment))
            .filter(Boolean);

          if (bulletSegments.length >= 2 && !phonePattern.test(bulletSegments[0])) {
            return bulletSegments[0];
          }
        }

        return '';
      };

      const getAddress = (lines) => {
        for (const line of lines) {
          const cleanedLine = normalizeWhitespace(line);

          if (
            !cleanedLine ||
            /^(open|closed|closes|opens|hours?|website|directions|call)\b/i.test(
              cleanedLine
            )
          ) {
            continue;
          }

          const bulletSegments = cleanedLine
            .split('·')
            .map((segment) => normalizeWhitespace(segment))
            .filter(Boolean);

          if (bulletSegments.length >= 2) {
            const candidate = bulletSegments[bulletSegments.length - 1];

            if (
              candidate &&
              !phonePattern.test(candidate) &&
              !/(website|directions|call)/i.test(candidate)
            ) {
              return candidate;
            }
          }

          if (
            /\b(st|street|rd|road|ave|avenue|ln|lane|dr|drive|blvd|boulevard|nagar|sector|market|marg|cross|floor|building|plaza|complex|mall|colony|area|near|opposite|tower|phase|block)\b/i.test(
              cleanedLine
            ) &&
            !phonePattern.test(cleanedLine)
          ) {
            return cleanedLine;
          }
        }

        return '';
      };

      const getPhone = (lines) => {
        for (const line of lines) {
          const cleanedLine = normalizeWhitespace(line);
          const bulletSegments = cleanedLine
            .split('·')
            .map((segment) => normalizeWhitespace(segment))
            .filter(Boolean);

          for (const segment of [cleanedLine, ...bulletSegments]) {
            const match = segment.match(phonePattern);

            if (match) {
              return normalizeWhitespace(match[0]);
            }
          }
        }

        return '';
      };

      const cards = Array.from(document.querySelectorAll('div.Nv2PK'));

      return cards
        .map((card) => {
          const lines = String(card.innerText || '')
            .split('\n')
            .map((line) => normalizeWhitespace(line))
            .filter(Boolean);

          return {
            companyName: getName(card),
            rating: getRating(card),
            category: getCategory(lines),
            location: getAddress(lines),
            mobile: getPhone(lines),
            website:
              card.querySelector('a[aria-label^="Visit "]')?.href ||
              card.querySelector('a[href^="http"]:not([href*="google.com"])')?.href ||
              '',
          };
        })
        .filter((business) => business.companyName);
    },
    { normalizeWhitespaceSource: '\\s+' }
  );
};

const autoScrollResults = async (
  page,
  iterations = SCROLL_ITERATIONS,
  onProgress = () => {}
) => {
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
    onProgress({
      stage: 'collecting',
      progress: Math.min(85, Math.round(((index + 1) / iterations) * 85)),
    });

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

const scrapeGoogleMaps = async ({ query, location, onProgress = () => {} }) => {
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
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--single-process',
        '--disable-gpu',
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1024 });
    await page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);

    const searchText = `${safeQuery} ${safeLocation}`;
    const searchUrl = `${GOOGLE_MAPS_URL}/search/${encodeURIComponent(searchText)}`;

    onProgress({
      stage: 'opening',
      progress: 5,
      collectedCount: 0,
    });

    await page.goto(searchUrl, {
      waitUntil: 'networkidle2',
      timeout: NAVIGATION_TIMEOUT_MS,
    });

    onProgress({
      stage: 'loading-results',
      progress: 20,
      collectedCount: 0,
    });

    await waitForResults(page);
    await delay(2500);
    await autoScrollResults(page, SCROLL_ITERATIONS, onProgress);

    onProgress({
      stage: 'processing',
      progress: 92,
      collectedCount: 0,
    });

    const businesses = dedupeBusinesses(await scrapeCardsFromPage(page));
    const totalCollected = businesses.length;

    onProgress({
      stage: 'finalizing',
      progress: 98,
      collectedCount: totalCollected,
    });

    const formattedBusinesses = businesses.map((business) => {
      const companyName = normalizeText(business.companyName) || 'N/A';
      const businessLocation = normalizeText(business.location) || 'N/A';
      const category = normalizeText(business.category || safeQuery) || 'N/A';
      const mobile = normalizeText(business.mobile) || 'N/A';
      const website = normalizeText(business.website) || 'N/A';
      const rating = normalizeText(business.rating) || 'N/A';
      const city = extractCityFromAddress(businessLocation, safeLocation);

      return {
        companyName,
        mobile,
        website,
        location: businessLocation,
        category,
        city,
        rating,
        name: companyName,
        address: businessLocation,
      };
    });

    onProgress({
      stage: 'completed',
      progress: 100,
      collectedCount: formattedBusinesses.length,
    });

    return formattedBusinesses;
  } catch (error) {
    console.error('Scraper failure:', error);

    if (error instanceof ScraperError) {
      throw error;
    }

    throw new ScraperError('Failed to scrape Google Maps results.', 500, {
      message: error.message,
      stack: error.stack,
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
