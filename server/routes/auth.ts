import { Router } from "express";
import { randomBytes } from "crypto";
import { storage } from "../storage";
import { approvalRequestSchema } from "@shared/schema";
import { asyncHandler } from "../middleware";
import { registerSession, getExpressSessionId, unregisterSession, unregisterByExpressSession } from "../sessionTracker";
import {
    decodeJwtPayload,
    describeRoleChange,
    endSession,
    ensureFreshReviewer,
    holdsReviewerRole,
    resolveUser,
    syncLogin,
    type TokenClaims,
} from "../roleSync";

const router = Router();

/**
 * Keycloak OAuth initiation (SSO)
 * GET /api/auth/login
 */
router.get("/login", asyncHandler(async (req, res) => {
    const keycloakAuthUrl = process.env.KEYCLOAK_AUTH_URL || "http://localhost:8080/realms/epsilon/protocol/openid-connect/auth";
    const keycloakClientId = process.env.KEYCLOAK_CLIENT_ID || "jobscheduler-oauth";
    const keycloakRedirectUri = process.env.KEYCLOAK_REDIRECT_URI || "http://localhost:3005/api/auth/callback";

    const state = randomBytes(16).toString("hex");
    req.session.oauthState = state;

    req.session.save((err) => {
        if (err) {
            console.error("Failed to save session:", err);
            res.status(500).json({ message: "Failed to initialize OAuth flow" });
            return;
        }
        const authUrl = `${keycloakAuthUrl}?client_id=${keycloakClientId}&redirect_uri=${encodeURIComponent(keycloakRedirectUri)}&response_type=code&scope=openid profile email&state=${state}`;
        res.redirect(authUrl);
    });
}));

/**
 * Keycloak OAuth callback
 * GET /api/auth/callback
 */
