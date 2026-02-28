import { Router } from "express";
import { storage } from "../storage";
import { approvalRequestSchema } from "@shared/schema";
import { asyncHandler } from "../middleware";
import { registerSession, getExpressSessionId, unregisterSession, unregisterByExpressSession } from "../sessionTracker";

const router = Router();

/**
 * Keycloak OAuth initiation (SSO)
 * GET /api/auth/login
 */
router.get("/login", asyncHandler(async (req, res) => {
    const keycloakAuthUrl = process.env.KEYCLOAK_AUTH_URL || "http://localhost:8080/realms/epsilon/protocol/openid-connect/auth";
    const keycloakClientId = process.env.KEYCLOAK_CLIENT_ID || "jobscheduler-oauth";
    const keycloakRedirectUri = process.env.KEYCLOAK_REDIRECT_URI || "http://localhost:3005/api/auth/callback";

    const state = Math.random().toString(36).substring(2, 15);
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
    const { code, error } = req.query;

    if (error) {
        // Sanitize error parameter to prevent open redirect/XSS attacks
        const safeError = String(error).replace(/[^a-zA-Z0-9_-]/g, '');
        res.redirect("/auth?error=" + encodeURIComponent(safeError));
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

    const tokenResponse = await fetch(keycloakTokenUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: urlSearchParams,
    });

    const tokenData = await tokenResponse.json();

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

    let payload: Record<string, unknown>;
    try {
        const parts = jwt.split(".");
        if (parts.length !== 3) {
            throw new Error("Invalid JWT format");
        }
        payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
    } catch (err) {
        console.error("Failed to decode JWT:", err);
        res.redirect("/auth?error=token_decode_failed");
        return;
    }

    // Log JWT payload for debugging
    console.log("JWT Payload:", JSON.stringify(payload, null, 2));

    const keycloakUser = {
        id: String(payload.preferred_username || payload.upn || ""),
        login: String(payload.preferred_username || payload.upn || ""),
        email: String(payload.email || ""),
        name: String(payload.name || `${payload.given_name || ""} ${payload.family_name || ""}`.trim()),
        avatar_url: String(payload.picture || "")
    };

    // Check if user exists in database by email
    let user = await storage.getUserByEmail(keycloakUser.email);

    if (!user) {
        user = await storage.createUser({
            externalId: String(payload.sub),
            username: keycloakUser.login,
            email: keycloakUser.email,
            fullName: keycloakUser.name,
            avatarUrl: keycloakUser.avatar_url,
            role: "user",
            approvalStatus: "approved"
        });
    }

    // Store tokens in session
    req.session.userId = user.id;
    (req.session as any).apiToken = jwt;
    (req.session as any).idToken = tokenData.id_token || "";

    // Register Keycloak session for backchannel logout
    const sid = payload.sid as string | undefined;
    if (sid) {
      registerSession(sid, req.sessionID);
    }

    // Redirect based on approval status
    if (user.approvalStatus === "pending") {
        res.redirect("/approval-request");
    } else if (user.approvalStatus === "approved") {
        res.redirect("/dashboard");
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

    const user = await storage.getUser(req.session.userId);
    if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
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
