const express = require('express');
const cors = require('cors');

// require('dotenv').config();

const { scrapeGoogleMaps, ScraperError } = require('./scraper');
const { createBusinessWorkbookBuffer } = require('./utils/excel');

const app = express();
const port = 5000;

let latestSearchCache = {
  businesses: [],
  query: '',
  location: '',
  createdAt: null,
};

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/api/search', async (req, res, next) => {
  try {
    const { query, location } = req.query;

    if (!query || !String(query).trim()) {
      throw new ScraperError('Query parameter "query" is required.', 400);
    }

    if (!location || !String(location).trim()) {
      throw new ScraperError('Query parameter "location" is required.', 400);
    }

    const businesses = await scrapeGoogleMaps({
      query: String(query),
      location: String(location),
    });

    latestSearchCache = {
      businesses,
      query: String(query).trim(),
      location: String(location).trim(),
      createdAt: new Date().toISOString(),
    };

    res.status(200).json({
      success: true,
      businesses,
      total: businesses.length,
      query: latestSearchCache.query,
      location: latestSearchCache.location,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/export', async (req, res, next) => {
  try {
    if (!latestSearchCache.businesses || latestSearchCache.businesses.length === 0) {
      throw new ScraperError(
        'No business data available to export. Run /api/search first.',
        400
      );
    }

    const workbookBuffer = createBusinessWorkbookBuffer(latestSearchCache.businesses);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="businesses-${timestamp}.xlsx"`
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    res.status(200).send(workbookBuffer);
  } catch (error) {
    next(error);
  }
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found.',
  });
});

app.use((error, req, res, next) => {
  const statusCode = error.statusCode || 500;
  const isKnownError = error instanceof ScraperError;

  if (!isKnownError && statusCode >= 500) {
    console.error(error);
  }

  res.status(statusCode).json({
    success: false,
    error: error.message || 'Internal server error.',
    details: error.details || null,
  });
});

app.listen(port, () => {
  console.log(`Backend server running on port ${port}`);
});
