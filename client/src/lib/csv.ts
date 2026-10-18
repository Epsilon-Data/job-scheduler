/**
 * Minimal RFC 4180 CSV reader for previews: quoted fields may hold commas, doubled quotes and line breaks;
 * rows end at \n, \r\n or \r. Stops after maxRows rows and says whether more followed.
 */
export function parseCsv(text: string, maxRows: number): { rows: string[][]; truncated: boolean } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;

  const endRow = () => {
    row.push(field);
    rows.push(row);
    row = [];
    field = "";
  };

  while (i < text.length) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else {
        field += c;
      }
      i++;
      continue;
    }

    if (c === '"' && field === "") {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endRow();
      if (rows.length === maxRows) return { rows, truncated: i + 1 < text.length };
    } else {
      field += c;
    }
    i++;
  }

  // A last row without a trailing line break
  if (field !== "" || row.length > 0) endRow();
  return { rows, truncated: false };
}