router.get("/callback", asyncHandler(async (req, res) => {
    const { code, state, error } = req.query;

    // The state from /login is single-use
    const expectedState = req.session.oauthState;
    delete req.session.oauthState;

    if (error) {
        // Sanitize error parameter to prevent open redirect/XSS attacks
        const safeError = String(error).replace(/[^a-zA-Z0-9_-]/g, '');
        res.redirect("/auth?error=" + encodeURIComponent(safeError));
        return;
    }

    if (!expectedState || typeof state !== "string" || state !== expectedState) {
        console.error("Keycloak callback state does not match the login request");
        res.redirect("/auth?error=state_mismatch");
        return;
    }

    if (!code) {
        res.redirect("/auth?error=no_code");
        return;
    }

    const keycloakTokenUrl = process.env.KEYCLOAK_TOKEN_URL || "http://localhost:8080/realms/epsilon/protocol/openid-connect/token";
    const keycloakClientId = process.env.KEYCLOAK_CLIENT_ID || "jobscheduler-oauth";
    const keycloakClientSecret = process.env.KEYCLOAK_CLIENT_SECRET;
    const keycloakRedirectUri = process.env.KEYCLOAK_REDIRECT_URI || "http://localhost:3005/api/auth/callback";

    if (!keycloakClientSecret) {
        console.error("KEYCLOAK_CLIENT_SECRET not configured");
        res.redirect("/auth?error=server_configuration");
        return;
    }

    const urlSearchParams = new URLSearchParams({
        grant_type: "authorization_code",
        code: String(code),
        redirect_uri: keycloakRedirectUri,
        client_id: keycloakClientId,
        client_secret: keycloakClientSecret,
    });

    let tokenData;
    try {
        const tokenResponse = await fetch(keycloakTokenUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: urlSearchParams,
        });
        if (!tokenResponse.ok) {
            console.error(`Keycloak token exchange failed: HTTP ${tokenResponse.status}`);
            res.redirect("/auth?error=token_exchange_failed");
            return;
        }
        tokenData = await tokenResponse.json();
    } catch (err) {
        console.error("Keycloak token exchange failed:", (err as Error).message);
        res.redirect("/auth?error=token_exchange_failed");
        return;
    }

    if (tokenData.error) {
        console.error("Keycloak token exchange failed:", tokenData.error);
        res.redirect("/auth?error=token_exchange_failed");
        return;
    }

    // Decode JWT to get user info
    const jwt = tokenData.access_token;
    if (!jwt || typeof jwt !== 'string') {
        console.error("Invalid access token received from Keycloak");
        res.redirect("/auth?error=invalid_token");
        return;
    }

    let payload: TokenClaims;
    try {
        payload = decodeJwtPayload(jwt);
    } catch (err) {
        console.error("Failed to decode JWT:", err);
        res.redirect("/auth?error=token_decode_failed");
        return;
    }

    const sub = typeof payload.sub === "string" ? payload.sub : "";
    const email = typeof payload.email === "string" ? payload.email : "";
    if (!sub || !email || payload.azp !== keycloakClientId) {
        console.error(`Refused Keycloak token: sub=${sub || "(none)"}, email ${email ? "present" : "missing"}, azp=${String(payload.azp)}`);
        res.redirect("/auth?error=invalid_token");
        return;
    }

    // Reviewer accounts are invited: one whose email is not verified cannot sign in
    if (holdsReviewerRole(payload) && payload.email_verified !== true) {
        console.warn(`[Auth] Refused login of sub=${sub}: reviewer role with an unverified email`);
        res.redirect("/auth?error=email_not_verified");
        return;
    }

    const resolution = await resolveUser(payload);
    if (resolution.kind === "conflict") {
        console.warn(`[Auth] Refused login of sub=${sub} email=${email}: the email belongs to user ${resolution.userIds.join(", ")}`);
        res.redirect("/auth?error=account_conflict");
        return;
    }
    if (resolution.kind === "unverified_claim") {
        console.warn(`[Auth] Refused login of sub=${sub}: claiming legacy user ${resolution.user.id} needs a verified email`);
        res.redirect("/auth?error=email_not_verified");
        return;
    }

    // Role and reviewer projects follow Keycloak, in the same transaction as the user row
    const synced = await syncLogin(resolution, payload);
    const user = synced.user;
    if (resolution.kind === "claim") {
        console.log(`[Auth] User ${user.id} (legacy external_id ${resolution.user.externalId}) is now bound to sub=${sub}`);
    }
    console.log(`[Auth] Login user=${user.id} sub=${sub} ${describeRoleChange(synced)}`);

    // A fresh session id at login, so a session id set before it cannot be reused
    await new Promise<void>((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
    req.session.userId = user.id;
    req.session.apiToken = jwt;
    req.session.idToken = tokenData.id_token || "";
    req.session.refreshToken = tokenData.refresh_token || "";
    req.session.rolesCheckedAt = Date.now();

    // Register Keycloak session for backchannel logout (under the new session id)
    const sid = payload.sid as string | undefined;
    if (sid) {
      registerSession(sid, req.sessionID);
    }
    await new Promise<void>((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));

    // Redirect based on approval status
    if (user.approvalStatus === "pending") {
        res.redirect("/approval-request");
    } else if (user.approvalStatus === "approved") {
        res.redirect(user.role === "reviewer" ? "/review" : "/dashboard");
    } else {
        res.redirect("/auth?error=rejected");
    }
}));

/**
 * Logout — destroys local session and returns Keycloak logout URL
 * POST /api/auth/logout
 */
router.post("/logout", (req, res) => {
    const idToken = (req.session as any)?.idToken || "";
    const clientId = process.env.KEYCLOAK_CLIENT_ID || "jobscheduler-oauth";
    const logoutBaseUrl = process.env.KEYCLOAK_LOGOUT_URL
        || (process.env.KEYCLOAK_AUTH_URL || "").replace("/auth", "/logout");
    const postLogoutRedirect = process.env.KEYCLOAK_POST_LOGOUT_REDIRECT_URI
        || "http://localhost:3005/auth";

    // Unregister backchannel session mapping
    unregisterByExpressSession(req.sessionID);

    req.session.destroy((err: Error | null) => {
        if (err) {
            res.status(500).json({ message: "Failed to logout" });
            return;
        }

        const params = new URLSearchParams({ client_id: clientId });
        if (idToken) {
            params.set("id_token_hint", idToken);
        }
        params.set("post_logout_redirect_uri", postLogoutRedirect);

        res.json({ logoutUrl: `${logoutBaseUrl}?${params.toString()}` });
    });
});

/**
 * Backchannel logout — Keycloak sends a POST with logout_token when a user
 * logs out from another app. We destroy the matching Express session.
 * POST /api/auth/backchannel-logout
 */
router.post("/backchannel-logout", (req, res) => {
    const logoutToken = req.body?.logout_token;
    if (!logoutToken) {
        res.status(400).json({ error: "Missing logout_token" });
        return;
    }

    try {
        const parts = logoutToken.split(".");
        if (parts.length !== 3) {
            res.status(400).json({ error: "Invalid logout_token format" });
            return;
        }
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
        const sid = payload.sid;
        if (!sid) {
            res.status(400).json({ error: "No sid in logout_token" });
            return;
        }

        const expressSessionId = getExpressSessionId(sid);
        if (expressSessionId && req.sessionStore) {
            req.sessionStore.destroy(expressSessionId, (err) => {
                if (err) console.error("[Backchannel] Failed to destroy session:", err);
            });
            unregisterSession(sid);
            console.log(`[Backchannel] Destroyed session for Keycloak sid=${sid}`);
        }

        res.status(200).send();
    } catch (err) {
        console.error("[Backchannel] Error processing logout_token:", err);
        res.status(400).json({ error: "Failed to process logout_token" });
    }
});

/**
 * Get current user
 * GET /api/auth/me
 */
router.get("/me", asyncHandler(async (req, res) => {
    if (!req.session.userId) {
        res.status(401).json({ message: "Not authenticated" });
        return;
    }

    let user = await storage.getUser(req.session.userId);
    if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
    }

    // Reviewers are re-checked with Keycloak; if it cannot be reached, the stored row is returned
    if (user.role === "reviewer") {
        req.user = user;
        const check = await ensureFreshReviewer(req, { force: false });
        if (check.status === "reauth") {
            await endSession(req);
            res.status(401).json({ message: "Not authenticated", code: "REAUTH_REQUIRED" });
            return;
        }
        if (check.status === "ok") {
            user = check.user;
        }
    }

    res.json(user);
}));

/**
 * Submit approval request
 * POST /api/approval-request
 */
router.post("/approval-request", asyncHandler(async (req, res) => {
    if (!req.session.userId) {
        res.status(401).json({ message: "Not authenticated" });
        return;
    }

    const validatedData = approvalRequestSchema.parse(req.body);

    const user = await storage.updateUser(req.session.userId, {
        researchPurpose: validatedData.researchPurpose,
        institution: validatedData.institution,
        expectedDuration: validatedData.expectedDuration,
    });

    res.json(user);
}));

export default router;
