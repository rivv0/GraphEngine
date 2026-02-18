/**
 * Phase 2: Event Normalization
 * 
 * Transforms raw GitHub events into a unified format for decision extraction.
 * 
 * Why normalize?
 * - Unified author identification across different event types
 * - Standardized content extraction for LLM processing
 * - Entity linking (PRs, issues, commits)
 * - Temporal relationship mapping
 * 
 * This creates a clean interface for Phase 3 (Decision Extraction)
 */
export class EventNormalizer {
  constructor(eventStore) {
    this.eventStore = eventStore;
  }

  /**
   * Normalize all events for a repository
   * Creates normalized_events table with standardized format
   */
  async normalizeRepository(repository) {
    console.log(`🔄 Phase 2: Normalizing events for ${repository}`);
    
    await this.createNormalizedTable();
    
    // Get all raw events for this repository
    const rawEvents = await this.eventStore.getEvents({ repository });
    
    console.log(`Processing ${rawEvents.length} raw events...`);
    
    for (const rawEvent of rawEvents) {
      const normalized = await this.normalizeEvent(rawEvent);
      if (normalized) {
        await this.storeNormalizedEvent(normalized);
      }
    }
    
    console.log(`✅ Normalized ${rawEvents.length} events`);
  }

  /**
   * Create normalized events table
   */
  async createNormalizedTable() {
    this.eventStore.db.exec(`
      CREATE TABLE IF NOT EXISTS normalized_events (
        id TEXT PRIMARY KEY,
        original_event_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        event_type TEXT NOT NULL,
        repository TEXT NOT NULL,
        
        -- Unified author information
        author_login TEXT,
        author_name TEXT,
        author_email TEXT,
        
        -- Standardized content
        title TEXT,
        content TEXT,
        content_type TEXT, -- 'description', 'comment', 'commit_message', etc.
        
        -- Entity relationships
        pull_request_number INTEGER,
        issue_number INTEGER,
        commit_sha TEXT,
        parent_event_id TEXT, -- For threaded discussions
        
        -- Decision signals
        decision_indicators JSON, -- Keywords, patterns that suggest decisions
        confidence_score REAL DEFAULT 0.0,
        
        -- Metadata
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        
        FOREIGN KEY (original_event_id) REFERENCES events(id)
      );

      CREATE INDEX IF NOT EXISTS idx_normalized_timestamp ON normalized_events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_normalized_repository ON normalized_events(repository);
      CREATE INDEX IF NOT EXISTS idx_normalized_pr ON normalized_events(pull_request_number);
      CREATE INDEX IF NOT EXISTS idx_normalized_author ON normalized_events(author_login);
      CREATE INDEX IF NOT EXISTS idx_normalized_confidence ON normalized_events(confidence_score);
    `);
  }

  /**
   * Normalize a single event into standardized format
   */
  async normalizeEvent(rawEvent) {
    const normalized = {
      id: `norm_${rawEvent.id}`,
      original_event_id: rawEvent.id,
      timestamp: rawEvent.timestamp,
      event_type: rawEvent.type,
      repository: rawEvent.repository
    };

    // Extract unified author information
    const author = this.extractAuthor(rawEvent);
    Object.assign(normalized, author);

    // Extract standardized content
    const content = this.extractContent(rawEvent);
    Object.assign(normalized, content);

    // Extract entity relationships
    const entities = this.extractEntities(rawEvent);
    Object.assign(normalized, entities);

    // Detect decision indicators
    const decisionSignals = this.detectDecisionIndicators(content.content || '');
    normalized.decision_indicators = JSON.stringify(decisionSignals.indicators);
    normalized.confidence_score = decisionSignals.confidence;

    return normalized;
  }

  /**
   * Extract unified author information
   */
  extractAuthor(rawEvent) {
    const data = rawEvent.data;
    
    switch (rawEvent.type) {
      case 'pull_request':
      case 'issue':
        return {
          author_login: data.author,
          author_name: data.author, // GitHub API doesn't always provide full name
          author_email: null
        };
      
      case 'pr_comment':
      case 'pr_review':
        return {
          author_login: data.author,
          author_name: data.author,
          author_email: null
        };
      
      case 'commit':
        return {
          author_login: data.author,
          author_name: data.author,
          author_email: data.author_email
        };
      
      default:
        return {
          author_login: null,
          author_name: null,
          author_email: null
        };
    }
  }

  /**
   * Extract standardized content for LLM processing
   */
  extractContent(rawEvent) {
    const data = rawEvent.data;
    
    switch (rawEvent.type) {
      case 'pull_request':
        return {
          title: data.title,
          content: data.body || '',
          content_type: 'pr_description'
        };
      
      case 'issue':
        return {
          title: data.title,
          content: data.body || '',
          content_type: 'issue_description'
        };
      
      case 'pr_comment':
        return {
          title: null,
          content: data.body || '',
          content_type: 'comment'
        };
      
      case 'pr_review':
        return {
          title: null,
          content: data.body || '',
          content_type: 'review'
        };
      
      case 'commit':
        return {
          title: data.message.split('\n')[0], // First line as title
          content: data.message,
          content_type: 'commit_message'
        };
      
      default:
        return {
          title: null,
          content: '',
          content_type: 'unknown'
        };
    }
  }

