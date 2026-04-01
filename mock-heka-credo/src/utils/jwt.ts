/**
 * Handles multiple storage formats for JWT credentials.
 * Converts stored value to a raw JWT string for verification.
 */
export function getStoredJwtCredential(storedValue: string): string {
  try {
    const parsedValue = JSON.parse(storedValue)

    if (typeof parsedValue === 'string') {
      return parsedValue
    }

    if (parsedValue?.jwt?.serializedJwt) {
      return parsedValue.jwt.serializedJwt
    }

    if (parsedValue?.serializedJwt) {
      return parsedValue.serializedJwt
    }
  } catch {
    // Stored value is already a raw JWT string.
  }

  return storedValue
}
