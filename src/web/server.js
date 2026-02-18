import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { EventStore } from '../storage/event-store.js';
import { WhyEngine } from './why-engine.js';
import { CodeTracer } from './code-tracer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Web-based "Why does this exist?" system
 * 
 * Enables engineers to trace any code/component back to the decisions that shaped it.
 * Core principle: Surface only recorded facts, never guess or invent explanations.
 */
export class WhyServer {
  constructor(config = {}) {
    this.app = express();
    this.port = config.port || 3000;
    this.eventStore = new EventStore(config.dbPath || './storage/events.db');
    this.whyEngine = new WhyEngine(this.eventStore);
    this.codeTracer = new CodeTracer(this.eventStore);
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    // Parse JSON bodies
    this.app.use(express.json());
    
    // Serve static files
    this.app.use(express.static(join(__dirname, 'public')));
    
    // CORS for development
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
      next();
    });
  }

  setupRoutes() {
    // Main application - serve minimal UI by default
    this.app.get('/', (req, res) => {
      res.sendFile(join(__dirname, 'public', 'minimal-ui.html'));
    });

    // Alternative route for original UI
    this.app.get('/classic', (req, res) => {
      res.sendFile(join(__dirname, 'public', 'index.html'));
    });

    // API Routes
    
    // Search for code/components
    this.app.get('/api/search', async (req, res) => {
      try {
        const { q: query, repo } = req.query;
        
        if (!query) {
          return res.status(400).json({ error: 'Query parameter required' });
        }

        const results = await this.codeTracer.searchCodeComponents(query, repo);
        res.json(results);
      } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Search failed' });
      }
    });

    // Get the "why" for a specific component
    this.app.get('/api/why/:repository/:component', async (req, res) => {
      try {
        const { repository, component } = req.params;
        const decodedRepo = decodeURIComponent(repository);
        const decodedComponent = decodeURIComponent(component);
        
        const explanation = await this.whyEngine.explainComponent(decodedRepo, decodedComponent);
        res.json(explanation);
      } catch (error) {
        console.error('Why explanation error:', error);
        res.status(500).json({ error: 'Failed to generate explanation' });
      }
    });

    // Get decision timeline for a component
    this.app.get('/api/timeline/:repository/:component', async (req, res) => {
      try {
        const { repository, component } = req.params;
        const decodedRepo = decodeURIComponent(repository);
        const decodedComponent = decodeURIComponent(component);
        
        const timeline = await this.whyEngine.getDecisionTimeline(decodedRepo, decodedComponent);
        res.json(timeline);
      } catch (error) {
        console.error('Timeline error:', error);
        res.status(500).json({ error: 'Failed to get timeline' });
      }
    });

    // Get evidence for a specific decision
    this.app.get('/api/evidence/:decisionId', async (req, res) => {
      try {
        const { decisionId } = req.params;
        const evidence = await this.whyEngine.getDecisionEvidence(decisionId);
        res.json(evidence);
      } catch (error) {
        console.error('Evidence error:', error);
        res.status(500).json({ error: 'Failed to get evidence' });
      }
    });

    // Get repositories with decision data
    this.app.get('/api/repositories', async (req, res) => {
      try {
        const repos = await this.whyEngine.getAvailableRepositories();
        res.json(repos);
      } catch (error) {
        console.error('Repositories error:', error);
        res.status(500).json({ error: 'Failed to get repositories' });
      }
    });

    // Health check
    this.app.get('/api/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });
  }

  async start() {
    await this.eventStore.initialize();
    
    this.app.listen(this.port, () => {
      console.log(`🌐 Why Engine running at http://localhost:${this.port}`);
      console.log(`📊 Database: ${this.eventStore.dbPath}`);
    });
  }
}