/**
 * @file rateLimitService.js
 * @description Rate limiting service for security protection
 * Implements ISMS A.9.4.4 (User identification) and A.12.4.1 (Event logging)
 */

const rateLimitMap = new Map();

const rateLimitService = {
    /**
     * Check if request is rate limited
     * @param {string} key - Unique key for rate limiting
     * @param {number} maxAttempts - Maximum allowed attempts
     * @param {number} windowMs - Time window in milliseconds
     * @returns {boolean} - True if rate limited, false otherwise
     */
    check(key, maxAttempts, windowMs) {
        const now = Date.now();
        const record = rateLimitMap.get(key);

        if (!record) {
            rateLimitMap.set(key, {
                count: 1,
                firstAttempt: now,
                resetTime: now + windowMs,
            });
            return false;
        }

        // Reset if window has passed
        if (now > record.resetTime) {
            rateLimitMap.set(key, {
                count: 1,
                firstAttempt: now,
                resetTime: now + windowMs,
            });
            return false;
        }

        // Increment count
        record.count += 1;
        rateLimitMap.set(key, record);

        // Check if limit exceeded
        return record.count > maxAttempts;
    },

    /**
     * Get remaining attempts for a key
     * @param {string} key - Rate limit key
     * @param {number} maxAttempts - Maximum allowed attempts
     * @returns {number} - Remaining attempts
     */
    getRemainingAttempts(key, maxAttempts) {
        const record = rateLimitMap.get(key);
        if (!record) return maxAttempts;

        const now = Date.now();
        if (now > record.resetTime) return maxAttempts;

        return Math.max(0, maxAttempts - record.count);
    },

    /**
     * Get time until rate limit resets
     * @param {string} key - Rate limit key
     * @returns {number} - Milliseconds until reset
     */
    getResetTime(key) {
        const record = rateLimitMap.get(key);
        if (!record) return 0;

        const now = Date.now();
        if (now > record.resetTime) return 0;

        return record.resetTime - now;
    },

    /**
     * Reset rate limit for a key
     * @param {string} key - Rate limit key
     */
    reset(key) {
        rateLimitMap.delete(key);
    },

    /**
     * Clear all rate limits
     */
    clearAll() {
        rateLimitMap.clear();
    },

    /**
     * Get rate limit status
     * @param {string} key - Rate limit key
     * @param {number} maxAttempts - Maximum allowed attempts
     * @returns {object} - Rate limit status
     */
    getStatus(key, maxAttempts) {
        const record = rateLimitMap.get(key);
        if (!record) {
            return {
                isLimited: false,
                remaining: maxAttempts,
                resetTime: 0,
                totalAttempts: 0,
            };
        }

        const now = Date.now();
        if (now > record.resetTime) {
            return {
                isLimited: false,
                remaining: maxAttempts,
                resetTime: 0,
                totalAttempts: 0,
            };
        }

        return {
            isLimited: record.count > maxAttempts,
            remaining: Math.max(0, maxAttempts - record.count),
            resetTime: record.resetTime - now,
            totalAttempts: record.count,
        };
    },
};

// Cleanup expired entries every minute
setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitMap.entries()) {
        if (now > record.resetTime) {
            rateLimitMap.delete(key);
        }
    }
}, 60000);

module.exports = rateLimitService;