import { describe, expect, it } from "vitest";
import { databaseNeedsSsl } from "./client";

describe("databaseNeedsSsl", () => {
  it("is off for local Docker URLs", () => {
    expect(databaseNeedsSsl("postgres://jobbook:jobbook@127.0.0.1:5433/jobbook")).toBe(
      false,
    );
    expect(databaseNeedsSsl("")).toBe(false);
  });

  it("is on for Neon and sslmode=require", () => {
    expect(
      databaseNeedsSsl("postgres://user:pass@ep-x.ap-southeast-2.aws.neon.tech/neondb"),
    ).toBe(true);
    expect(
      databaseNeedsSsl("postgres://jobbook:jobbook@127.0.0.1:5433/jobbook?sslmode=require"),
    ).toBe(true);
  });
});
