/**
 * Keycloak helper functions
 */

const KEYCLOAK_BASE_URL = process.env.KEYCLOAK_BASE_URL || "http://localhost:8080";
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || "epsilon";

/**
 * Fetch the GitHub broker token from Keycloak
 * This retrieves the stored GitHub access token for the authenticated user
 *
 * Requirements:
 * - Identity Provider must have "Store tokens" = ON
 * - User must have "read-token" role from broker client
 * - Client must have "roles" scope to include resource_access in JWT
 */
export async function getGitHubBrokerToken(keycloakAccessToken: string): Promise<string | null> {
    try {
        const brokerTokenUrl = `${KEYCLOAK_BASE_URL}/realms/${KEYCLOAK_REALM}/broker/github/token`;

        const response = await fetch(brokerTokenUrl, {
            headers: {
                Authorization: `Bearer ${keycloakAccessToken}`,
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Failed to fetch GitHub broker token:", response.status, errorText);
            return null;
        }

        // Keycloak returns broker token as form-urlencoded: access_token=xxx&token_type=bearer
        const responseText = await response.text();
        const params = new URLSearchParams(responseText);
        return params.get("access_token");
    } catch (error) {
        console.error("Error fetching GitHub broker token:", error);
        return null;
    }
}
