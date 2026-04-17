const axios = require('axios');

const GOOGLE_TEXT_SEARCH_URL = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const PAGE_SIZE = 20;
const MAX_PAGES_PER_QUERY = 3;
const NEXT_PAGE_TOKEN_DELAY_MS = 2000;
const NEXT_PAGE_TOKEN_MAX_RETRIES = 3;
const DEFAULT_TARGET_RESULTS = 200;

class GooglePlacesError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.name = 'GooglePlacesError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

const client = axios.create({
  timeout: 15000,
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getApiKey = () => {
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey || apiKey === 'your_api_key_here') {
    throw new GooglePlacesError(
      'Google Places API key is not configured. Set GOOGLE_API_KEY in the backend .env file.',
      500
    );
  }

  return apiKey;
};

const parseQueryTerms = (query) => {
  return [...new Set(
    String(query)
      .split(/[,\n|]+/)
      .map((term) => term.trim())
      .filter(Boolean)
  )];
};

const buildQueryVariants = (queryTerms, location) => {
  const variants = [];

  for (const term of queryTerms) {
    variants.push(`${term} in ${location}`);
    variants.push(`${term} near ${location}`);
    variants.push(`${term} ${location}`);
  }

  return [...new Set(variants)];
};

const normalizeBusiness = (place) => ({
  placeId: place.place_id || null,
  name: place.name || '',
  address: place.formatted_address || place.vicinity || '',
  rating: typeof place.rating === 'number' ? place.rating : null,
  category: Array.isArray(place.types) && place.types.length > 0 ? place.types[0] : '',
  latitude: place.geometry?.location?.lat ?? null,
  longitude: place.geometry?.location?.lng ?? null,
});

const buildDeduplicationKey = (business) => {
  if (business.placeId) {
    return business.placeId;
  }

  return [
    business.name.trim().toLowerCase(),
    business.address.trim().toLowerCase(),
    business.latitude ?? '',
    business.longitude ?? '',
  ].join('|');
};

const mapGoogleStatusToError = (status, errorMessage) => {
  const message = errorMessage || `Google Places API returned status ${status}`;

  switch (status) {
    case 'ZERO_RESULTS':
      return new GooglePlacesError('No businesses found for the supplied search criteria.', 404, { status });
    case 'INVALID_REQUEST':
      return new GooglePlacesError(message, 400, { status });
    case 'REQUEST_DENIED':
    case 'OVER_DAILY_LIMIT':
    case 'OVER_QUERY_LIMIT':
      return new GooglePlacesError(message, 502, { status });
    default:
      return new GooglePlacesError(message, 502, { status });
  }
};

const fetchTextSearchPage = async ({ query, pagetoken }) => {
  const apiKey = getApiKey();

  try {
    const response = await client.get(GOOGLE_TEXT_SEARCH_URL, {
      params: {
        key: apiKey,
        query,
        pagetoken,
      },
    });

    return response.data;
  } catch (error) {
    if (error.response) {
      throw new GooglePlacesError(
        'Google Places API request failed.',
        error.response.status,
        error.response.data
      );
    }

    throw new GooglePlacesError('Failed to connect to Google Places API.', 502, {
      message: error.message,
    });
  }
};

const fetchPageWithPaginationRetry = async ({ query, pagetoken }) => {
  const isPaginatedRequest = Boolean(pagetoken);

  for (let attempt = 0; attempt <= NEXT_PAGE_TOKEN_MAX_RETRIES; attempt += 1) {
    const data = await fetchTextSearchPage({ query, pagetoken });

    if (
      isPaginatedRequest &&
      data.status === 'INVALID_REQUEST' &&
      attempt < NEXT_PAGE_TOKEN_MAX_RETRIES
    ) {
      await delay(NEXT_PAGE_TOKEN_DELAY_MS);
      continue;
    }

    return data;
  }
};

const fetchResultsForSingleQuery = async (query) => {
  const pages = [];
  let pageToken = null;

  for (let page = 0; page < MAX_PAGES_PER_QUERY; page += 1) {
    if (page > 0) {
      await delay(NEXT_PAGE_TOKEN_DELAY_MS);
    }

    const data = await fetchPageWithPaginationRetry({
      query,
      pagetoken: pageToken,
    });

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      throw mapGoogleStatusToError(data.status, data.error_message);
    }

    if (data.status === 'ZERO_RESULTS') {
      break;
    }

    pages.push(...(data.results || []));

    if (!data.next_page_token) {
      break;
    }

    pageToken = data.next_page_token;
  }

  return pages;
};

const dedupeBusinesses = (businesses) => {
  const seen = new Set();
  const uniqueBusinesses = [];

  for (const business of businesses) {
    const key = buildDeduplicationKey(business);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueBusinesses.push(business);
  }

  return uniqueBusinesses;
};

const searchBusinesses = async ({ query, location, targetResults = DEFAULT_TARGET_RESULTS }) => {
  const queryTerms = parseQueryTerms(query);
  const normalizedLocation = String(location || '').trim();

  if (queryTerms.length === 0) {
    throw new GooglePlacesError('At least one query term is required.', 400);
  }

  if (!normalizedLocation) {
    throw new GooglePlacesError('A location is required.', 400);
  }

  const combinedQueries = buildQueryVariants(queryTerms, normalizedLocation);
  const collectedBusinesses = [];
  const attemptedQueries = [];

  for (const searchQuery of combinedQueries) {
    attemptedQueries.push(searchQuery);

    const places = await fetchResultsForSingleQuery(searchQuery);
    const normalizedBusinesses = places.map(normalizeBusiness);

    collectedBusinesses.push(...normalizedBusinesses);

    const uniqueCount = dedupeBusinesses(collectedBusinesses).length;
    if (uniqueCount >= targetResults) {
      break;
    }
  }

  const businesses = dedupeBusinesses(collectedBusinesses);

  return {
    businesses,
    meta: {
      requestedQuery: query,
      parsedQueries: queryTerms,
      attemptedQueries,
      requestedLocation: normalizedLocation,
      totalResults: businesses.length,
      minimumResultsReached: businesses.length >= Math.min(targetResults, 60),
      targetResults,
      maxResultsPerQuery: PAGE_SIZE * MAX_PAGES_PER_QUERY,
    },
  };
};

module.exports = {
  GooglePlacesError,
  searchBusinesses,
};
