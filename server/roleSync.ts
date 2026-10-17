import type { Request } from "express";
import type { User } from "@shared/schema";
import { storage, type AccessSync, type AccessSyncResult, type KeycloakProfile } from "./storage";
import { unregisterByExpressSession } from "./sessionTracker";

/**
 * Keycloak is the source of truth for reviewers: the realm role (KEYCLOAK_REVIEWER_ROLE) makes an account a
 * reviewer, and its top-level groups "Reviewers of <project id>" are the projects it reviews. RW mirrors both
 * into users.role and reviewer_projects at login, on a periodic re-check and right before every decision.
 */

export type TokenClaims = Record<string, unknown>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Full group path of a top-level group; a nested group has a second "/" and never matches
const REVIEWER_GROUP_PATTERN = /^\/Reviewers of ([0-9a-f-]{36})$/i;

const REFRESH_TIMEOUT_MS = 5_000;
const FORCED_REFRESH_TIMEOUT_MS = 10_000;

// Delay before a re-check retries; undefined is the random 250-1000 ms. Tests set 0.
let recheckRetryDelayMs: number | undefined;

export function setRecheckRetryDelayMs(ms: number | undefined): void {
    recheckRetryDelayMs = ms;
}

export function reviewerRole(): string {
    return process.env.KEYCLOAK_REVIEWER_ROLE || "output-reviewer";
}

function recheckIntervalMs(): number {
    const raw = process.env.REVIEWER_ROLE_RECHECK_SECONDS;
    const seconds = raw?.trim() ? Number(raw) : NaN;
    return (Number.isFinite(seconds) && seconds >= 0 ? seconds : 60) * 1000;
}

export function isUuid(value: string): boolean {
    return UUID_PATTERN.test(value);
}

/**
 * Payload of a JWT, without checking its signature: only for tokens RW received from Keycloak's token endpoint.
 */
export function decodeJwtPayload(jwt: string): TokenClaims {
    const parts = jwt.split(".");
    if (parts.length !== 3) {
        throw new Error("Invalid JWT format");
    }
    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("Invalid JWT payload");
    }
    return payload;
}

export function realmRolesOf(claims: TokenClaims): string[] {
    const realmAccess = claims.realm_access;
    const roles = realmAccess && typeof realmAccess === "object" ? (realmAccess as { roles?: unknown }).roles : undefined;
    return Array.isArray(roles) ? roles.filter((role): role is string => typeof role === "string") : [];
}

export function holdsReviewerRole(claims: TokenClaims): boolean {
    return realmRolesOf(claims).includes(reviewerRole());
}

/**
 * Project ids from the epsilon_groups claim (full group paths), lower-cased and de-duplicated.
 */
export function reviewerProjectsOf(claims: TokenClaims): string[] {
    const groups = Array.isArray(claims.epsilon_groups) ? claims.epsilon_groups : [];
    const projects = new Set<string>();
    for (const group of groups) {
        const projectId = typeof group === "string" ? REVIEWER_GROUP_PATTERN.exec(group)?.[1] : undefined;
        if (projectId && isUuid(projectId)) projects.add(projectId.toLowerCase());
    }
    return Array.from(projects).sort();
}

// Reviewer accounts are invited, so the role only counts once the email has been verified
export function isReviewerClaims(claims: TokenClaims): boolean {
    return holdsReviewerRole(claims) && claims.email_verified === true;
}

/**
 * 'user' and 'reviewer' follow Keycloak; 'staff' (managed in RW) and any other role stay as they are.
 */
export function targetRole(currentRole: string, claims: TokenClaims): string {
    if (currentRole === "user" || currentRole === "reviewer") {
        return isReviewerClaims(claims) ? "reviewer" : "user";
    }
    if (holdsReviewerRole(claims)) {
        console.warn(`[RoleSync] A "${currentRole}" account holds the ${reviewerRole()} role; its role is left unchanged`);
    }
    return currentRole;
}

function accessOf(claims: TokenClaims): AccessSync {
    return {
        roleFor: (currentRole) => targetRole(currentRole, claims),
        projectIds: reviewerProjectsOf(claims),
    };
}

function profileOf(claims: TokenClaims): KeycloakProfile {
    return {
        externalId: String(claims.sub || ""),
        username: String(claims.preferred_username || claims.upn || ""),
        email: String(claims.email || ""),
        fullName: String(claims.name || `${claims.given_name || ""} ${claims.family_name || ""}`.trim()),
        avatarUrl: String(claims.picture || ""),
    };
}

export function describeRoleChange({ user, previousRole }: AccessSyncResult): string {
    if (previousRole === null) return `role=${user.role} (new user)`;
    return previousRole === user.role ? `role=${user.role}` : `role=${previousRole}->${user.role}`;
}

