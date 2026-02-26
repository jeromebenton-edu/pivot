# Claude Code Memory - Pivot Project

## Project Overview
Business Intelligence chat application with RAG (Retrieval-Augmented Generation) for analyzing e-commerce data from 2024.

## Recent Work - OpenAI Integration (Feb 14, 2026)

### Problem Solved
- User's Anthropic API key only had access to Claude 3 Haiku (lowest tier)
- Despite having Claude Pro Max subscription, API access is separate and requires $400/month for better models
- Poor accuracy and hallucinations with Haiku model

### Solution Implemented
- Added OpenAI GPT integration as alternative to Anthropic
- Created unified LLM client that auto-selects provider based on available API keys
- Configured to use GPT-5.2 as primary model (user has enterprise access)

### Key Files Modified
1. **`/lib/openai.ts`** - NEW - OpenAI client configuration with GPT-5.2 priority
2. **`/lib/llm-client.ts`** - NEW - Unified client supporting both providers
3. **`/lib/env.ts`** - Made ANTHROPIC_API_KEY optional, added OPENAI_API_KEY
4. **`/app/api/chat/route.ts`** - Updated to use unified LLM client
5. **`.env.example`** - Updated with OpenAI configuration

### Model Priority
```javascript
// OpenAI models (in order of preference)
const models = [
  'gpt-5.2',       // Latest GPT-5.2 model
  'gpt-5',         // GPT-5 base
  'gpt-4o',        // GPT-4 Omni
  'gpt-4-turbo',   // GPT-4 Turbo
  'gpt-4',         // Original GPT-4
  'gpt-3.5-turbo', // Fallback
];
```

### Dataset Information
- Time period: January - December 2024
- Total revenue: $393,744.62
- 2,000 transactions: 663 views, 628 cart adds, 709 completed purchases
- Cart abandonment rate: 68.5%
- 4 regions: Asia ($114k), Europe ($100k), North America ($97k), South America ($83k)
- Q3 total: $100,922.97
- Q4 total: $88,374.66

### Testing Commands
```bash
# Test OpenAI models availability
node test-openai.js

# Test Anthropic models (if needed)
node test-models.js

# Run development server
npm run dev

# Build for production
npm run build
```

### Environment Variables
Required in `.env.local`:
```
# Choose one or both:
OPENAI_API_KEY=your-enterprise-key-here
ANTHROPIC_API_KEY=your-api-key-here

# Other required:
NEXT_PUBLIC_BASE_URL=http://localhost:3000
VOYAGE_API_KEY=your-voyage-key
CHROMA_API_KEY=your-chroma-key
CHROMA_COLLECTION_NAME=pivot-embeddings
```

### Deployment Notes
- Deployed on Vercel
- Environment variables must be set in Vercel dashboard
- App automatically selects OpenAI if OPENAI_API_KEY is present

### Chart Generation Logic
- "plot" keyword → bar charts (not pie charts)
- Q3 vs Q4 comparisons → line charts with time series
- Conversion rates → bar charts by region
- Cart abandonment → visualization showing 68.5% rate

### Previous Issues Fixed
1. Q3 vs Q4 comparison showing wrong chart type
2. "Plot conversion rate" showing pie instead of bar chart
3. LLM hallucinating data instead of using RAG results
4. Claude API tier limitations (only Haiku access on free tier)