  /**
   * Extract entity relationships for graph construction
   */
  extractEntities(rawEvent) {
    const data = rawEvent.data;
    const entities = {
      pull_request_number: null,
      issue_number: null,
      commit_sha: null,
      parent_event_id: null
    };

    switch (rawEvent.type) {
      case 'pull_request':
        entities.pull_request_number = data.number;
        break;
      
      case 'issue':
        entities.issue_number = data.number;
        break;
      
      case 'pr_comment':
      case 'pr_review':
        entities.pull_request_number = data.pr_number;
        break;
      
      case 'commit':
        entities.commit_sha = data.sha;
        break;
    }

    return entities;
  }

  /**
   * Detect linguistic patterns that indicate decisions
   * This is a simple rule-based approach - Phase 3 will use LLMs
   */
  detectDecisionIndicators(content) {
    if (!content) {
      return { indicators: [], confidence: 0.0 };
    }

    const text = content.toLowerCase();
    const indicators = [];
    let confidence = 0.0;

    // Decision keywords and phrases
    const decisionPatterns = [
      // Explicit decisions
      { pattern: /\b(decided?|decision|choose|chose|selected?)\b/g, weight: 0.8, type: 'explicit_decision' },
      { pattern: /\b(approved?|rejected?|accepted?)\b/g, weight: 0.7, type: 'approval_decision' },
      { pattern: /\b(let's (go with|use|implement))\b/g, weight: 0.6, type: 'implementation_decision' },
      
      // Tradeoff discussions
      { pattern: /\b(tradeoff|trade-off|pros? and cons?)\b/g, weight: 0.5, type: 'tradeoff_analysis' },
      { pattern: /\b(because|since|due to|reason)\b/g, weight: 0.3, type: 'rationale' },
      { pattern: /\b(however|but|although|instead)\b/g, weight: 0.2, type: 'alternative_consideration' },
      
      // Technical decisions
      { pattern: /\b(architecture|design|approach|strategy)\b/g, weight: 0.4, type: 'technical_decision' },
      { pattern: /\b(performance|scalability|maintainability)\b/g, weight: 0.3, type: 'quality_attribute' },
      
      // Implementation signals
      { pattern: /\b(implement|refactor|migrate|upgrade)\b/g, weight: 0.3, type: 'implementation_signal' },
      { pattern: /\b(fix|bug|issue|problem)\b/g, weight: 0.2, type: 'problem_solving' }
    ];

    for (const { pattern, weight, type } of decisionPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        indicators.push({
          type,
          count: matches.length,
          weight,
          examples: matches.slice(0, 3) // Keep first 3 examples
        });
        confidence += Math.min(matches.length * weight, weight * 2); // Cap contribution
      }
    }

    // Normalize confidence to 0-1 range
    confidence = Math.min(confidence, 1.0);

    return { indicators, confidence };
  }

  /**
   * Store normalized event
   */
  async storeNormalizedEvent(normalized) {
    const stmt = this.eventStore.db.prepare(`
      INSERT OR REPLACE INTO normalized_events (
        id, original_event_id, timestamp, event_type, repository,
        author_login, author_name, author_email,
        title, content, content_type,
        pull_request_number, issue_number, commit_sha, parent_event_id,
        decision_indicators, confidence_score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      normalized.id,
      normalized.original_event_id,
      normalized.timestamp,
      normalized.event_type,
      normalized.repository,
      normalized.author_login,
      normalized.author_name,
      normalized.author_email,
      normalized.title,
      normalized.content,
      normalized.content_type,
      normalized.pull_request_number,
      normalized.issue_number,
      normalized.commit_sha,
      normalized.parent_event_id,
      normalized.decision_indicators,
      normalized.confidence_score
    );
  }

  /**
   * Get normalized events with decision indicators
   */
  async getDecisionCandidates(repository, minConfidence = 0.3) {
    const stmt = this.eventStore.db.prepare(`
      SELECT * FROM normalized_events 
      WHERE repository = ? 
        AND confidence_score >= ?
      ORDER BY confidence_score DESC, timestamp DESC
    `);

    const rows = stmt.all(repository, minConfidence);
    
    return rows.map(row => ({
      ...row,
      decision_indicators: JSON.parse(row.decision_indicators || '[]')
    }));
  }

  /**
   * Get normalization statistics
   */
  async getNormalizationStats(repository) {
    const totalNormalized = this.eventStore.db.prepare(`
      SELECT COUNT(*) as count FROM normalized_events WHERE repository = ?
    `).get(repository);

    const byConfidence = this.eventStore.db.prepare(`
      SELECT 
        CASE 
          WHEN confidence_score >= 0.7 THEN 'high'
          WHEN confidence_score >= 0.4 THEN 'medium'
          WHEN confidence_score >= 0.1 THEN 'low'
          ELSE 'none'
        END as confidence_level,
        COUNT(*) as count
      FROM normalized_events 
      WHERE repository = ?
      GROUP BY confidence_level
      ORDER BY count DESC
    `).all(repository);

    const byEventType = this.eventStore.db.prepare(`
      SELECT event_type, COUNT(*) as count, AVG(confidence_score) as avg_confidence
      FROM normalized_events 
      WHERE repository = ?
      GROUP BY event_type
      ORDER BY count DESC
    `).all(repository);

    return {
      total: totalNormalized.count,
      byConfidence,
      byEventType
    };
  }
}