export type UserResolution =
    | { kind: "matched"; user: User }
    | { kind: "claim"; user: User }
    | { kind: "unverified_claim"; user: User } // a legacy row found by an email Keycloak has not verified
    | { kind: "new" }
    | { kind: "conflict"; userIds: string[] };

/**
 * Identity rule: each row belongs to one Keycloak sub (users.external_id). The email only finds a row that was
 * never bound to a sub (a legacy GitHub id or username), only when it is the one row with that email, and only
 * when Keycloak has verified that email: claiming binds the row to the sub for good.
 */
export async function resolveUser(claims: TokenClaims): Promise<UserResolution> {
    const { externalId, email } = profileOf(claims);
    const bySub = await storage.getUserByExternalId(externalId);
    if (bySub) return { kind: "matched", user: bySub };

    const byEmail = await storage.getUsersByEmail(email);
    // A concurrent first login of this sub created its row between the two lookups
    const own = byEmail.find((user) => user.externalId === externalId);
    if (own) return { kind: "matched", user: own };
    if (byEmail.length === 0) return { kind: "new" };
    if (byEmail.length === 1 && !isUuid(byEmail[0].externalId)) {
        return { kind: claims.email_verified === true ? "claim" : "unverified_claim", user: byEmail[0] };
    }
    return { kind: "conflict", userIds: byEmail.map((user) => user.id) };
}

function isExternalIdTaken(error: unknown): boolean {
    const { code, constraint } = (error ?? {}) as { code?: string; constraint?: string };
    return code === "23505" && constraint === "users_external_id_unique";
}

/**
 * Applies a login in one transaction: creates, claims or updates the row, then syncs its role and projects.
 * Two first logins of one new sub race to create its row; the one that loses re-resolves and uses that row.
 */
export async function syncLogin(
    resolution: Extract<UserResolution, { kind: "matched" | "claim" | "new" }>,
    claims: TokenClaims,
): Promise<AccessSyncResult> {
    const profile = profileOf(claims);
    try {
        return await storage.saveKeycloakUser(resolution.kind === "new" ? null : resolution.user.id, profile, accessOf(claims));
    } catch (error) {
        if (resolution.kind !== "new" || !isExternalIdTaken(error)) throw error;
        const retry = await resolveUser(claims);
        if (retry.kind !== "matched") throw error;
        console.warn(`[Auth] sub=${profile.externalId} was created by a concurrent login; using user ${retry.user.id}`);
        return storage.saveKeycloakUser(retry.user.id, profile, accessOf(claims));
    }
}

export interface KeycloakTokens {
    accessToken: string;
    refreshToken?: string;
    idToken?: string;
    claims: TokenClaims;
}

export type RefreshResult =
    | { ok: true; tokens: KeycloakTokens }
    | { ok: false; reason: "invalid_grant" | "unavailable" };

type RefreshAttempt = RefreshResult | { ok: false; reason: "retry" };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * refresh_token grant at the token endpoint the login used, so Keycloak rebuilds roles and groups from the
 * current mappings. A timeout, 5xx or network error is retried once after a random delay.
 */
export async function refreshTokens(
    refreshToken: string,
    options: { timeoutMs: number; retryDelayMs?: number },
): Promise<RefreshResult> {
    const first = await requestRefresh(refreshToken, options.timeoutMs);
    if (first.ok || first.reason !== "retry") return first;
    await sleep(options.retryDelayMs ?? 250 + Math.random() * 750);
    const second = await requestRefresh(refreshToken, options.timeoutMs);
    return second.ok || second.reason !== "retry" ? second : { ok: false, reason: "unavailable" };
}

