# Conversational BI — Implementation Plan

**A RAG + MCP Reference Architecture for Conversational Business Intelligence**

| | |
|---|---|
| **Author** | Jerome Benton |
| **Date** | February 2026 |
| **Status** | Planning / Pre-Implementation |
| **Stack** | Next.js + Claude + ChromaDB + MCP |

---

## 1. Executive Summary

This document outlines the implementation plan for a Conversational BI application that demonstrates how Retrieval-Augmented Generation (RAG) and the Model Context Protocol (MCP) work together to enable natural-language analytics over enterprise data. The application will be hosted on Vercel, published as an open-source repository, and serve as both a public portfolio piece and a teaching tool for post-graduate students.

Users open the app, type a question in natural language, and receive grounded, source-backed analytical responses complete with dynamically generated charts. The interface is powered by a pre-built embeddings database (ChromaDB) over hundreds of e-commerce order spreadsheets, with Claude as the LLM and custom MCP servers providing charting and analysis tools.

**Core Value Proposition:**

- **For hiring managers:** A production-grade AI application demonstrating full-stack engineering, LLM integration, and data architecture.
- **For students:** A clear, decomposable reference architecture showing exactly where RAG ends and MCP begins.
- **For the community:** An open-source template for building conversational interfaces over structured data.

---

## 2. Architecture Overview

### 2.1 System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  PRESENTATION LAYER                                         │
│  Next.js App Router  |  Chat UI  |  Recharts Visualizations │
├─────────────────────────────────────────────────────────────┤
│           ↓               ↓               ↓                 │
├─────────────────────────────────────────────────────────────┤
│  INTELLIGENCE LAYER                                         │
│  Claude API  |  MCP Tool Server  |  RAG Retrieval           │
├─────────────────────────────────────────────────────────────┤
│           ↓               ↓               ↓                 │
├─────────────────────────────────────────────────────────────┤
│  DATA LAYER                                                 │
│  Chroma Cloud (Vectors)  |  Voyage AI (Embeddings)          │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Request Flow

1. **User submits query:** "What were our top product categories last quarter?"
2. **Next.js API route** forwards the message to Claude with the system prompt and tool definitions.
3. **Claude analyzes intent** and issues tool calls: `semantic_search` for relevant data chunks, then `generate_chart_config` for visualization.
4. **MCP tool server executes:** queries Chroma Cloud, aggregates results, returns structured data.
5. **Claude synthesizes** the tool results into a natural-language response with a chart configuration.
6. **Frontend renders** the text response and dynamically generates a Recharts visualization from the config.

### 2.3 RAG vs. MCP Boundary

This is the key pedagogical distinction the app demonstrates:

| Concern | RAG (Retrieval) | MCP (Tools) |
|---------|-----------------|-------------|
| Purpose | Grounds the LLM in source data | Extends the LLM with capabilities |
| What it provides | Context: relevant data chunks | Actions: charting, aggregation, export |
| When it runs | Before Claude generates a response | During response generation (tool calls) |
| Implementation | Chroma Cloud vector search | Custom MCP server with tool definitions |
| Teaching analogy | "The LLM's reference library" | "The LLM's toolkit" |

---

## 3. Technology Stack

### 3.1 Stack Decisions

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | Next.js 15+ (App Router) | Server components, API routes, streaming support, native Vercel deployment |
| Hosting | Vercel | Zero-config Next.js deployment, edge functions, serverless API routes |
| LLM | Claude (Anthropic API) | Best-in-class tool use, structured output, streaming responses |
| Vector Store | Chroma Cloud | Serverless-compatible, JS SDK, built-in metadata filtering |
| Embeddings | Voyage AI (voyage-3.5) | Anthropic-recommended, high retrieval quality, query/document input types |
| MCP SDK | @modelcontextprotocol/sdk | Official TypeScript SDK for building custom tool servers |
| Charting | Recharts | React-native, SVG-based, simple config-driven API, great for chat UIs |
| Styling | Tailwind CSS | Utility-first, rapid UI development, consistent design system |
| Data Source | Kaggle eCommerce dataset | Real transaction data with natural messiness and volume |

### 3.2 Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| next | 15.x+ | Framework |
| @anthropic-ai/sdk | latest | Claude API client |
| chromadb | 3.x | Vector store client (Chroma Cloud) |
| @modelcontextprotocol/sdk | latest | MCP server/client SDK |
| recharts | 2.x | Chart rendering |
| ai | latest | Vercel AI SDK for streaming chat UI |
| zod | 3.x | Schema validation for tool inputs |
| tailwindcss | 4.x | Styling |
| papaparse | 5.x | CSV parsing for data ingestion |

---

## 4. Data Strategy

### 4.1 Source Dataset

The primary dataset is the **eCommerce Behavior Data from Multi-Category Store** available on Kaggle. This dataset contains approximately 26 million events (product views, add-to-cart actions, and purchases) across multiple product categories with temporal data suitable for trend analysis.

