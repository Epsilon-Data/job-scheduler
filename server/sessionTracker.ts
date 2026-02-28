/**
 * Session Tracker for Back-Channel Logout
 *
 * Maps Keycloak session IDs (sid) to Express session IDs
 * so we can destroy the correct session when Keycloak sends a logout notification.
 */

// Map: Keycloak sid -> Express session ID
const keycloakSessionMap = new Map<string, string>();

// Map: Express session ID -> Keycloak sid (for cleanup)
const expressSessionMap = new Map<string, string>();

/**
 * Register a session mapping when user logs in
 */
export function registerSession(keycloakSid: string, expressSessionId: string): void {
    // Clean up any existing mapping for this Express session
    const existingSid = expressSessionMap.get(expressSessionId);
    if (existingSid) {
        keycloakSessionMap.delete(existingSid);
    }

    keycloakSessionMap.set(keycloakSid, expressSessionId);
    expressSessionMap.set(expressSessionId, keycloakSid);

    console.log(`[SessionTracker] Registered: Keycloak sid=${keycloakSid} -> Express session=${expressSessionId}`);
}

/**
 * Get Express session ID by Keycloak session ID
 */
export function getExpressSessionId(keycloakSid: string): string | undefined {
    return keycloakSessionMap.get(keycloakSid);
}

/**
 * Remove session mapping when user logs out
 */
export function unregisterSession(keycloakSid: string): void {
    const expressSessionId = keycloakSessionMap.get(keycloakSid);
    if (expressSessionId) {
        expressSessionMap.delete(expressSessionId);
    }
    keycloakSessionMap.delete(keycloakSid);

    console.log(`[SessionTracker] Unregistered: Keycloak sid=${keycloakSid}`);
}

/**
 * Remove session mapping by Express session ID (called on logout)
 */
export function unregisterByExpressSession(expressSessionId: string): void {
    const keycloakSid = expressSessionMap.get(expressSessionId);
    if (keycloakSid) {
        keycloakSessionMap.delete(keycloakSid);
    }
    expressSessionMap.delete(expressSessionId);
}