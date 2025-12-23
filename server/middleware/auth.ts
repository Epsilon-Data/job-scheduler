import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import type { User } from "@shared/schema";

// Extend Express Request type to include session and user
declare module "express-serve-static-core" {
    interface Request {
        session: {
            userId?: string;
            accessToken?: string;
            apiToken?: string;
            oauthState?: string;
            destroy: (callback: (err: any) => void) => void;
        };
        user?: User;
    }
}

/**
 * Middleware to require authentication
 * Checks if user is logged in via session
 */
export const requireAuth = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    if (!req.session.userId) {
        res.status(401).json({ message: "Not authenticated" });
        return;
    }
    next();
};

/**
 * Middleware to require authentication and load user
 * Checks if user is logged in and attaches user object to request
 */
export const requireAuthWithUser = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    if (!req.session.userId) {
        res.status(401).json({ message: "Not authenticated" });
        return;
    }

    const user = await storage.getUser(req.session.userId);
    if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
    }

    req.user = user;
    next();
};

/**
 * Middleware to require staff role
 * Must be used after requireAuth or requireAuthWithUser
 */
export const requireStaff = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    if (!req.session.userId) {
        res.status(401).json({ message: "Not authenticated" });
        return;
    }

    const user = req.user || await storage.getUser(req.session.userId);
    if (!user || user.role !== "staff") {
        res.status(403).json({ message: "Insufficient permissions" });
        return;
    }

    req.user = user;
    next();
};

/**
 * Middleware to require GitHub access token
 * Must be used after requireAuth
 */
export const requireGitHubToken = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    if (!req.session.userId || !req.session.accessToken) {
        res.status(401).json({ message: "Not authenticated" });
        return;
    }
    next();
};
