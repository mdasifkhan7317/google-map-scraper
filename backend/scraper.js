const puppeteer = require('puppeteer');

const GOOGLE_MAPS_URL = 'https://www.google.com/maps';
const TARGET_RESULT_COUNT = 100;
const MAX_SCROLL_ITERATIONS = 160;
const MAX_EXPANSION_SEARCHES = 6;
const SCROLL_DELAY_MS = 700;
const INITIAL_RESULTS_DELAY_MS = 1200;
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

const buildDeduplicationKey = (business) => {
  const normalizedName = normalizeText(business.companyName).toLowerCase();
  const normalizedWebsite = normalizeText(business.website).toLowerCase();
  const normalizedPhone = normalizeText(business.mobile).toLowerCase();
  const normalizedLocation = normalizeText(business.location).toLowerCase();
  const normalizedCategory = normalizeText(business.category).toLowerCase();
  const normalizedRating = normalizeText(business.rating).toLowerCase();

  return [
    normalizedName,
    normalizedWebsite || normalizedPhone || normalizedLocation || normalizedCategory,
    normalizedLocation || normalizedPhone || normalizedRating,
  ].join('|');
};

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

const mergeBusinesses = (existingBusinesses, newBusinesses) =>
  dedupeBusinesses([...existingBusinesses, ...newBusinesses]);

const rankSearchLocalities = (businesses, fallbackLocation) => {
  const normalizedFallback = normalizeText(fallbackLocation).toLowerCase();
  const localityCounts = new Map();
  const blockedPattern =
    /\b(road|rd|street|st|sector|tower|complex|park|hotel|block|phase|plot|floor|building|plaza|mall|unit|colony|nagar|marg|cross|near|opposite|india)\b/i;

  for (const business of businesses) {
    const addressSegments = normalizeText(business.location)
      .split(',')
      .map((segment) => normalizeText(segment))
      .filter(Boolean);

    for (const segment of addressSegments) {
      const normalizedSegment = segment.toLowerCase();
      const wordCount = segment.split(/\s+/).length;

      if (
        !segment ||
        normalizedSegment === normalizedFallback ||
        normalizedSegment.includes(normalizedFallback) ||
        /\d{3,}/.test(segment) ||
        blockedPattern.test(segment) ||
        wordCount > 4
      ) {
        continue;
      }

      localityCounts.set(segment, (localityCounts.get(segment) || 0) + 1);
    }
  }

  return [...localityCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([segment]) => segment);
};

const createProgressSnapshot = ({
  collectedCount = 0,
  iteration = 0,
  maxIterations = MAX_SCROLL_ITERATIONS,
  targetCount = TARGET_RESULT_COUNT,
}) => {
  const progressFromIterations = Math.round((iteration / Math.max(maxIterations, 1)) * 65);
  const progressFromResults = Math.round((collectedCount / Math.max(targetCount, 1)) * 65);

  return Math.min(88, 20 + Math.max(progressFromIterations, progressFromResults));
};

