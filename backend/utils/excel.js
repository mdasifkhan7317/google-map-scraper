const XLSX = require('xlsx');

const EXCEL_COLUMNS = [
  'name',
  'address',
  'rating',
];

const createBusinessWorkbookBuffer = (businesses) => {
  const rows = businesses.map((business) => ({
    name: business.name,
    address: business.address,
    rating: business.rating,
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
