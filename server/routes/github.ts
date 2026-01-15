import { Router } from "express";
import { githubApi } from "../github";
import { storage } from "../storage";
import { requireGitHubToken, asyncHandler } from "../middleware";

const router = Router();

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const GITHUB_REDIRECT_URI = process.env.GITHUB_REDIRECT_URI || "http://localhost:3005/api/github/callback";

/**
 * Initiate GitHub OAuth flow
 * GET /api/github/connect?returnTo=/path
 */
router.get("/connect", (req, res) => {
    if (!req.session.userId) {
        res.status(401).json({ message: "Not authenticated" });
        return;
    }

    if (!GITHUB_CLIENT_ID) {
        res.status(500).json({ message: "GitHub OAuth not configured" });
        return;
    }

    const state = Math.random().toString(36).substring(2, 15);
    req.session.githubOAuthState = state;

    // Store return URL for redirect after OAuth
    const returnTo = req.query.returnTo as string;
    if (returnTo && returnTo.startsWith("/")) {
        (req.session as any).githubReturnTo = returnTo;
    }

    req.session.save((err) => {
        if (err) {
            console.error("Failed to save session:", err);
            res.status(500).json({ message: "Failed to initialize GitHub OAuth" });
            return;
        }

        const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(GITHUB_REDIRECT_URI)}&scope=user:email read:user repo&state=${state}`;
        res.redirect(githubAuthUrl);
    });
});

/**
 * GitHub OAuth callback
 * GET /api/github/callback
 */
router.get("/callback", asyncHandler(async (req, res) => {
    const { code, state, error } = req.query;

    if (error) {
        console.error("GitHub OAuth error:", error);
        res.redirect("/dashboard?github_error=oauth_failed");
        return;
    }

    if (!code) {
        res.redirect("/dashboard?github_error=no_code");
        return;
    }

    // Verify state
    if (state !== req.session.githubOAuthState) {
        console.error("GitHub OAuth state mismatch");
        res.redirect("/dashboard?github_error=state_mismatch");
        return;
    }

    if (!req.session.userId) {
        res.redirect("/auth?error=not_authenticated");
        return;
    }

    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
        console.error("GitHub OAuth not configured");
        res.redirect("/dashboard?github_error=not_configured");
        return;
    }

    // Exchange code for access token
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        body: JSON.stringify({
            client_id: GITHUB_CLIENT_ID,
            client_secret: GITHUB_CLIENT_SECRET,
            code: String(code),
            redirect_uri: GITHUB_REDIRECT_URI,
        }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
        console.error("GitHub token exchange failed:", tokenData.error);
        res.redirect("/dashboard?github_error=token_exchange_failed");
        return;
    }

    const accessToken = tokenData.access_token;

    // Get GitHub user info
    const userResponse = await fetch("https://api.github.com/user", {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "User-Agent": "ResearchWorkspace",
        },
    });

    const githubUser = await userResponse.json();

    // Store GitHub token and username in database
    await storage.updateUser(req.session.userId, {
        githubAccessToken: accessToken,
        githubUsername: githubUser.login,
    });

    // Also store in session for immediate use
    req.session.accessToken = accessToken;

    // Get return URL and clear OAuth state
    const returnTo = (req.session as any).githubReturnTo || "/dashboard";
    delete req.session.githubOAuthState;
    delete (req.session as any).githubReturnTo;

    res.redirect(`${returnTo}?github_connected=true`);
}));

/**
 * Disconnect GitHub
 * POST /api/github/disconnect
 */
router.post("/disconnect", asyncHandler(async (req, res) => {
    if (!req.session.userId) {
        res.status(401).json({ message: "Not authenticated" });
        return;
    }

    await storage.updateUser(req.session.userId, {
        githubAccessToken: null,
        githubUsername: null,
    });

    delete req.session.accessToken;

    res.json({ message: "GitHub disconnected successfully" });
}));

/**
 * Get GitHub connection status
 * GET /api/github/status
 */
router.get("/status", asyncHandler(async (req, res) => {
    if (!req.session.userId) {
        res.status(401).json({ message: "Not authenticated" });
        return;
    }

    const user = await storage.getUser(req.session.userId);
    if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
    }

    res.json({
        connected: !!user.githubAccessToken,
        username: user.githubUsername || null,
    });
}));

// Apply GitHub token middleware to API routes below
router.use(requireGitHubToken);

/**
 * Get user's GitHub repositories
 * GET /api/github/repos
 */
router.get("/repos", asyncHandler(async (req, res) => {
    const repos = await githubApi.getUserRepos(req.session.accessToken!);
    res.json(repos);
}));

/**
 * Get branches for a repository
 * GET /api/github/repos/:owner/:repo/branches
 */
router.get("/repos/:owner/:repo/branches", asyncHandler(async (req, res) => {
    const branches = await githubApi.getRepoBranches(
        `${req.params.owner}/${req.params.repo}`,
        req.session.accessToken!
    );
    res.json(branches);
}));

/**
 * Get latest commit for a branch
 * GET /api/github/repos/:owner/:repo/commits/:branch
 */
router.get("/repos/:owner/:repo/commits/:branch", asyncHandler(async (req, res) => {
    const commit = await githubApi.getLatestCommit(
        `${req.params.owner}/${req.params.repo}`,
        req.params.branch,
        req.session.accessToken!
    );
    res.json(commit);
}));

/**
 * Get repository contents (root)
 * GET /api/github/repos/:owner/:repo/contents
 */
router.get("/repos/:owner/:repo/contents", asyncHandler(async (req, res) => {
    const response = await fetch(
        `https://api.github.com/repos/${req.params.owner}/${req.params.repo}/contents`,
        {
            headers: {
                Authorization: `token ${req.session.accessToken}`,
                Accept: "application/vnd.github.v3+json",
            },
        }
    );

    if (!response.ok) {
        res.status(500).json({ message: "Failed to fetch repository contents" });
        return;
    }

    const contents = await response.json();
    res.json(contents);
}));

/**
 * Get repository contents (specific path)
 * GET /api/github/repos/:owner/:repo/contents/*
 */
router.get("/repos/:owner/:repo/contents/*", asyncHandler(async (req, res) => {
    const { owner, repo } = req.params;
    const path = (req.params as any)[0]; // Get the wildcard path

    const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
        {
            headers: {
                Authorization: `token ${req.session.accessToken}`,
                Accept: "application/vnd.github.v3+json",
            },
        }
    );

    if (!response.ok) {
        res.status(500).json({ message: "Failed to fetch content" });
        return;
    }

    const content = await response.json();
    res.json(content);
}));

export default router;
