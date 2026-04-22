const XLSX = require('xlsx');

const EXCEL_COLUMNS = [
  'Company Name',
  'Mobile',
  'Website',
  'Location',
  'Category',
  'City',
  'Rating',
];

const createBusinessWorkbookBuffer = (businesses) => {
  const rows = businesses.map((business) => ({
    'Company Name': business.companyName || business.name || 'N/A',
    Mobile: business.mobile || 'N/A',
    Website: business.website || 'N/A',
    Location: business.location || business.address || 'N/A',
    Category: business.category || 'N/A',
    City: business.city || 'N/A',
    Rating: business.rating || 'N/A',
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: EXCEL_COLUMNS,
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Businesses');

  return XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
  });
};

module.exports = {
  createBusinessWorkbookBuffer,
};
