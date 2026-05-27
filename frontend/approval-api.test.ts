import { describe, expect, spyOn, test } from "bun:test";
import { submitApprovalDecision } from "./approval-api";

describe("approval API client", () => {
  test("submits approval decision to encoded endpoint", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          approvalRequestId: "approval:1",
          decision: "accept",
          status: "accepted",
          resolvedAtMs: 123,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    await expect(
      submitApprovalDecision("approval:1", "accept"),
    ).resolves.toMatchObject({
      decision: "accept",
      status: "accepted",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/approvals/approval%3A1",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ decision: "accept" }),
      }),
    );
    fetchSpy.mockRestore();
  });

  test("throws API error message when request fails", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "missing approval" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      submitApprovalDecision("missing", "decline"),
    ).rejects.toThrow("missing approval");
    fetchSpy.mockRestore();
  });
});
