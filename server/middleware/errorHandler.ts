import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
    statusCode: number;

    constructor(message: string, statusCode: number = 500) {
        super(message);
        this.statusCode = statusCode;
        this.name = "ApiError";
    }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends ApiError {
    constructor(message: string = "Resource not found") {
        super(message, 404);
        this.name = "NotFoundError";
    }
}

/**
 * Unauthorized error (401)
 */
export class UnauthorizedError extends ApiError {
    constructor(message: string = "Not authenticated") {
        super(message, 401);
        this.name = "UnauthorizedError";
    }
}

/**
 * Forbidden error (403)
 */
export class ForbiddenError extends ApiError {
    constructor(message: string = "Access denied") {
        super(message, 403);
        this.name = "ForbiddenError";
    }
}

/**
 * Bad request error (400)
 */
export class BadRequestError extends ApiError {
    constructor(message: string = "Bad request") {
        super(message, 400);
        this.name = "BadRequestError";
    }
}

/**
 * Centralized error handler middleware
 * Handles different error types and sends appropriate responses
 */
export const errorHandler = (
    err: Error,
    _req: Request,
    res: Response,
    _next: NextFunction
): void => {
    // Log error for debugging (consider using a proper logger in production)
    if (process.env.NODE_ENV !== "production") {
        console.error("Error:", err);
    }

    // Handle Zod validation errors
    if (err instanceof z.ZodError) {
        res.status(400).json({ message: fromZodError(err).toString() });
        return;
    }

    // Handle custom API errors
    if (err instanceof ApiError) {
        res.status(err.statusCode).json({ message: err.message });
        return;
    }

    // Handle unknown errors
    const statusCode = (err as any).status || (err as any).statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(statusCode).json({ message });
};

/**
 * Async handler wrapper to catch errors in async route handlers
 * Eliminates the need for try-catch in every route
 */
export const asyncHandler = (
    fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};
