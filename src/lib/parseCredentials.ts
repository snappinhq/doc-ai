export function parseCredentials(
    credentials: Record<string, string> | string
): Record<string, string> {
    // Already a parsed object
    if (typeof credentials === "object") return credentials;

    // Try base64 decode first
    try {
        const decoded = Buffer.from(credentials, "base64").toString("utf-8");
        return JSON.parse(decoded);
    } catch {
        // Fall back to plain JSON string
        try {
            return JSON.parse(credentials);
        } catch {
            throw new Error(
                "Invalid credentials: must be a JSON object, JSON string, or base64-encoded JSON string"
            );
        }
    }
}