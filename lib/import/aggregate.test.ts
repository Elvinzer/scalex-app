import { describe, expect, it } from "vitest";

import { aggregateColumnValues, aggregateColumnValuesForRows, groupValuesByMonth } from "./aggregate";

describe("groupValuesByMonth", () => {
  it("groups row indexes by calendar month from ISO date strings", () => {
    const dates = ["2026-06-28", "2026-06-29", "2026-07-01", "2026-07-02", "2026-07-03"];
    const buckets = groupValuesByMonth(dates);
    expect(buckets).not.toBeNull();
    expect(buckets).toHaveLength(2);
    const june = buckets!.find((b) => b.month === 6)!;
    const july = buckets!.find((b) => b.month === 7)!;
    expect(june.rowIndexes).toEqual([0, 1]);
    expect(july.rowIndexes).toEqual([2, 3, 4]);
  });

  it("groups FR-formatted dates (dd/mm/yyyy)", () => {
    const dates = ["25/06/2026", "30/06/2026", "01/07/2026"];
    const buckets = groupValuesByMonth(dates);
    expect(buckets).toHaveLength(2);
  });

  it("returns null when nothing parses as a date", () => {
    expect(groupValuesByMonth(["", "not a date", "also not"])).toBeNull();
  });
});

describe("aggregateColumnValuesForRows", () => {
  it("sums only the rows in the given bucket, not the whole column (the fix for June+July mixing)", () => {
    const values = ["10", "20", "100", "200", "300"]; // june: 10,20 — july: 100,200,300
    expect(aggregateColumnValuesForRows(values, [0, 1], "daily")).toBe(30);
    expect(aggregateColumnValuesForRows(values, [2, 3, 4], "daily")).toBe(600);
  });

  it("takes the last value for monthly granularity, never sums", () => {
    const values = ["100", "150", "180"];
    expect(aggregateColumnValuesForRows(values, [0, 1, 2], "monthly")).toBe(180);
  });

  it("never coerces blank cells to 0 when summing — they're just excluded", () => {
    const values = ["10", "", "20"];
    expect(aggregateColumnValuesForRows(values, [0, 1, 2], "daily")).toBe(30);
  });
});

describe("aggregateColumnValues (whole-column fallback)", () => {
  it("sums the entire column when there's no month bucket to scope to", () => {
    expect(aggregateColumnValues(["1", "2", "3"], "daily")).toBe(6);
  });
});
