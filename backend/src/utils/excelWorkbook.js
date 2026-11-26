import path from 'node:path';
import JSZip from 'jszip';
import { parseCsvRfc4180 } from './security.js';

function escapeXml(str) {
  return String(str ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function decodeXmlEntities(str) {
  return String(str || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function indexToColRef(idx) {
  let n = idx + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function colRefToIndex(ref) {
  const letters = String(ref || '').replace(/\d+$/g, '').toUpperCase();
  let idx = 0;
  for (let i = 0; i < letters.length; i++) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return Math.max(0, idx - 1);
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  const items = [];
  const siRegex = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g;
  let siMatch;
  while ((siMatch = siRegex.exec(xml)) !== null) {
    const inner = siMatch[1];
    const parts = [];
    const tRegex = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
    let tMatch;
    while ((tMatch = tRegex.exec(inner)) !== null) {
      parts.push(decodeXmlEntities(tMatch[1]));
    }
    items.push(parts.join(''));
  }
  return items;
}

function parseWorksheetMatrix(xml, sharedStrings) {
  const rows = [];
  const rowRegex = /<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g;
  let rMatch;
  while ((rMatch = rowRegex.exec(xml)) !== null) {
    const cells = [];
    const cellRegex = /<c\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cMatch;
    while ((cMatch = cellRegex.exec(rMatch[1])) !== null) {
      const attrs = cMatch[1] || '';
      const body = cMatch[2] || '';
      const refMatch = /\br="([A-Za-z]+\d+)"/.exec(attrs);
      const typeMatch = /\bt="([^"]+)"/.exec(attrs);
      const cellType = typeMatch ? typeMatch[1] : 'n';
      const colIdx = refMatch ? colRefToIndex(refMatch[1]) : cells.length;

      let value = '';
      if (cellType === 'inlineStr') {
        const tParts = [];
        const itRegex = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
        let itMatch;
        while ((itMatch = itRegex.exec(body)) !== null) {
          tParts.push(decodeXmlEntities(itMatch[1]));
        }
        value = tParts.join('').trim();
      } else {
        const vMatch = /<v>([\s\S]*?)<\/v>/.exec(body);
        const rawV = vMatch ? decodeXmlEntities(vMatch[1]).trim() : '';
        if (cellType === 's') {
          const sIdx = Number(rawV);
          value = Number.isInteger(sIdx) && sIdx >= 0 ? String(sharedStrings[sIdx] ?? '').trim() : '';
        } else if (cellType === 'str' || cellType === 'e') {
          value = rawV;
        } else {
          value = rawV;
        }
      }

      while (cells.length <= colIdx) cells.push('');
      cells[colIdx] = value;
    }
    if (cells.some((c) => c !== '')) {
      rows.push(cells);
    }
  }
  return rows;
}

/**
 * Generates a valid OOXML (.xlsx) workbook Buffer using JSZip.
 * Supports bold styled header row, auto column widths, numeric cells (t="n"), and text cells (t="inlineStr").
 */
export async function buildXlsxBuffer({
  sheetName = 'Marks',
  headers = [],
  rows = [],
  colWidths = null,
}) {
  const safeSheetName =
    String(sheetName || 'Marks')
      .replace(/[:\\/?*\[\]]/g, ' ')
      .trim()
      .slice(0, 31) || 'Marks';

  const computedWidths = headers.map((h, colIdx) => {
    if (Array.isArray(colWidths) && Number(colWidths[colIdx]) > 0) {
      return Number(colWidths[colIdx]);
    }
    let maxLen = String(h || '').length;
    for (let r = 0; r < rows.length; r++) {
      const cellStr = String(rows[r]?.[colIdx] ?? '');
      if (cellStr.length > maxLen) maxLen = cellStr.length;
    }
    return Math.min(44, Math.max(12, maxLen + 4));
  });

  const colsXml = computedWidths
    .map(
      (w, idx) =>
        `<col min="${idx + 1}" max="${idx + 1}" width="${w}" customWidth="1"/>`
    )
    .join('');

  const buildCellXml = (val, rowNum, colIdx, styleIdx = 0) => {
    const ref = `${indexToColRef(colIdx)}${rowNum}`;
    const styleAttr = styleIdx > 0 ? ` s="${styleIdx}"` : '';
    if (val === null || val === undefined || val === '') {
      return `<c r="${ref}"${styleAttr} t="inlineStr"><is><t></t></is></c>`;
    }
    if (typeof val === 'number' && Number.isFinite(val)) {
      return `<c r="${ref}"${styleAttr} t="n"><v>${val}</v></c>`;
    }
    const text = String(val);
    const needsPreserve = /^\s|\s$/.test(text);
    const spaceAttr = needsPreserve ? ' xml:space="preserve"' : '';
    return `<c r="${ref}"${styleAttr} t="inlineStr"><is><t${spaceAttr}>${escapeXml(
      text
    )}</t></is></c>`;
  };

  const sheetRowsXml = [];
  if (headers.length > 0) {
    const headerCells = headers
      .map((h, colIdx) => buildCellXml(String(h ?? ''), 1, colIdx, 1))
      .join('');
    sheetRowsXml.push(`<row r="1">${headerCells}</row>`);
  }

  for (let r = 0; r < rows.length; r++) {
    const rowNum = r + 2;
    const rowArr = rows[r] || [];
    const cellsXml = headers
      .map((_, colIdx) => buildCellXml(rowArr[colIdx], rowNum, colIdx, 0))
      .join('');
    sheetRowsXml.push(`<row r="${rowNum}">${cellsXml}</row>`);
  }

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${escapeXml(safeSheetName)}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FF111827"/><name val="Calibri"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF3F4F6"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left/><right/><top/><bottom style="thin"><color rgb="FFD1D5DB"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
  </cellXfs>
</styleSheet>`;

  const worksheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>
  <cols>${colsXml}</cols>
  <sheetData>${sheetRowsXml.join('')}</sheetData>
</worksheet>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypesXml);
  zip.file('_rels/.rels', rootRelsXml);
  zip.file('xl/workbook.xml', workbookXml);
  zip.file('xl/_rels/workbook.xml.rels', workbookRelsXml);
  zip.file('xl/styles.xml', stylesXml);
  zip.file('xl/worksheets/sheet1.xml', worksheetXml);

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/**
 * Parses an .xlsx workbook Buffer into a raw 2D array of non-empty cell rows.
 */
export async function parseXlsxBufferToMatrix(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const sharedFile = zip.file('xl/sharedStrings.xml');
  const sharedStrings = sharedFile
    ? parseSharedStrings(await sharedFile.async('string'))
    : [];

  const sheetCandidates = Object.keys(zip.files)
    .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(k))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (sheetCandidates.length === 0) {
    throw new Error('No worksheet found inside the uploaded .xlsx workbook');
  }

  const sheetXml = await zip.file(sheetCandidates[0]).async('string');
  return parseWorksheetMatrix(sheetXml, sharedStrings);
}

/**
 * Parses an uploaded .xlsx, .csv, or .tsv spreadsheet into { headers, rows }.
 */
export async function parseSpreadsheetRows(buffer, filename = '') {
  if (!buffer || buffer.length === 0) {
    throw new Error('Uploaded file is empty');
  }

  const ext = path.extname(String(filename || '')).toLowerCase();
  const isZipMagic =
    buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;

  if (ext === '.xlsx' || isZipMagic) {
    const matrix = await parseXlsxBufferToMatrix(buffer);
    if (matrix.length === 0) {
      return { headers: [], rows: [] };
    }
    return {
      headers: matrix[0].map((h) => String(h ?? '').trim()),
      rows: matrix.slice(1),
    };
  }

  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const matrix =
    ext === '.tsv'
      ? text
          .split(/\r?\n/)
          .filter((l) => l.trim())
          .map((l) => l.split('\t').map((c) => c.trim()))
      : parseCsvRfc4180(text).filter((r) => r.some((c) => String(c || '').trim() !== ''));

  if (matrix.length === 0) {
    return { headers: [], rows: [] };
  }
  return {
    headers: matrix[0].map((h) => String(h ?? '').trim()),
    rows: matrix.slice(1),
  };
}
