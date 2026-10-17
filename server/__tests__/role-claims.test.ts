import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import {
  decodeJwtPayload,
  ensureFreshReviewer,
  isReviewerClaims,
  isUuid,
  realmRolesOf,
  refreshTokens,
  reviewerProjectsOf,
  targetRole,
} from "../roleSync";

// Pure claim handling and the token call; keep the database out of this unit test
vi.mock("../storage", () => ({ storage: {} }));

const PROJECT = "3f2c9a4e-8b1d-4c6e-9f0a-1b2c3d4e5f60";
const OTHER_PROJECT = "a7702e2d-69dd-4543-b3b6-a6df21d287c9";

const reviewer = (overrides: Record<string, unknown> = {}) => ({
  sub: "5c0a9d6e-1f2b-4c3d-8e4f-5a6b7c8d9e0f",
  email_verified: true,
  realm_access: { roles: ["default-roles-epsilon", "output-reviewer"] },
  ...overrides,
});

const jwt = (claims: unknown) =>
  `${Buffer.from('{"alg":"RS256"}').toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;

describe("reviewerProjectsOf", () => {
  it("takes the project ids of top-level 'Reviewers of <id>' groups, lower-cased, sorted and de-duplicated", () => {
    expect(reviewerProjectsOf({
      epsilon_groups: [
        `/Reviewers of ${OTHER_PROJECT}`,
        `/reviewers OF ${PROJECT.toUpperCase()}`,
        `/Reviewers of ${PROJECT}`,
        `/Collaborators of ${PROJECT}`,
        "/output-reviewers",
      ],
    })).toEqual([PROJECT, OTHER_PROJECT].sort());
  });

  it("ignores nested groups, near-misses and ids that are not UUIDs", () => {
    expect(reviewerProjectsOf({
      epsilon_groups: [
        `/output-reviewers/Reviewers of ${PROJECT}`,
        `Reviewers of ${PROJECT}`,
        `/Reviewers of ${PROJECT} `,
        `/Reviewers of  ${PROJECT}`,
        `/Reviewers of ${PROJECT}/child`,
        "/Reviewers of ------------------------------------",
        "/Reviewers of 3f2c9a4e8b1d4c6e9f0a1b2c3d4e5f60abcd",
        42,
        null,
      ],
    })).toEqual([]);
  });

  it("is empty without a usable epsilon_groups claim", () => {
    expect(reviewerProjectsOf({})).toEqual([]);
    expect(reviewerProjectsOf({ epsilon_groups: `/Reviewers of ${PROJECT}` })).toEqual([]);
  });
});

describe("isReviewerClaims and realmRolesOf", () => {
  it("needs the reviewer role and a verified email", () => {
    expect(isReviewerClaims(reviewer())).toBe(true);
    expect(isReviewerClaims(reviewer({ email_verified: false }))).toBe(false);
    expect(isReviewerClaims(reviewer({ email_verified: "true" }))).toBe(false);
    expect(isReviewerClaims(reviewer({ email_verified: undefined }))).toBe(false);
    expect(isReviewerClaims(reviewer({ realm_access: { roles: ["default-roles-epsilon"] } }))).toBe(false);
    // A group named like the role is not the role
    expect(isReviewerClaims(reviewer({ realm_access: undefined, epsilon_groups: ["/output-reviewers"] }))).toBe(false);
  });

  it("reads the role name from KEYCLOAK_REVIEWER_ROLE", () => {
    vi.stubEnv("KEYCLOAK_REVIEWER_ROLE", "rw-reviewer");
    try {
      expect(isReviewerClaims(reviewer())).toBe(false);
      expect(isReviewerClaims(reviewer({ realm_access: { roles: ["rw-reviewer"] } }))).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("tolerates missing or malformed realm_access", () => {
    expect(realmRolesOf({})).toEqual([]);
    expect(realmRolesOf({ realm_access: "output-reviewer" })).toEqual([]);
    expect(realmRolesOf({ realm_access: { roles: ["a", 1, null, "b"] } })).toEqual(["a", "b"]);
  });
});

describe("targetRole", () => {
  it("lets 'user' and 'reviewer' follow Keycloak", () => {
    expect(targetRole("user", reviewer())).toBe("reviewer");
    expect(targetRole("reviewer", reviewer())).toBe("reviewer");
    expect(targetRole("reviewer", reviewer({ realm_access: { roles: [] } }))).toBe("user");
    expect(targetRole("reviewer", reviewer({ email_verified: false }))).toBe("user");
    expect(targetRole("user", {})).toBe("user");
  });

  it("leaves staff and unknown roles unchanged, and warns when they hold the reviewer role", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(targetRole("staff", {})).toBe("staff");
      expect(warn).not.toHaveBeenCalled();
      expect(targetRole("staff", reviewer())).toBe("staff");
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain('"staff"');
      expect(targetRole("auditor", reviewer())).toBe("auditor");
    } finally {
      warn.mockRestore();
    }
  });
});

describe("isUuid (legacy external ids)", () => {
  it("treats Keycloak subs as bound and GitHub ids or usernames as legacy", () => {
    expect(isUuid("5c0a9d6e-1f2b-4c3d-8e4f-5a6b7c8d9e0f")).toBe(true);
    expect(isUuid("5C0A9D6E-1F2B-4C3D-8E4F-5A6B7C8D9E0F")).toBe(true);
    expect(isUuid("12345678")).toBe(false);
    expect(isUuid("octocat")).toBe(false);
    expect(isUuid("")).toBe(false);
  });
});

describe("decodeJwtPayload", () => {
  it("decodes a base64url payload", () => {
    const claims = { sub: "s", name: "Zoë ✓ ??>>" };
    expect(decodeJwtPayload(jwt(claims))).toEqual(claims);
  });

  it("rejects malformed tokens and non-object payloads", () => {
    expect(() => decodeJwtPayload("only.two")).toThrow();
    expect(() => decodeJwtPayload("a.b.c")).toThrow();
    expect(() => decodeJwtPayload(jwt(["sub"]))).toThrow();
    expect(() => decodeJwtPayload(jwt(null))).toThrow();
  });
});

describe("refreshTokens", () => {
  const tokenUrl = "http://keycloak.invalid/realms/epsilon/protocol/openid-connect/token";
  let fetchMock: ReturnType<typeof vi.fn>;

  const reply = (status: number, body: unknown) =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  const ok = () => reply(200, { access_token: jwt(reviewer()), refresh_token: "rt-2", id_token: "id-2" });

  beforeEach(() => {
    vi.stubEnv("KEYCLOAK_TOKEN_URL", tokenUrl);
    vi.stubEnv("KEYCLOAK_CLIENT_ID", "jobscheduler-oauth");
    vi.stubEnv("KEYCLOAK_CLIENT_SECRET", "secret");
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends a refresh_token grant with the client credentials and returns the new tokens and claims", async () => {
    fetchMock.mockResolvedValueOnce(ok());
    const result = await refreshTokens("rt-1", { timeoutMs: 1000 });

    expect(result).toEqual({
      ok: true,
      tokens: { accessToken: expect.any(String), refreshToken: "rt-2", idToken: "id-2", claims: reviewer() },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(tokenUrl);
    expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({
      grant_type: "refresh_token",
      refresh_token: "rt-1",
      client_id: "jobscheduler-oauth",
      client_secret: "secret",
    });
  });

  it("does not retry invalid_grant", async () => {
    fetchMock.mockResolvedValue(reply(400, { error: "invalid_grant", error_description: "Session not active" }));
    expect(await refreshTokens("rt-1", { timeoutMs: 1000, retryDelayMs: 0 })).toEqual({ ok: false, reason: "invalid_grant" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 5xx or network error once", async () => {
    fetchMock.mockResolvedValueOnce(reply(503, "")).mockResolvedValueOnce(ok());
    expect((await refreshTokens("rt-1", { timeoutMs: 1000, retryDelayMs: 0 })).ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect(await refreshTokens("rt-1", { timeoutMs: 1000, retryDelayMs: 0 })).toEqual({ ok: false, reason: "unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("times out a hanging request, retries once, then gives up", async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    const started = Date.now();
    expect(await refreshTokens("rt-1", { timeoutMs: 40, retryDelayMs: 0 })).toEqual({ ok: false, reason: "unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("re-checks a reviewer with a 5 s timeout, or 10 s when forced (before a decision)", async () => {
    // Each attempt hangs until aborted; record how long it ran
    const ranFor: number[] = [];
    fetchMock.mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      const started = Date.now();
      init.signal!.addEventListener("abort", () => {
        ranFor.push(Date.now() - started);
        reject(new DOMException("aborted", "AbortError"));
      });
    }));
    const reviewerRequest = (sessionID: string) => ({
      user: { id: "u-1", role: "reviewer", externalId: reviewer().sub },
      session: { refreshToken: "rt-1" },
      sessionID,
    }) as unknown as Request;

    vi.useFakeTimers();
    try {
      for (const [force, timeoutMs] of [[true, 10_000], [false, 5_000]] as const) {
        ranFor.length = 0;
        const check = ensureFreshReviewer(reviewerRequest(`s-${force}`), { force });
        await vi.advanceTimersByTimeAsync(timeoutMs - 1);
        expect(ranFor).toEqual([]);
        await vi.advanceTimersByTimeAsync(1);
        expect(ranFor).toEqual([timeoutMs]);
        await vi.advanceTimersByTimeAsync(1_000 + timeoutMs);
        expect(await check).toEqual({ status: "unavailable" });
        expect(ranFor).toEqual([timeoutMs, timeoutMs]);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails without retry on other client errors, unusable replies or a missing client secret", async () => {
    fetchMock.mockResolvedValue(reply(401, { error: "unauthorized_client" }));
    expect(await refreshTokens("rt-1", { timeoutMs: 1000, retryDelayMs: 0 })).toEqual({ ok: false, reason: "unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    for (const body of ["<html>bad gateway</html>", { token_type: "Bearer" }, { access_token: "not-a-jwt" }]) {
      fetchMock.mockReset();
      fetchMock.mockResolvedValue(reply(200, body));
      expect(await refreshTokens("rt-1", { timeoutMs: 1000, retryDelayMs: 0 })).toEqual({ ok: false, reason: "unavailable" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }

    fetchMock.mockReset();
    vi.stubEnv("KEYCLOAK_CLIENT_SECRET", "");
    expect(await refreshTokens("rt-1", { timeoutMs: 1000, retryDelayMs: 0 })).toEqual({ ok: false, reason: "unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