async function requestRefresh(refreshToken: string, timeoutMs: number): Promise<RefreshAttempt> {
    const tokenUrl = process.env.KEYCLOAK_TOKEN_URL || "http://localhost:8080/realms/epsilon/protocol/openid-connect/token";
    const clientId = process.env.KEYCLOAK_CLIENT_ID || "jobscheduler-oauth";
    const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET;
    if (!clientSecret) {
        console.error("[RoleSync] KEYCLOAK_CLIENT_SECRET not configured");
        return { ok: false, reason: "unavailable" };
    }

    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let status: number;
    let text: string;
    try {
        const response = await fetch(tokenUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "refresh_token",
                refresh_token: refreshToken,
                client_id: clientId,
                client_secret: clientSecret,
            }),
            signal: controller.signal,
        });
        status = response.status;
        text = await response.text();
    } catch (error) {
        const cause = controller.signal.aborted ? `timed out after ${timeoutMs}ms` : (error as Error).message;
        console.warn(`[RoleSync] Token refresh failed: ${cause}`);
        return { ok: false, reason: "retry" };
    } finally {
        clearTimeout(timer);
    }

    const elapsed = Date.now() - started;
    let body: Record<string, unknown> | null = null;
    try {
        body = JSON.parse(text);
    } catch {
        // judged by the status below
    }

    if (status < 200 || status >= 300) {
        const error = typeof body?.error === "string" ? body.error : null;
        console.warn(`[RoleSync] Token refresh failed: HTTP ${status}${error ? ` ${error}` : ""} after ${elapsed}ms`);
        if (error === "invalid_grant") return { ok: false, reason: "invalid_grant" };
        return { ok: false, reason: status >= 500 ? "retry" : "unavailable" };
    }

    const accessToken = typeof body?.access_token === "string" ? body.access_token : "";
    let claims: TokenClaims | null = null;
    try {
        claims = accessToken ? decodeJwtPayload(accessToken) : null;
    } catch {
        // reported below
    }
    if (!claims) {
        console.warn("[RoleSync] Token refresh returned no usable access token");
        return { ok: false, reason: "unavailable" };
    }

    console.log(`[RoleSync] Token refreshed in ${elapsed}ms`);
    return {
        ok: true,
        tokens: {
            accessToken,
            refreshToken: typeof body?.refresh_token === "string" ? body.refresh_token : undefined,
            idToken: typeof body?.id_token === "string" ? body.id_token : undefined,
            claims,
        },
    };
}

export type ReviewerCheck =
    | { status: "ok"; user: User }
    | { status: "reauth" }       // refresh token refused, or it belongs to another sub: sign in again
    | { status: "unavailable" }; // Keycloak could not be reached; nothing was changed

type Recheck = { status: "ok"; user: User; tokens: KeycloakTokens } | { status: "reauth" } | { status: "unavailable" };

// One Keycloak refresh at a time per session; concurrent requests share its result
const recheckInFlight = new Map<string, Promise<Recheck>>();

/**
 * Re-checks a reviewer with Keycloak when the last check is older than REVIEWER_ROLE_RECHECK_SECONDS (default 60),
 * or always when forced. Other accounts are not re-checked: a new grant takes effect at the next login.
 */
export async function ensureFreshReviewer(req: Request, { force }: { force: boolean }): Promise<ReviewerCheck> {
    const user = req.user ?? (req.session.userId ? await storage.getUser(req.session.userId) : undefined);
    if (!user) return { status: "reauth" };
    if (user.role !== "reviewer") return { status: "ok", user };

    const checkedAt = req.session.rolesCheckedAt;
    if (!force && checkedAt !== undefined && Date.now() - checkedAt < recheckIntervalMs()) {
        return { status: "ok", user };
    }

    const key = req.sessionID;
    let pending = recheckInFlight.get(key);
    if (!pending) {
        pending = recheck(user, req.session.refreshToken, force ? FORCED_REFRESH_TIMEOUT_MS : REFRESH_TIMEOUT_MS)
            .finally(() => recheckInFlight.delete(key));
        recheckInFlight.set(key, pending);
    }
    const result = await pending;
    if (result.status !== "ok") return result;

    req.session.apiToken = result.tokens.accessToken;
    if (result.tokens.refreshToken) req.session.refreshToken = result.tokens.refreshToken;
    if (result.tokens.idToken) req.session.idToken = result.tokens.idToken;
    req.session.rolesCheckedAt = Date.now();
    return { status: "ok", user: result.user };
}

async function recheck(user: User, refreshToken: string | undefined, timeoutMs: number): Promise<Recheck> {
    if (!refreshToken) {
        console.warn(`[RoleSync] No refresh token in the session of reviewer ${user.id}`);
        return { status: "reauth" };
    }

    const refreshed = await refreshTokens(refreshToken, { timeoutMs, retryDelayMs: recheckRetryDelayMs });
    if (!refreshed.ok) {
        return { status: refreshed.reason === "invalid_grant" ? "reauth" : "unavailable" };
    }

    const sub = refreshed.tokens.claims.sub;
    if (sub !== user.externalId) {
        console.warn(`[RoleSync] Refreshed token of user ${user.id} carries another sub (${String(sub)})`);
        return { status: "reauth" };
    }

    const synced = await storage.syncReviewerAccess(user.id, accessOf(refreshed.tokens.claims));
    if (!synced) return { status: "reauth" };
    if (synced.previousRole !== synced.user.role) {
        console.log(`[RoleSync] user=${user.id} sub=${sub} ${describeRoleChange(synced)}`);
    }
    return { status: "ok", user: synced.user, tokens: refreshed.tokens };
}

export function endSession(req: Request): Promise<void> {
    unregisterByExpressSession(req.sessionID);
    return new Promise((resolve, reject) => req.session.destroy((err) => (err ? reject(err) : resolve())));
}
