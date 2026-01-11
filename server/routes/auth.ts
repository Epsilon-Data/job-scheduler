import { Router } from "express";
import { storage } from "../storage";
import { approvalRequestSchema } from "@shared/schema";
import { asyncHandler } from "../middleware";
import { getGitHubBrokerToken } from "../keycloak";

const router = Router();

/**
 * Keycloak OAuth initiation (with GitHub IdP)
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
        // kc_idp_hint=github auto-redirects to GitHub IdP
        const authUrl = `${keycloakAuthUrl}?client_id=${keycloakClientId}&redirect_uri=${encodeURIComponent(keycloakRedirectUri)}&response_type=code&scope=openid profile email&state=${state}&kc_idp_hint=github`;
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
    const keycloakClientId = process.env.KEYCLOAK_CLIENT_ID || "coordinator-oauth";
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

    // Store JWT token in session
    req.session.userId = user.id;
    (req.session as any).apiToken = jwt;

    // Try to get GitHub broker token
    const githubToken = await getGitHubBrokerToken(jwt);
    if (githubToken) {
        console.log("GitHub broker token retrieved successfully!");
        req.session.accessToken = githubToken;
    } else {
        console.log("Could not retrieve GitHub broker token");
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
 * Logout
 * POST /api/auth/logout
 */
router.post("/logout", (req, res) => {
    req.session.destroy((err: Error | null) => {
        if (err) {
            res.status(500).json({ message: "Failed to logout" });
            return;
        }
        res.json({ message: "Logged out successfully" });
    });
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
