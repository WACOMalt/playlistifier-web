// Shared queue configuration for search and download services
module.exports = {
    MAX_CONCURRENCY: 5,        // Maximum concurrent operations
    PROCESS_DELAY: 2000,       // 2 second delay between starting new operations
    POLLING_INTERVAL: 1000     // 1 second polling interval for waiting loops
};
