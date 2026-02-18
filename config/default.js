/**
 * Configuration for Engineering Decision Memory System
 */
const getConfig = () => ({
  // GitHub API configuration
  github: {
    token: process.env.GITHUB_TOKEN,
    rateLimit: {
      maxRetries: 3,
      retryDelay: 1000 // ms
    }
  },

  // Storage configuration
  storage: {
    eventStore: process.env.DB_PATH || './storage/events.db',
    backupInterval: 24 * 60 * 60 * 1000, // 24 hours in ms
    maxEventAge: 365 * 24 * 60 * 60 * 1000 // 1 year in ms
  },

  // Ingestion configuration
  ingestion: {
    batchSize: 100,
    maxConcurrency: 5,
    retryAttempts: 3
  },

  // Decision extraction configuration (Phase 3)
  extraction: {
    llmProvider: 'openai', // or 'anthropic', 'local'
    model: 'gpt-4',
    confidenceThreshold: 0.7,
    maxTokens: 2000
  },

  // Knowledge graph configuration (Phase 4)
  graph: {
    database: './storage/knowledge-graph.db',
    relationshipTypes: [
      'DISCUSSED_IN',
      'DECIDED_IN', 
      'AFFECTED_BY',
      'SUPERSEDED_BY',
      'REINFORCED_BY'
    ]
  },

  // Freshness model configuration (Phase 6)
  freshness: {
    decayRate: 0.1, // per day
    reinforcementBoost: 0.2,
    freshnessThresholds: {
      fresh: 0.8,
      aging: 0.5,
      stale: 0.2
    }
  },

  // Query engine configuration (Phase 7)
  query: {
    maxResults: 10,
    citationRequired: true,
    confidenceThreshold: 0.6
  },

  // Web server configuration
  web: {
    port: process.env.PORT || 3000
  }
});

export default getConfig();