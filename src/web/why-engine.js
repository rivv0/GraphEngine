/**
 * Why Engine - Core logic for answering "Why does this exist?"
 */
export class WhyEngine {
  constructor(eventStore) {
    this.eventStore = eventStore;
  }

  async explainComponent(repository, componentName) {
    console.log(`🔍 Explaining: ${componentName} in ${repository}`);

    const relatedEvents = await this.findRelatedEvents(repository, componentName);
    const decisions = await this.findRelatedDecisions(repository, componentName);
    
    return {
      component: componentName,
      repository: repository,
      summary: this.generateSummary(decisions, relatedEvents),
      decisions: decisions.map(d => this.formatDecision(d)),
      timeline: await this.buildTimeline(relatedEvents, decisions),
      evidence: {
        total_events: relatedEvents.length,
        decision_count: decisions.length,
        confidence_score: this.calculateConfidence(decisions, relatedEvents),
        data_freshness: this.assessFreshness(relatedEvents)
      },
      gaps: this.identifyGaps(decisions, relatedEvents),
      generated_at: new Date().toISOString()
    };
  }

  async findRelatedEvents(repository, componentName) {
    const searchTerms = [componentName, componentName.toLowerCase()];
    const allEvents = [];
    
    for (const term of searchTerms) {
      const events = await this.eventStore.searchEvents(term, {
        repository,
        limit: 50
      });
      allEvents.push(...events);
    }

    const uniqueEvents = allEvents.filter((event, index, self) => 
      index === self.findIndex(e => e.id === event.id)
    );

    return uniqueEvents
      .map(event => ({
        ...event,
        relevance_score: this.calculateRelevanceScore(event, componentName)
      }))
      .filter(event => event.relevance_score > 0.1)
      .sort((a, b) => b.relevance_score - a.relevance_score);
  }

  async findRelatedDecisions(repository, componentName) {
    try {
      const decisions = this.eventStore.db.prepare(`
        SELECT * FROM decisions 
        WHERE repository = ? 
          AND (decision_statement LIKE ? OR rationale LIKE ?)
        ORDER BY extraction_confidence DESC, timestamp DESC
      `).all(repository, `%${componentName}%`, `%${componentName}%`);

      return decisions.map(decision => ({
        ...decision,
        involved_parties: JSON.parse(decision.involved_parties || '[]')
      }));
    } catch (error) {
      return [];
    }
  }

  calculateRelevanceScore(event, componentName) {
    const content = `${event.data.title || ''} ${event.data.body || event.data.message || ''}`.toLowerCase();
    const component = componentName.toLowerCase();
    
    let score = 0;
    
    if ((event.data.title || '').toLowerCase().includes(component)) {
      score += 0.8;
    }
    
    if (content.includes(component)) {
      score += 0.6;
    }
    
    if (event.type === 'pull_request') {
      score += 0.2;
    }
    
    return Math.min(score, 1.0);
  }

  generateSummary(decisions, events) {
    if (decisions.length === 0 && events.length === 0) {
      return {
        text: "No recorded decisions or discussions found for this component.",
        confidence: "none",
        gaps: ["No decision history available"]
      };
    }

    if (decisions.length === 0) {
      return {
        text: `Found ${events.length} related discussions but no structured decisions recorded.`,
        confidence: "low",
        gaps: ["Decision extraction not completed"]
      };
    }

    const primaryDecision = decisions[0];
    let summary = primaryDecision.decision_statement;
    
    if (primaryDecision.rationale) {
      summary += ` Rationale: ${primaryDecision.rationale}`;
    }

    return {
      text: summary,
      confidence: this.mapConfidenceLevel(primaryDecision.extraction_confidence),
      primary_decision_maker: primaryDecision.primary_decision_maker
    };
  }

  formatDecision(decision) {
    return {
      id: decision.id,
      statement: decision.decision_statement,
      rationale: decision.rationale,
      type: decision.decision_type,
      scope: decision.scope,
      reversibility: decision.reversibility,
      decision_maker: decision.primary_decision_maker,
      confidence: this.mapConfidenceLevel(decision.extraction_confidence),
      timestamp: decision.timestamp,
      related_pr: decision.related_pr_number
    };
  }

  async buildTimeline(events, decisions) {
    const timelineItems = [];
    
    events.forEach(event => {
      timelineItems.push({
        type: 'event',
        timestamp: event.timestamp,
        event_type: event.type,
        author: event.data.author || 'system',
        title: event.data.title || event.data.message?.split('\n')[0] || 'Event',
        content: event.data.body || event.data.message || '',
        source_url: this.generateSourceUrl(event)
      });
    });
    
    decisions.forEach(decision => {
      timelineItems.push({
        type: 'decision',
        timestamp: decision.timestamp,
        author: decision.primary_decision_maker,
        title: decision.decision_statement,
        rationale: decision.rationale
      });
    });
    
    return timelineItems.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }

  calculateConfidence(decisions, events) {
    if (decisions.length === 0) {
      return events.length > 0 ? 0.3 : 0.0;
    }
    
    const avgDecisionConfidence = decisions.reduce((sum, d) => sum + d.extraction_confidence, 0) / decisions.length;
    return avgDecisionConfidence;
  }

  assessFreshness(events) {
    if (events.length === 0) {
      return { level: 'none', last_activity: null };
    }
    
    const latestEvent = events.reduce((latest, event) => 
      new Date(event.timestamp) > new Date(latest.timestamp) ? event : latest
    );
    
    const daysSinceLastActivity = (Date.now() - new Date(latestEvent.timestamp)) / (1000 * 60 * 60 * 24);
    
    let level = 'stale';
    if (daysSinceLastActivity < 30) level = 'fresh';
    else if (daysSinceLastActivity < 180) level = 'recent';
    else if (daysSinceLastActivity < 365) level = 'aging';
    
    return {
      level,
      last_activity: latestEvent.timestamp,
      days_ago: Math.floor(daysSinceLastActivity)
    };
  }

  identifyGaps(decisions, events) {
    const gaps = [];
    
    if (decisions.length === 0) {
      gaps.push("No structured decisions extracted");
    }
    
    if (events.length === 0) {
      gaps.push("No related discussions found");
    }
    
    return gaps;
  }

  async getAvailableRepositories() {
    const stats = await this.eventStore.getStats();
    return stats.byRepository.map(repo => ({
      name: repo.repository,
      event_count: repo.count
    }));
  }

  mapConfidenceLevel(score) {
    if (score >= 0.8) return 'high';
    if (score >= 0.6) return 'medium';
    if (score >= 0.3) return 'low';
    return 'very_low';
  }

  generateSourceUrl(event) {
    const repo = event.repository;
    
    if (event.type === 'pull_request') {
      return `https://github.com/${repo}/pull/${event.data.number}`;
    } else if (event.type === 'commit') {
      return `https://github.com/${repo}/commit/${event.data.sha}`;
    }
    
    return `https://github.com/${repo}`;
  }
}