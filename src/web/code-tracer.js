/**
 * Code Tracer - Maps code components to their decision history
 */
export class CodeTracer {
  constructor(eventStore) {
    this.eventStore = eventStore;
  }

  async searchCodeComponents(query, repository = null) {
    console.log(`🔍 Searching for: "${query}"`);

    const results = await Promise.all([
      this.searchInCommits(query, repository),
      this.searchInPullRequests(query, repository),
      this.searchInComments(query, repository)
    ]);

    const allResults = results.flat();
    const uniqueResults = this.deduplicateResults(allResults);

    return uniqueResults
      .map(result => ({
        ...result,
        relevance_score: this.calculateComponentRelevance(result, query)
      }))
      .filter(result => result.relevance_score > 0.2)
      .sort((a, b) => b.relevance_score - a.relevance_score)
      .slice(0, 20);
  }

  async searchInCommits(query, repository) {
    const events = await this.eventStore.searchEvents(query, {
      repository,
      type: 'commit',
      limit: 50
    });

    return events.map(event => ({
      type: 'commit',
      component: query,
      repository: event.repository,
      title: event.data.message.split('\n')[0],
      description: event.data.message,
      author: event.data.author,
      timestamp: event.timestamp,
      source_url: `https://github.com/${event.repository}/commit/${event.data.sha}`,
      context: 'Implementation',
      event_id: event.id
    }));
  }

  async searchInPullRequests(query, repository) {
    const events = await this.eventStore.searchEvents(query, {
      repository,
      type: 'pull_request',
      limit: 50
    });

    return events.map(event => ({
      type: 'pull_request',
      component: query,
      repository: event.repository,
      title: event.data.title,
      description: event.data.body || '',
      author: event.data.author,
      timestamp: event.timestamp,
      source_url: `https://github.com/${event.repository}/pull/${event.data.number}`,
      context: 'Feature/Change Request',
      event_id: event.id,
      pr_number: event.data.number,
      state: event.data.state
    }));
  }

  async searchInComments(query, repository) {
    const events = await this.eventStore.searchEvents(query, {
      repository,
      type: 'pr_comment',
      limit: 50
    });

    return events.map(event => ({
      type: 'comment',
      component: query,
      repository: event.repository,
      title: `Comment on PR #${event.data.pr_number}`,
      description: event.data.body,
      author: event.data.author,
      timestamp: event.timestamp,
      source_url: `https://github.com/${event.repository}/pull/${event.data.pr_number}`,
      context: 'Discussion',
      event_id: event.id,
      pr_number: event.data.pr_number
    }));
  }

  calculateComponentRelevance(result, query) {
    const queryLower = query.toLowerCase();
    let score = 0;

    if (result.component.toLowerCase() === queryLower) {
      score += 1.0;
    }

    if (result.title.toLowerCase().includes(queryLower)) {
      score += 0.6;
    }

    if (result.description.toLowerCase().includes(queryLower)) {
      score += 0.4;
    }

    if (result.type === 'pull_request') {
      score += 0.3;
    } else if (result.type === 'commit') {
      score += 0.2;
    }

    return Math.min(score, 1.0);
  }

  deduplicateResults(results) {
    const seen = new Set();
    return results.filter(result => {
      const key = `${result.repository}:${result.component}:${result.type}:${result.event_id}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }
}