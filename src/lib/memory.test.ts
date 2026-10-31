import { describe, expect, it, vi } from "vitest";
import type { Stamped } from "./records";

vi.mock("./env", () => ({ MOCK: true, env: {} }));
const { failedJobs } = await import("./memory");

const rec = (key: string): Stamped => ({ type: "PREFERENCE", key, value: "x", v: 1 });

describe("failedJobs", () => {
  it("separates failed writes from those still running, and drops finished ones", () => {
    const jobs = [{ id: "a", record: rec("a") }, { id: "b", record: rec("b") }, { id: "c", record: rec("c") }, { id: "d", record: rec("d") }];
    const { failed, waiting } = failedJobs(jobs, [{ job_id: "a", status: "done" }, { job_id: "b", status: "failed" }, { job_id: "c", status: "running" }]);
    expect(failed.map((j) => j.id)).toEqual(["b"]);
    expect(waiting.map((j) => j.id)).toEqual(["c", "d"]);
  });
});
