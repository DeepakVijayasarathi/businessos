/**
 * Converts an array of objects to a CSV string. Header order follows the
 * `headers` array; values are read via dot-free key lookup (use `accessor`
 * for nested/derived fields the plain key can't reach).
 */
function toCsv(rows, headers) {
  const cols = headers.map((h) => (typeof h === 'string' ? { key: h, label: h } : h));
  const headerLine = cols.map((c) => c.label).join(',');
  const lines = rows.map((row) =>
    cols.map((c) => {
      const value = c.accessor ? c.accessor(row) : row[c.key];
      return `"${String(value ?? '').replace(/"/g, '""')}"`;
    }).join(',')
  );
  return [headerLine, ...lines].join('\n');
}

function sendCsv(res, filename, rows, headers) {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(toCsv(rows, headers));
}

module.exports = { toCsv, sendCsv };