**Why this dataset:** Real transaction data with natural messiness (missing values, outliers, inconsistent categories). Multiple event types enable funnel analysis. Temporal dimension supports time-series questions. Publicly available under open license.

### 4.2 Data Preparation Pipeline

The embedding pipeline is a separate utility (Jupyter notebook or Python script) that lives in a `/data` directory of the repo. It is NOT part of the deployed app.

1. **Download and partition:** Pull the Kaggle dataset and split it into logical spreadsheet files by category, time period, or region. This simulates the "hundreds of Excel files" scenario.
2. **Clean and enrich:** Add controlled noise (3-8% null values, date format inconsistencies, duplicate entries) to files that are too clean. Add metadata columns where helpful.
3. **Chunk with context:** For each row, generate a human-readable context string. Example: "Purchase event: user 12345 bought Samsung Galaxy (electronics) for $899 on 2024-03-15."
4. **Embed with Voyage AI:** Send context strings to voyage-3.5 with `input_type='document'`. Batch process in groups of 100-500.
5. **Store in Chroma Cloud:** Upload embeddings with full metadata (category, date, price, event_type) to enable filtered retrieval.

### 4.3 Chunking Strategy

Tabular data requires a layout-aware, metadata-enriched chunking approach:

| Component | Example | Purpose |
|-----------|---------|---------|
| Context string (embedded) | "Purchase: user 12345 bought Samsung Galaxy (electronics) for $899 on 2024-03-15" | Human-readable summary for semantic search |
| Structured metadata (filterable) | `{ category: "electronics", price: 899, event_type: "purchase" }` | Enables pre-filtering before vector similarity |
| Raw row data (stored) | Full JSON of original row fields | Returned to Claude for precise analysis |

Target chunk size: 400-512 tokens per row (85-90% recall in benchmarks).

---

## 5. MCP Tool Design

### 5.1 Tool Inventory

| Tool Name | Description | Input | Returns |
|-----------|-------------|-------|---------|
| `semantic_search` | Search embeddings for data relevant to user query | query, limit, filters | Matching chunks with scores and metadata |
| `aggregate_data` | Perform aggregations (sum, avg, count, group-by) | operation, groupBy, metric | Aggregated results as structured JSON |
| `generate_chart_config` | Produce a Recharts-compatible chart spec | chartType, data, xAxis, yAxis, title | Complete Recharts config object |
| `compare_periods` | Compare metrics across two time periods | metric, period1, period2 | Delta values, percentage changes, trend |
| `export_summary` | Format analysis into a structured summary | title, findings, chartConfigs | Formatted summary with text and chart refs |

### 5.2 MCP Server Architecture

The MCP server runs as a Next.js API route using the Vercel MCP handler pattern. Key decisions:

- **Streamable HTTP transport** (not SSE) for client-server communication
- **Stateless tool execution:** each tool call is independent; conversation context managed by Claude
- **Chroma Cloud connection:** the MCP server holds a client reference and queries during tool calls
- **Chart configs as data:** `generate_chart_config` returns JSON that the frontend renders; Claude decides chart type, the tool validates and structures it

---

## 6. Frontend Design

### 6.1 Page Structure

| Component | Purpose | Key Features |
|-----------|---------|-------------|
| Header bar | Branding and context | App name, GitHub link, description |
| Chat panel (main) | Conversation interface | Message history, streaming, citations |
| Chart renderer | Inline visualizations | Recharts from Claude-generated configs |
| Sidebar (optional) | Dataset explorer | Browse categories, sample questions |
| Source drawer | Citation transparency | Expandable refs to source data chunks |

### 6.2 Chat Message Types

