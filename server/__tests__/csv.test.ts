import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/csv";

describe("CSV preview parser", () => {
  it("handles quoted commas, doubled quotes and line breaks inside quotes", () => {
    const text = 'name,note\r\n"Smith, J","said ""hi""\nthen left"\nplain,x';
    expect(parseCsv(text, 100)).toEqual({
      rows: [["name", "note"], ["Smith, J", 'said "hi"\nthen left'], ["plain", "x"]],
      truncated: false,
    });
  });

  it("keeps empty fields and ignores one trailing line break", () => {
    expect(parseCsv("a,,c\n,\n", 100).rows).toEqual([["a", "", "c"], ["", ""]]);
  });

  it("stops after maxRows and says more followed", () => {
    expect(parseCsv("1\n2\n3\n", 2)).toEqual({ rows: [["1"], ["2"]], truncated: true });
    expect(parseCsv("1\n2\n", 2)).toEqual({ rows: [["1"], ["2"]], truncated: false });
  });
});
