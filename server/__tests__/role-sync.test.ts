import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it, vi } from "vitest";
import request from "supertest";
import { randomUUID } from "crypto";
import type { Server } from "http";

type Helpers = typeof import("./helpers");
type Account = import("./helpers").KeycloakAccount;
type Agent = ReturnType<typeof request.agent>;
type Listed = Record<string, any>;

const databaseUrl = inject("databaseUrl");

describe.skipIf(!databaseUrl)("Keycloak login and reviewer re-checks (database tests, need TEST_DATABASE_URL)", () => {
  let h: Helpers;
  let tracker: typeof import("../sessionTracker");
  let storage: typeof import("../storage")["storage"];
  let server: Server;

  beforeAll(async () => {
    // Imported here so server/db.ts only ever sees the throwaway database set up by globalSetup
    h = await import("./helpers");
    tracker = await import("../sessionTracker");
    ({ storage } = await import("../storage"));
    await h.assertThrowawayDatabase();
    server = await h.listen(await h.createSessionApp());
  });

  afterAll(async () => {
    await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)));
    await h?.closeDatabase();
  });

  beforeEach(() => {
    h.keycloak.reset();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function account(overrides: Partial<Account> = {}): Account {
    const sub = randomUUID();
    return { sub, email: `kc-${sub.slice(0, 8)}@example.test`, emailVerified: true, roles: [], groups: [], sid: randomUUID(), ...overrides };
  }

  const reviewerAccount = (projects: string[], overrides: Partial<Account> = {}) =>
    account({ roles: [h.REVIEWER_ROLE], groups: projects.map((projectId) => `/Reviewers of ${projectId}`), ...overrides });

  const sessionCookie = (response: request.Response) =>
    (response.get("Set-Cookie") ?? []).map((cookie) => cookie.split(";")[0]).find((cookie) => cookie.startsWith("connect.sid="));

  // Signed express-session cookie: s:<session id>.<signature>
  function sessionIdOf(cookie: string | undefined): string | undefined {
    if (!cookie) return undefined;
    const signed = decodeURIComponent(cookie.slice("connect.sid=".length));
    return signed.slice(2, signed.lastIndexOf("."));
  }

  // Signs in through /api/auth/login and the Keycloak callback, as a browser would
  async function login(acct: Account, options: { state?: string } = {}) {
    const agent = request.agent(server);
    const key = randomUUID();
    h.keycloak.accounts.set(key, acct);
    const start = await agent.get("/api/auth/login");
    expect(start.status).toBe(302);
    const state = new URL(start.headers.location).searchParams.get("state")!;
    expect(state).toMatch(/^[0-9a-f]{32}$/);
    const callback = await agent.get("/api/auth/callback").query({ code: `code:${key}`, state: options.state ?? state });
    expect(callback.status).toBe(302);
    return {
      agent,
      key,
      state,
      location: callback.headers.location as string,
      loginCookie: sessionCookie(start)!,
      sessionCookie: sessionCookie(callback),
    };
  }

  async function reviewerSession(projects: string[]) {
    const acct = reviewerAccount(projects);
    const session = await login(acct);
    expect(session.location).toBe("/review");
    const me = await session.agent.get("/api/auth/me");
    h.keycloak.reset();
    return { ...session, acct, userId: me.body.id as string };
  }

  async function existingUser(role: "user" | "reviewer" | "staff", approvalStatus: "approved" | "pending" | "rejected" = "approved", projects?: string[]) {
    const sub = randomUUID();
    const email = `row-${sub.slice(0, 8)}@example.test`;
    const id = await h.createUser(role, approvalStatus, { externalId: sub, email, projects });
    return { id, sub, email };
  }

  async function userRow(where: string, value: unknown) {
    const { rows } = await h.query(
      `SELECT id, external_id, email, username, full_name, role, approval_status FROM users WHERE ${where} = $1`,
      [value],
    );
    return rows;
  }

  const roleOf = async (userId: string) => (await userRow("id", userId))[0].role;
  const approvalOf = async (userId: string) => (await userRow("id", userId))[0].approval_status;
  const mirrorOf = async (userId: string) => (await h.reviewerProjectRows(userId)).map((row) => row.project_id);

  async function heldJob(projectId: string) {
    const userId = await h.createUser("user");
    const workspaceId = await h.createWorkspace(userId);
    const jobId = await h.createJob({ userId, workspaceId, projectId });
    const sha = await h.completeWithHeldOutput(jobId, { kind: "result", content: `held ${randomUUID()}` });
    return { jobId, sha };
  }

  const approve = (agent: Agent, job: { jobId: string; sha: string }) =>
    agent.post(`/api/review/jobs/${job.jobId}/decision`).send({ decision: "approve", output_sha256: job.sha });

  async function decisionCount(jobId: string) {
    const { rows } = await h.query("SELECT count(*)::int AS n FROM release_decisions WHERE job_id = $1", [jobId]);
    return rows[0].n;
  }

  const ids = (response: request.Response) => (response.body as Listed[]).map((item) => item.job_id);

  describe("login", () => {
    it("a new account with the reviewer role becomes a reviewer of its projects and lands on /review", async () => {
      const projectA = randomUUID();
      const projectB = randomUUID();
      const acct = reviewerAccount([], {
        groups: [
          `/Reviewers of ${projectA}`,
          `/Reviewers of ${projectB.toUpperCase()}`,
          "/output-reviewers",
          `/output-reviewers/Reviewers of ${randomUUID()}`,
        ],
      });
      const { agent, location } = await login(acct);
      expect(location).toBe("/review");

      const me = await agent.get("/api/auth/me");
      expect(me.status).toBe(200);
      expect(me.body).toMatchObject({ externalId: acct.sub, email: acct.email, role: "reviewer", approvalStatus: "approved" });
      expect(await mirrorOf(me.body.id)).toEqual([projectA, projectB].sort());
    });

    it("a new account without the role is a researcher, whatever its groups", async () => {
      const acct = account({ groups: [`/Reviewers of ${randomUUID()}`] });
      const { agent, location } = await login(acct);
      expect(location).toBe("/dashboard");
      const me = await agent.get("/api/auth/me");
      expect(me.body).toMatchObject({ externalId: acct.sub, role: "user", approvalStatus: "approved" });
      expect(await mirrorOf(me.body.id)).toEqual([]);
    });

    it("promotes a user, demotes a reviewer to a user awaiting approval and leaves staff as staff", async () => {
      const project = randomUUID();

      const user = await existingUser("user");
      expect((await login(reviewerAccount([project], { sub: user.sub, email: user.email }))).location).toBe("/review");
      expect(await roleOf(user.id)).toBe("reviewer");
      expect(await mirrorOf(user.id)).toEqual([project]);
      expect(vi.mocked(console.log).mock.calls.flat().join("\n")).toContain(`user=${user.id} sub=${user.sub} role=user->reviewer`);

      const formerReviewer = await existingUser("reviewer", "approved", [project]);
      const demoted = await login(account({ sub: formerReviewer.sub, email: formerReviewer.email }));
      expect(demoted.location).toBe("/approval-request");
      expect(await roleOf(formerReviewer.id)).toBe("user");
      expect(await approvalOf(formerReviewer.id)).toBe("pending");
      expect(await mirrorOf(formerReviewer.id)).toEqual([]);
      expect((await demoted.agent.get("/api/workspaces")).body.code).toBe("NOT_APPROVED");

      // A rejected reviewer stays rejected
      const rejectedReviewer = await existingUser("reviewer", "rejected", [project]);
      expect((await login(account({ sub: rejectedReviewer.sub, email: rejectedReviewer.email }))).location).toBe("/auth?error=rejected");
      expect(await roleOf(rejectedReviewer.id)).toBe("user");
      expect(await approvalOf(rejectedReviewer.id)).toBe("rejected");

      const staff = await existingUser("staff");
      expect((await login(reviewerAccount([project], { sub: staff.sub, email: staff.email }))).location).toBe("/dashboard");
      expect(await roleOf(staff.id)).toBe("staff");
      expect(await approvalOf(staff.id)).toBe("approved");
      expect(await mirrorOf(staff.id)).toEqual([]);
      expect((await login(account({ sub: staff.sub, email: staff.email }))).location).toBe("/dashboard");
      expect(await approvalOf(staff.id)).toBe("approved");
      expect(vi.mocked(console.warn).mock.calls.flat().join("\n")).toContain('"staff" account holds the output-reviewer role');
    });

    it("a rejected account that holds the role still gets 403 on review routes", async () => {
      const rejected = await existingUser("user", "rejected");
      const { agent, location } = await login(reviewerAccount([randomUUID()], { sub: rejected.sub, email: rejected.email }));
      expect(location).toBe("/auth?error=rejected");
      expect(await roleOf(rejected.id)).toBe("reviewer");
      expect((await agent.get("/api/review/jobs")).status).toBe(403);
      expect((await agent.get("/api/review/me")).status).toBe(403);
    });

    it("the sub wins over the email, and the profile follows the token", async () => {
      const bound = await existingUser("user");
      const newEmail = `moved-${randomUUID().slice(0, 8)}@example.test`;
      const legacy = await h.createUser("user", "approved", { externalId: "octocat", email: newEmail });

      const { agent, location } = await login(account({ sub: bound.sub, email: newEmail, username: "renamed", name: "Renamed Person" }));
      expect(location).toBe("/dashboard");
      expect((await agent.get("/api/auth/me")).body.id).toBe(bound.id);
      expect(await userRow("id", bound.id)).toEqual([
        expect.objectContaining({ external_id: bound.sub, email: newEmail, username: "renamed", full_name: "Renamed Person" }),
      ]);
      expect(await userRow("id", legacy)).toEqual([expect.objectContaining({ external_id: "octocat" })]);
    });

    it("an email whose row belongs to another sub is refused, without a session or a new row", async () => {
      const bound = await existingUser("user");
      const intruder = account({ email: bound.email });
      const { agent, location } = await login(intruder);
      expect(location).toBe("/auth?error=account_conflict");
      expect((await agent.get("/api/auth/me")).status).toBe(401);
      expect(await userRow("external_id", intruder.sub)).toEqual([]);
      expect(await userRow("id", bound.id)).toEqual([expect.objectContaining({ external_id: bound.sub })]);
    });

    it("a legacy row (non-UUID external id) is claimed once, by the first sub with its email", async () => {
      const email = `legacy-${randomUUID().slice(0, 8)}@example.test`;
      const legacyId = await h.createUser("user", "approved", { externalId: "12345678", email: email.toUpperCase() });

      const first = account({ email });
      const claimed = await login(first);
      expect(claimed.location).toBe("/dashboard");
      expect((await claimed.agent.get("/api/auth/me")).body.id).toBe(legacyId);
      expect(await userRow("id", legacyId)).toEqual([expect.objectContaining({ external_id: first.sub, email })]);

      const second = account({ email });
      const refused = await login(second);
      expect(refused.location).toBe("/auth?error=account_conflict");
      expect((await refused.agent.get("/api/auth/me")).status).toBe(401);
      expect(await userRow("id", legacyId)).toEqual([expect.objectContaining({ external_id: first.sub })]);
    });

    it("a legacy row is not claimed with an email Keycloak has not verified", async () => {
      const email = `legacy-${randomUUID().slice(0, 8)}@example.test`;
      const legacyId = await h.createUser("staff", "approved", { externalId: "87654321", email });

      const unverified = account({ email, emailVerified: false });
      const refused = await login(unverified);
      expect(refused.location).toBe("/auth?error=email_not_verified");
      expect((await refused.agent.get("/api/auth/me")).status).toBe(401);
      expect(await userRow("email", email)).toEqual([expect.objectContaining({ id: legacyId, external_id: "87654321" })]);

      const verified = await login({ ...unverified, emailVerified: true });
      expect(verified.location).toBe("/dashboard");
      expect((await verified.agent.get("/api/auth/me")).body).toMatchObject({ id: legacyId, role: "staff" });
      expect(await userRow("email", email)).toEqual([expect.objectContaining({ id: legacyId, external_id: unverified.sub })]);
    });

    it("a first login that loses the race to create its row uses the row the other login created", async () => {
      const acct = account();
      // The other login has inserted the row but not committed yet: this login resolves the sub as new and
      // its insert waits on the unique index until the other one commits
      const other = await h.connectClient();
      try {
        await other.query("BEGIN");
        const { rows } = await other.query<{ id: string }>(
          `INSERT INTO users (external_id, username, email, full_name, role, approval_status)
           VALUES ($1, $2, $3, 'Other Login', 'user', 'approved') RETURNING id`,
          [acct.sub, acct.email, acct.email],
        );
        const pending = login(acct);
        await vi.waitFor(async () => {
          const waiting = await h.query(
            "SELECT 1 FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query ILIKE 'insert into \"users\"%'",
          );
          expect(waiting.rowCount).toBe(1);
        }, { timeout: 5_000, interval: 20 });
        await other.query("COMMIT");

        const { agent, location } = await pending;
        expect(location).toBe("/dashboard");
        expect((await agent.get("/api/auth/me")).body.id).toBe(rows[0].id);
        expect(await userRow("external_id", acct.sub)).toHaveLength(1);
      } finally {
        await other.query("ROLLBACK").catch(() => {});
        other.release();
      }
    });

    it("a first login whose row a concurrent login created between the sub and email lookups is not a conflict", async () => {
      const acct = account();
      const id = await h.createUser("user", "approved", { externalId: acct.sub, email: acct.email });
      // The sub lookup ran just before the other login committed
      vi.spyOn(storage, "getUserByExternalId").mockResolvedValueOnce(undefined);
      const { agent, location } = await login(acct);
      expect(location).toBe("/dashboard");
      expect((await agent.get("/api/auth/me")).body.id).toBe(id);
    });

    it("two concurrent first logins of one new sub both sign in to one row", async () => {
      const acct = account();
      const sessions = await Promise.all([login(acct), login(acct), login(acct)]);
      expect(sessions.map((session) => session.location)).toEqual(["/dashboard", "/dashboard", "/dashboard"]);
      const rows = await userRow("external_id", acct.sub);
      expect(rows).toHaveLength(1);
      for (const { agent } of sessions) {
        expect((await agent.get("/api/auth/me")).body.id).toBe(rows[0].id);
      }
    });

    it("two rows with the email are refused", async () => {
      const email = `dup-${randomUUID().slice(0, 8)}@example.test`;
      await h.createUser("user", "approved", { externalId: `gh-${randomUUID()}`, email });
      await h.createUser("user", "approved", { externalId: `gh-${randomUUID()}`, email: email.toUpperCase() });
      const { agent, location } = await login(account({ email }));
      expect(location).toBe("/auth?error=account_conflict");
      expect((await agent.get("/api/auth/me")).status).toBe(401);
    });

    it("refuses an empty sub or email, another client's token, an unverified reviewer and a bad state", async () => {
      const cases: [Account, string | undefined, string][] = [
        [account({ sub: "" }), undefined, "/auth?error=invalid_token"],
        [account({ email: "" }), undefined, "/auth?error=invalid_token"],
        [account({ azp: "another-client" }), undefined, "/auth?error=invalid_token"],
        [reviewerAccount([randomUUID()], { emailVerified: false }), undefined, "/auth?error=email_not_verified"],
        [account(), "forged-state", "/auth?error=state_mismatch"],
        [account(), "", "/auth?error=state_mismatch"],
      ];
      for (const [acct, state, expected] of cases) {
        h.keycloak.reset();
        const { agent, location } = await login(acct, { state });
        expect(location).toBe(expected);
        expect((await agent.get("/api/auth/me")).status).toBe(401);
        expect(await userRow("email", acct.email)).toEqual([]);
        if (expected.endsWith("state_mismatch")) {
          // The code is never exchanged
          expect(h.keycloak.requests).toEqual([]);
        }
      }
    });

    it("a state is used once", async () => {
      const acct = account();
      const { agent, key, state, location } = await login(acct);
      expect(location).toBe("/dashboard");
      const replay = await agent.get("/api/auth/callback").query({ code: `code:${key}`, state });
      expect(replay.headers.location).toBe("/auth?error=state_mismatch");
    });

    it("checks the token endpoint's HTTP status and survives it being unreachable", async () => {
      const acct = account();
      h.keycloak.replies.push({ status: 502, body: { access_token: h.makeJwt(h.accessTokenClaims(acct)) } });
      let attempt = await login(acct);
      expect(attempt.location).toBe("/auth?error=token_exchange_failed");
      expect((await attempt.agent.get("/api/auth/me")).status).toBe(401);

      h.keycloak.replies.push({ network: true });
      attempt = await login(acct);
      expect(attempt.location).toBe("/auth?error=token_exchange_failed");
      expect(await userRow("external_id", acct.sub)).toEqual([]);
    });

    it("starts a new session at login and maps the Keycloak sid to it", async () => {
      const acct = account();
      const { agent, loginCookie, sessionCookie: newCookie } = await login(acct);
      const before = sessionIdOf(loginCookie);
      const after = sessionIdOf(newCookie);
      expect(before).toBeDefined();
      expect(after).toBeDefined();
      expect(after).not.toBe(before);
      expect(tracker.getExpressSessionId(acct.sid!)).toBe(after);

      expect((await agent.get("/api/auth/me")).status).toBe(200);
      // The session id handed out before login is not signed in
      expect((await request(server).get("/api/auth/me").set("Cookie", loginCookie)).status).toBe(401);
    });

    it("logs one line per login and never the token", async () => {
      const acct = account();
      await login(acct);
      const logged = [...vi.mocked(console.log).mock.calls, ...vi.mocked(console.warn).mock.calls].flat().map(String);
      const accessToken = h.makeJwt(h.accessTokenClaims(acct));
      expect(logged.some((line) => line.includes(accessToken.split(".")[1]))).toBe(false);
      expect(logged.some((line) => line.includes("JWT Payload"))).toBe(false);
      const lines = logged.filter((line) => line.startsWith("[Auth] Login"));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(new RegExp(`^\\[Auth\\] Login user=[0-9a-f-]{36} sub=${acct.sub} role=user \\(new user\\)$`));
    });
  });

  describe("re-checks", () => {
    it("a fresh check makes no Keycloak call", async () => {
      const { agent } = await reviewerSession([randomUUID()]);
      expect((await agent.get("/api/review/jobs")).status).toBe(200);
      expect((await agent.get("/api/review/me")).status).toBe(200);
      expect((await agent.get("/api/auth/me")).status).toBe(200);
      expect(h.keycloak.refreshCalls()).toBe(0);
    });

    it("a stale check after the role is gone demotes the account, answers 403 and records no decision", async () => {
      const project = randomUUID();
      const { agent, acct, userId } = await reviewerSession([project]);
      const job = await heldJob(project);
      acct.roles = [];
      vi.stubEnv("REVIEWER_ROLE_RECHECK_SECONDS", "0");

      expect((await agent.get("/api/review/jobs")).status).toBe(403);
      expect(h.keycloak.refreshCalls()).toBe(1);
      expect(await roleOf(userId)).toBe("user");
      expect(await approvalOf(userId)).toBe("pending");
      expect(await mirrorOf(userId)).toEqual([]);
      expect((await agent.get("/api/workspaces")).body.code).toBe("NOT_APPROVED");
      expect((await approve(agent, job)).status).toBe(403);
      expect(await decisionCount(job.jobId)).toBe(0);
    });

    it("every decision re-checks first, with the refresh token from the login", async () => {
      const project = randomUUID();
      const { agent, acct, key } = await reviewerSession([project]);
      const first = await heldJob(project);
      expect((await approve(agent, first)).status).toBe(201);
      expect(h.keycloak.refreshCalls(key)).toBe(1);

      // Removed in Keycloak a moment ago: the next decision is refused although the session is fresh
      const second = await heldJob(project);
      acct.roles = [];
      const refused = await approve(agent, second);
      expect(refused.status).toBe(403);
      expect(h.keycloak.refreshCalls(key)).toBe(2);
      expect(await decisionCount(second.jobId)).toBe(0);
    });

    it("a project removed in Keycloak is gone at the next decision", async () => {
      const project = randomUUID();
      const { agent, acct } = await reviewerSession([project]);
      const job = await heldJob(project);
      acct.groups = [];
      const refused = await approve(agent, job);
      expect(refused.status).toBe(404);
      expect(refused.body.code).toBe("NOT_FOUND");
      expect(await decisionCount(job.jobId)).toBe(0);
    });

    it("invalid_grant ends the session with 401 REAUTH_REQUIRED and changes nothing", async () => {
      const project = randomUUID();
      const { agent, acct, userId } = await reviewerSession([project]);
      const job = await heldJob(project);
      expect(tracker.getExpressSessionId(acct.sid!)).toBeDefined();
      h.keycloak.replies.push({ status: 400, body: { error: "invalid_grant", error_description: "Session not active" } });

      const refused = await approve(agent, job);
      expect(refused.status).toBe(401);
      expect(refused.body.code).toBe("REAUTH_REQUIRED");
      expect(h.keycloak.refreshCalls()).toBe(1);
      expect((await agent.get("/api/auth/me")).status).toBe(401);
      expect(tracker.getExpressSessionId(acct.sid!)).toBeUndefined();
      expect(await roleOf(userId)).toBe("reviewer");
      expect(await decisionCount(job.jobId)).toBe(0);
    });

    it("a refreshed token for another sub ends the session", async () => {
      const { agent, acct } = await reviewerSession([randomUUID()]);
      acct.sub = randomUUID();
      const refused = await agent.get("/api/review/jobs?refresh=1");
      expect(refused.status).toBe(401);
      expect(refused.body.code).toBe("REAUTH_REQUIRED");
      expect((await agent.get("/api/auth/me")).status).toBe(401);
    });

    it("a 5xx or network error is retried once, then 503 with the database unchanged", async () => {
      const project = randomUUID();
      const { agent, userId } = await reviewerSession([project]);
      const job = await heldJob(project);
      const mirror = await h.reviewerProjectRows(userId);

      h.keycloak.replies.push({ status: 503 }, { network: true });
      const unavailable = await approve(agent, job);
      expect(unavailable.status).toBe(503);
      expect(unavailable.body.code).toBe("KEYCLOAK_UNAVAILABLE");
      expect(h.keycloak.refreshCalls()).toBe(2);
      expect(await h.reviewerProjectRows(userId)).toEqual(mirror);
      expect(await roleOf(userId)).toBe("reviewer");
      expect(await decisionCount(job.jobId)).toBe(0);

      // The session survives; one failure followed by a good answer is enough
      h.keycloak.replies.push({ status: 502 });
      expect((await approve(agent, job)).status).toBe(201);
      expect(h.keycloak.refreshCalls()).toBe(4);
    });

    it("concurrent requests of one session share one refresh", async () => {
      const { agent } = await reviewerSession([randomUUID()]);
      vi.stubEnv("REVIEWER_ROLE_RECHECK_SECONDS", "0");
      let release!: () => void;
      h.keycloak.hold = new Promise<void>((resolve) => (release = resolve));
      // Each request looks its user up right before the re-check; once all three have, they wait on the refresh
      const getUser = storage.getUser.bind(storage);
      let lookedUp = 0;
      vi.spyOn(storage, "getUser").mockImplementation(async (id) => {
        const user = await getUser(id);
        lookedUp++;
        return user;
      });

      const responses = Promise.all([
        agent.get("/api/review/jobs"),
        agent.get("/api/review/jobs?status=all"),
        agent.get("/api/review/me"),
      ]);
      await vi.waitFor(() => expect(lookedUp).toBe(3), { timeout: 5_000, interval: 5 });
      await new Promise((resolve) => setImmediate(resolve));
      expect(h.keycloak.refreshCalls()).toBe(1);
      release();
      expect((await responses).map((response) => response.status)).toEqual([200, 200, 200]);
      expect(h.keycloak.refreshCalls()).toBe(1);
    });

    it("each re-check replaces the mirror of the reviewer's projects", async () => {
      const before = randomUUID();
      const after = randomUUID();
      const { agent, acct, userId } = await reviewerSession([before]);
      const oldJob = await heldJob(before);
      const newJob = await heldJob(after);
      expect(ids(await agent.get("/api/review/jobs"))).toContain(oldJob.jobId);
      expect((await agent.get(`/api/review/jobs/${newJob.jobId}`)).status).toBe(404);

      acct.groups = [`/Reviewers of ${after}`];
      vi.stubEnv("REVIEWER_ROLE_RECHECK_SECONDS", "0");
      const queue = await agent.get("/api/review/jobs");
      expect(ids(queue)).toContain(newJob.jobId);
      expect(ids(queue)).not.toContain(oldJob.jobId);
      expect(await mirrorOf(userId)).toEqual([after]);
      expect((await agent.get(`/api/review/jobs/${oldJob.jobId}`)).status).toBe(404);
      expect((await agent.get(`/api/review/jobs/${newJob.jobId}`)).status).toBe(200);
    });

    it("/api/review/me lists the mirrored projects; ?refresh=1 re-checks first", async () => {
      const first = randomUUID();
      const { agent, acct } = await reviewerSession([first]);
      const me = await agent.get("/api/review/me");
      expect(me.body).toEqual({ projects: [first], synced_at: expect.any(String) });
      expect(Date.now() - Date.parse(me.body.synced_at)).toBeLessThan(60_000);
      expect(h.keycloak.refreshCalls()).toBe(0);

      const second = randomUUID();
      acct.groups = [`/Reviewers of ${second}`];
      const refreshed = await agent.get("/api/review/me?refresh=1");
      expect(refreshed.body.projects).toEqual([second]);
      expect(h.keycloak.refreshCalls()).toBe(1);
      expect(Date.parse(refreshed.body.synced_at)).toBeGreaterThanOrEqual(Date.parse(me.body.synced_at));

      // No projects (the empty state) still reports when they were last checked
      acct.groups = [];
      const empty = await agent.get("/api/review/me?refresh=1");
      expect(empty.body).toEqual({ projects: [], synced_at: expect.any(String) });
    });

    it("/api/auth/me keeps the row when Keycloak is down, demotes a removed reviewer and ends the session on invalid_grant", async () => {
      const project = randomUUID();
      const { agent, acct, userId } = await reviewerSession([project]);
      vi.stubEnv("REVIEWER_ROLE_RECHECK_SECONDS", "0");

      h.keycloak.replies.push({ network: true }, { network: true });
      const down = await agent.get("/api/auth/me");
      expect(down.status).toBe(200);
      expect(down.body).toMatchObject({ id: userId, role: "reviewer" });
      expect(await mirrorOf(userId)).toEqual([project]);

      acct.roles = [];
      const demoted = await agent.get("/api/auth/me");
      expect(demoted.status).toBe(200);
      expect(demoted.body).toMatchObject({ role: "user", approvalStatus: "pending" });
      expect(await mirrorOf(userId)).toEqual([]);
      // No longer a reviewer: not re-checked any more
      const calls = h.keycloak.refreshCalls();
      expect((await agent.get("/api/auth/me")).status).toBe(200);
      expect(h.keycloak.refreshCalls()).toBe(calls);

      const other = await reviewerSession([project]);
      h.keycloak.replies.push({ status: 400, body: { error: "invalid_grant" } });
      const ended = await other.agent.get("/api/auth/me");
      expect(ended.status).toBe(401);
      expect(ended.body.code).toBe("REAUTH_REQUIRED");
      expect((await other.agent.get("/api/auth/me")).status).toBe(401);
      expect(await roleOf(other.userId)).toBe("reviewer");
    });

    it("a sync does not wait for the key share lock a concurrent decision's foreign key check holds", async () => {
      const project = randomUUID();
      const reviewer = await existingUser("reviewer", "approved", [project]);
      const access = { roleFor: () => "reviewer", projectIds: [project] };
      // What the release_decisions.reviewer_id check takes on the users row, held until the decision commits
      const decision = await h.connectClient();
      try {
        await decision.query("BEGIN");
        await decision.query("SELECT 1 FROM users WHERE id = $1 FOR KEY SHARE", [reviewer.id]);
        const outcome = (work: Promise<unknown>) => Promise.race([
          work.then(() => "done"),
          new Promise((resolve) => setTimeout(resolve, 2_000, "blocked")),
        ]);
        expect(await outcome(storage.syncReviewerAccess(reviewer.id, access))).toBe("done");
        expect(await outcome(storage.saveKeycloakUser(reviewer.id, {
          externalId: reviewer.sub, username: reviewer.email, email: reviewer.email, fullName: "Test reviewer", avatarUrl: "",
        }, access))).toBe("done");
      } finally {
        await decision.query("ROLLBACK");
        decision.release();
      }
    });
  });
});