Messages can contain: text responses (Claude's analysis), chart blocks (Recharts from JSON config), data tables (raw numbers), source citations (collapsible chunk references), and suggested follow-up chips.

### 6.3 Streaming UX

The interface uses the Vercel AI SDK to stream Claude's responses in real time. Text appears token-by-token, and chart configurations are parsed incrementally so visualizations render as soon as the config is complete.

---

## 7. Project Structure

```
conversational-bi/
├── app/
│   ├── page.tsx                 # Main chat interface
│   ├── layout.tsx               # Root layout with metadata
│   └── api/
│       ├── chat/route.ts        # Claude conversation endpoint (streaming)
│       └── mcp/route.ts         # MCP tool server (Vercel handler)
├── components/
│   ├── chat/                    # ChatPanel, MessageBubble, InputBar
│   ├── charts/                  # DynamicChart, ChartRenderer
│   ├── data/                    # DataTable, SourceDrawer
│   └── ui/                      # Shared UI primitives
├── lib/
│   ├── claude.ts                # Anthropic SDK client + tool definitions
│   ├── chroma.ts                # Chroma Cloud client + query helpers
│   ├── mcp-tools.ts             # MCP tool implementations
│   └── types.ts                 # Shared TypeScript interfaces
├── data/                        # Data pipeline (NOT deployed)
│   ├── notebooks/               # Jupyter notebooks for embedding pipeline
│   ├── scripts/                 # Data download, cleaning, chunking scripts
│   └── samples/                 # Sample spreadsheets for local dev
├── public/                      # Static assets
├── .env.example                 # Required environment variables template
└── README.md                    # Setup guide, architecture docs, teaching notes
```

---

## 8. Implementation Roadmap

### Phase 1: Foundation
*Estimated effort: 2-3 hours | Deliverable: Deployable skeleton on Vercel*

- Initialize Next.js project with App Router, Tailwind CSS, and TypeScript
- Set up project structure matching Section 7
- Create basic chat UI with text input, message list, and placeholder responses
- Configure Vercel deployment with environment variables
- Wire up Anthropic SDK in API route with simple response (no tools yet)
- Deploy to Vercel and verify end-to-end flow

### Phase 2: Data Pipeline + RAG
*Estimated effort: 3-4 hours | Deliverable: Semantic search over embedded data*

- Download Kaggle dataset and write partitioning script
- Implement chunking pipeline with context string generation
- Set up Chroma Cloud + Voyage AI embeddings
- Run embedding pipeline to populate Chroma Cloud
- Implement `semantic_search` tool and wire into Claude's tool definitions
- Test full RAG loop: question → retrieval → grounded response with citations

### Phase 3: MCP Tools + Analysis
*Estimated effort: 3-4 hours | Deliverable: Multi-tool analysis with aggregations*

- Implement remaining MCP tools: `aggregate_data`, `compare_periods`, `export_summary`
- Define Zod schemas for all tool inputs
- Refine Claude system prompt for tool selection guidance
- Test multi-step tool chains
- Add `generate_chart_config` tool producing Recharts JSON
- Implement parallel tool execution

### Phase 4: Visualization + Polish
*Estimated effort: 3-4 hours | Deliverable: Full-featured chat with inline charts*

- Build DynamicChart component for line, bar, pie, scatter from config objects
- Implement streaming response parsing for progressive chart rendering
- Add source citation drawer with expandable references
- Build suggested follow-up chips
- Add optional sidebar with dataset browsing and sample starters
- Responsive design pass for mobile and tablet

### Phase 5: Documentation + Launch
*Estimated effort: 2-3 hours | Deliverable: Public repo + live demo*

- Comprehensive README with architecture diagrams and teaching notes
- Inline code comments at every RAG/MCP integration point
- `.env.example` with documented API key requirements
- "How This Works" section in the app UI
- Final testing pass
- Publish to GitHub, deploy to Vercel, share

---

## 9. Environment Variables

| Variable | Source | Purpose |
|----------|--------|---------|
| `ANTHROPIC_API_KEY` | console.anthropic.com | Claude API authentication |
| `CHROMA_API_KEY` | trychroma.com dashboard | Chroma Cloud authentication |
| `CHROMA_COLLECTION_NAME` | Set during pipeline | Embeddings collection name |
| `VOYAGE_API_KEY` | voyageai.com dashboard | Voyage AI embedding model |
| `NEXT_PUBLIC_APP_URL` | Vercel deployment URL | Base URL for deployed app |

---

## 10. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| API costs for public demo | High usage = significant bills | Rate limiting per session, daily usage counter, cached responses for common queries |
| Chroma Cloud latency | Serverless cold starts slow first query | Pre-warm with health-check endpoint, use caching, set Vercel timeout |
| Chart rendering edge cases | Claude may generate invalid configs | Zod validation before render, graceful fallback to data table |
| Dataset licensing | Kaggle terms may restrict use | Verify license (CC0/CC-BY preferred), document attribution |
| Context window limits | Large retrievals exceed Claude context | Limit to top-k (5-10 chunks), summarize before sending |
| Embedding drift | Voyage AI updates change quality | Pin model version, document in metadata, plan re-embedding |

---

## 11. Future Enhancements

- **User-uploaded data:** Allow visitors to upload CSV/Excel, embed on the fly, and query
- **Web search augmentation:** Optional MCP tool for web search beyond embeddings
- **Conversation memory:** Persist history across sessions
- **Export capabilities:** Charts as PNG, summaries as PDF, data as CSV
- **Multi-model comparison:** Toggle between Claude, GPT-4, and open-source models
- **Collaborative analysis:** Shareable conversation links for team review

---

## 12. Handoff to Claude Code

1. Create a new repository and copy this document as `PLAN.md` in the root.
2. Open Claude Code in the repository directory.
3. Instruct Claude Code: "Read PLAN.md and implement Phase 1 of the Conversational BI application."
4. Proceed phase by phase, reviewing each deployment before starting the next.

**Handoff Checklist:**
- [ ] PLAN.md is in the repo root
- [ ] API keys for Anthropic, Chroma Cloud, and Voyage AI are provisioned
- [ ] Kaggle dataset is downloaded (or download script is ready)
- [ ] Vercel account is connected to the GitHub repository
