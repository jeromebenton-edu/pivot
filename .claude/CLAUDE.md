# CLAUDE.md - AI Assistant Guidelines for Pivot Project

## Project Overview
Pivot is a conversational business intelligence platform with RAG (Retrieval-Augmented Generation) and SARIMA forecasting capabilities.

## Key Commands to Run
When making code changes, always run:
```bash
npm run lint      # Check for linting errors
npm run typecheck # Check for TypeScript errors
npm run build     # Ensure the project builds
```

## Code Style Guidelines
- Use TypeScript for all new files
- Follow existing code patterns and conventions
- No unnecessary comments unless specifically requested
- Use meaningful variable and function names
- Keep functions small and focused
- Prefer composition over inheritance

## Testing Guidelines
- Write tests for new features when possible
- Run existing tests before committing: `npm test`
- Ensure all tests pass before marking work as complete

## Git Commit Guidelines
- Use clear, descriptive commit messages
- Follow conventional commit format when possible:
  - feat: new feature
  - fix: bug fix
  - docs: documentation changes
  - style: formatting changes
  - refactor: code restructuring
  - test: test additions or changes
  - chore: maintenance tasks
- **IMPORTANT**: Do NOT include AI/Claude attribution in commit messages
  - No "Generated with Claude" messages
  - No "Co-Authored-By: Claude" lines
  - Keep commits authored solely by the user

## Project-Specific Notes
- The project uses Next.js 15 with App Router
- Anthropic Claude API for AI interactions
- Recharts for data visualization
- In-memory vector store for RAG
- SARIMA forecasting implemented in TypeScript

## File Structure
```
/app           - Next.js app router pages and API routes
/components    - React components
/lib           - Utility functions and core logic
/data          - Data files and scripts
/public        - Static assets
```

## Important Files
- `/app/api/chat/route.ts` - Main chat endpoint
- `/app/api/forecast/route.ts` - Forecasting endpoint
- `/lib/claude.ts` - Anthropic API integration
- `/lib/embeddings.ts` - Vector embeddings logic
- `/lib/forecasting.ts` - SARIMA implementation
- `/components/chat/ChatPanel.tsx` - Main chat UI
- `/components/charts/DynamicChart.tsx` - Chart renderer

## Environment Variables
Required in `.env.local`:
```
ANTHROPIC_API_KEY=your_api_key_here
```

## Development Workflow
1. Always read existing code before modifying
2. Use the TodoWrite tool for complex tasks
3. Test changes in the browser at http://localhost:3000
4. Check browser console for errors
5. Verify API responses in Network tab

## Common Issues and Solutions
- If charts don't appear: Check visualization keywords in query
- If forecasts fail: Verify monthly data exists in chunks
- If RAG returns wrong data: Check embedding weights
- If build fails: Run `npm install` to ensure dependencies

## Additional Notes
(Add your specific preferences and guidelines here)