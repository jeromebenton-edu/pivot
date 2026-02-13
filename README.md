# Pivot - Conversational Business Intelligence Platform

A production-ready AI-powered business intelligence platform demonstrating how Retrieval-Augmented Generation (RAG) and the Model Context Protocol (MCP) work together to enable natural-language analytics, ARIMA forecasting, and dynamic visualizations over enterprise data.

## 🎯 Overview

This application demonstrates a clear architectural pattern for building conversational interfaces over structured data. Users can ask questions in natural language and receive grounded, source-backed analytical responses complete with dynamically generated charts.

### Core Value Proposition

- **For hiring managers:** A production-grade AI application demonstrating full-stack engineering, LLM integration, and data architecture
- **For students:** A clear, decomposable reference architecture showing exactly where RAG ends and MCP begins
- **For the community:** An open-source template for building conversational interfaces over structured data

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  PRESENTATION LAYER                                         │
│  Next.js App Router  |  Chat UI  |  Recharts Visualizations │
├─────────────────────────────────────────────────────────────┤
│  INTELLIGENCE LAYER                                         │
│  Anthropic API  |  MCP Tool Server  |  RAG Retrieval        │
├─────────────────────────────────────────────────────────────┤
│  DATA LAYER                                                 │
│  Chroma Cloud (Vectors)  |  Voyage AI (Embeddings)          │
└─────────────────────────────────────────────────────────────┘
```

### RAG vs MCP Distinction

| Concern | RAG (Retrieval) | MCP (Tools) |
|---------|-----------------|-------------|
| **Purpose** | Grounds the LLM in source data | Extends the LLM with capabilities |
| **What it provides** | Context: relevant data chunks | Actions: charting, aggregation, export |
| **When it runs** | Before LLM generates a response | During response generation (tool calls) |
| **Implementation** | Chroma Cloud vector search | Custom MCP server with tool definitions |

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- API keys for:
  - [Anthropic](https://console.anthropic.com) - Required
  - [Chroma Cloud](https://trychroma.com) - Optional (for cloud vector storage)
  - [Voyage AI](https://voyageai.com) - Optional (for external embeddings)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/jeromebenton-edu/pivot
cd pivot
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env.local
```

Edit `.env.local` and add your API keys:
```env
ANTHROPIC_API_KEY=your_anthropic_api_key_here
CHROMA_API_KEY=your_chroma_api_key_here
CHROMA_COLLECTION_NAME=pivot-embeddings
VOYAGE_API_KEY=your_voyage_api_key_here
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## 📁 Project Structure

```
pivot/
├── app/
│   ├── page.tsx                 # Main chat interface
│   ├── layout.tsx               # Root layout with metadata
│   └── api/
│       ├── chat/route.ts        # Anthropic conversation endpoint
│       └── mcp/route.ts         # MCP tool server
├── components/
│   ├── chat/                    # ChatPanel, MessageBubble, InputBar
│   ├── charts/                  # Chart rendering components
│   ├── data/                    # Data display components
│   └── ui/                      # Shared UI primitives
├── lib/
│   ├── claude.ts                # Anthropic SDK client
│   ├── chroma.ts                # Chroma Cloud client
│   ├── mcp-tools.ts             # MCP tool implementations
│   └── types.ts                 # TypeScript interfaces
├── data/                        # Data pipeline (not deployed)
│   ├── notebooks/               # Jupyter notebooks
│   ├── scripts/                 # Data processing scripts
│   └── samples/                 # Sample data files
└── public/                      # Static assets
```

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | Next.js 15 (App Router) | Server components, streaming UI |
| **Hosting** | Vercel | Edge deployment, serverless functions |
| **LLM** | Anthropic API | Tool use, structured output |
| **Vector Store** | Chroma Cloud | Serverless vector search |
| **Embeddings** | Voyage AI (voyage-3.5) | High-quality retrieval |
| **Charts** | Recharts | React-native visualizations |
| **Styling** | Tailwind CSS | Utility-first design |

## 📊 Implementation Status

### ✅ Phase 1: Foundation (Completed)
- Next.js project setup with TypeScript and Tailwind
- Basic chat UI with message input and display
- Anthropic API integration with streaming responses
- Environment configuration
- Vercel deployment readiness

### ✅ Phase 2: Data Pipeline + RAG (Completed)
- E-commerce dataset integration with sample data
- Chunking and embedding pipeline implementation
- In-memory vector store with ChromaDB client
- Semantic search with context injection
- Source attribution and citation system

### ✅ Phase 3: MCP Tools + Analysis (Completed)
- Full MCP tool server implementation
- Data aggregation tools (sum, average, group_by)
- Dynamic chart configuration generation
- Compare periods functionality
- Export summary capabilities

### ✅ Phase 4: Visualization + Polish (Completed)
- Dynamic chart rendering with Recharts
- ARIMA forecasting with confidence intervals
- Multi-month revenue projections
- Responsive design with Tailwind CSS
- Performance optimization and lazy loading
- Error boundaries and rate limiting
- Security hardening and input validation

### 🚀 Phase 5: Production Ready (Current)
- Comprehensive documentation
- Security audit completed (0 vulnerabilities)
- Deployed and ready for production use
- Clean commit history
- Full TypeScript type safety

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Anthropic for the Model Context Protocol
- Chroma for the vector database
- Voyage AI for embeddings
- The Next.js and Vercel teams

## 📧 Contact

For questions or feedback, please open an issue on GitHub or contact the maintainer.

---

**Status:** This is a fully implemented production-ready application with all features complete. The platform includes RAG retrieval, MCP tools, ARIMA forecasting, and dynamic data visualization capabilities. Ready for deployment and production use.