const scrapeCardsFromPage = async (page) => {
  return page.evaluate(
    ({ normalizeWhitespaceSource }) => {
      const normalizeWhitespace = (value) =>
        String(value || '')
          .replace(new RegExp(normalizeWhitespaceSource, 'g'), ' ')
          .trim();

      const phonePattern =
        /(?:\+91[\s.-]?)?(?:\(0?\d{1,5}\)[\s.-]?)?(?:\d{3,4}[\s.-]?\d{3,4}[\s.-]?\d{3,4}|\d{10,12})/;

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
              const phone = normalizeWhitespace(match[0]);
              // Clean up the phone number to remove extra spaces/dashes
              return phone.replace(/[\s.-]/g, '');
            }
          }
        }

        // Try a broader search if no phone found yet
        for (const line of lines) {
          const cleanedLine = normalizeWhitespace(line);
          // Look for any sequence of digits that could be a phone number
          const matches = cleanedLine.match(/\d{7,}/g);
          if (matches && matches.length > 0) {
            // Find the longest match that looks like a phone number
            const phoneMatch = matches.find(
              (match) => match.length >= 10 && match.length <= 13
            );
            if (phoneMatch) {
              return phoneMatch;
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
  {
    maxIterations = MAX_SCROLL_ITERATIONS,
    targetCount = TARGET_RESULT_COUNT,
    onProgress = () => {},
  } = {}
) => {
  try {
    await page.waitForSelector('div[role="feed"]', {
      timeout: 5000,
    });
  } catch (error) {
    return dedupeBusinesses(await scrapeCardsFromPage(page));
  }

  let businesses = [];
  let stagnantPasses = 0;
  let previousCount = 0;

  for (let index = 0; index < maxIterations; index += 1) {
    const scrollState = await page.evaluate(() => {
      const feed = document.querySelector('div[role="feed"]');

      if (!feed) {
        return {
          feedFound: false,
          clientHeight: 0,
          scrollHeight: 0,
          scrollTop: 0,
        };
      }

      const scrollStep = Math.max(feed.clientHeight * 0.9, 900);
      feed.scrollBy(0, scrollStep);

      return {
        feedFound: true,
        clientHeight: feed.clientHeight,
        scrollHeight: feed.scrollHeight,
        scrollTop: feed.scrollTop,
      };
    });

    await delay(SCROLL_DELAY_MS);

    if (!scrollState.feedFound) {
      break;
    }

    const shouldRefreshCards =
      index === 0 || index % 2 === 1 || businesses.length < targetCount;

    if (shouldRefreshCards) {
      businesses = mergeBusinesses(businesses, await scrapeCardsFromPage(page));
      const collectedCount = businesses.length;

      onProgress({
        stage: 'collecting',
        progress: createProgressSnapshot({
          collectedCount,
          iteration: index + 1,
          maxIterations,
          targetCount,
        }),
        collectedCount,
      });

      if (collectedCount > previousCount) {
        stagnantPasses = 0;
      } else {
        stagnantPasses += 1;
      }

      previousCount = collectedCount;

      if (collectedCount >= targetCount) {
        break;
      }
    }

    const reachedEnd = await page.evaluate(() => {
      const pageText = String(document.body?.innerText || '');
      return /you.{0,2}ve reached the end of the list/i.test(pageText);
    });

    const isNearBottom =
      scrollState.scrollTop + scrollState.clientHeight >= scrollState.scrollHeight - 24;

    if (reachedEnd || (isNearBottom && stagnantPasses >= 4)) {
      break;
    }
  }

  return mergeBusinesses(businesses, await scrapeCardsFromPage(page));
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

const searchGoogleMapsPage = async ({
  page,
  searchText,
  targetCount,
  baseCollectedCount = 0,
  stage = 'loading-results',
  onProgress = () => {},
}) => {
  const searchUrl = `${GOOGLE_MAPS_URL}/search/${encodeURIComponent(searchText)}`;

  onProgress({
    stage,
    progress: baseCollectedCount > 0 ? 24 : 20,
    collectedCount: baseCollectedCount,
  });

  await page.goto(searchUrl, {
    waitUntil: 'domcontentloaded',
    timeout: NAVIGATION_TIMEOUT_MS,
  });

  await waitForResults(page);
  await delay(INITIAL_RESULTS_DELAY_MS);

  return autoScrollResults(page, {
    maxIterations: MAX_SCROLL_ITERATIONS,
    targetCount,
    onProgress: ({ progress, collectedCount, stage: currentStage }) => {
      onProgress({
        stage: stage === 'loading-results' ? currentStage : stage,
        progress,
        collectedCount: baseCollectedCount + collectedCount,
      });
    },
  });
};

const scrapeGoogleMaps = async ({
  query,
  location,
  targetCount = TARGET_RESULT_COUNT,
  onProgress = () => {},
}) => {
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
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (['image', 'media', 'font'].includes(request.resourceType())) {
        request.abort();
        return;
      }

      request.continue();
    });

    onProgress({
      stage: 'opening',
      progress: 5,
      collectedCount: 0,
    });

    let businesses = await searchGoogleMapsPage({
      page,
      searchText: `${safeQuery} ${safeLocation}`,
      targetCount,
      baseCollectedCount: 0,
      onProgress,
    });

    if (businesses.length < targetCount) {
      const searchVariants = [
        `${safeQuery} in ${safeLocation}`,
        `${safeLocation} ${safeQuery}`,
        `${safeQuery} near ${safeLocation}`,
        ...rankSearchLocalities(businesses, safeLocation).map(
          (locality) => `${safeQuery} ${locality} ${safeLocation}`
        ),
      ].filter(
        (searchText, index, searchTexts) =>
          searchTexts.indexOf(searchText) === index &&
          searchText !== `${safeQuery} ${safeLocation}`
      );

      for (
        let index = 0;
        index < searchVariants.length &&
        index < MAX_EXPANSION_SEARCHES &&
        businesses.length < targetCount;
        index += 1
      ) {
        const variant = searchVariants[index];

        onProgress({
          stage: 'expanding-search',
          progress: Math.min(88, 35 + index * 10),
          collectedCount: businesses.length,
        });

        try {
          const additionalBusinesses = await searchGoogleMapsPage({
            page,
            searchText: variant,
            targetCount: Math.max(25, targetCount - businesses.length),
            baseCollectedCount: businesses.length,
            stage: 'expanding-search',
            onProgress,
          });

          businesses = mergeBusinesses(businesses, additionalBusinesses);
        } catch (error) {
          console.warn(`Skipping expansion search "${variant}":`, error.message);
        }
      }
    }

    onProgress({
      stage: 'processing',
      progress: 92,
      collectedCount: businesses.length,
    });

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
