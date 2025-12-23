import { Router } from "express";
import { githubApi } from "../github";
import { requireGitHubToken, asyncHandler } from "../middleware";

const router = Router();

// Apply GitHub token middleware to all routes
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
