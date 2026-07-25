import { AiExtractResponse } from '../schemas/ai-extract.schema';

// Fixed sample DAG (Variable -> Loop -> Array -> {Sorting, Recursion}) used when
// USE_MOCK_AI=true, so frontend/backend dev and demos don't consume Gemini quota.
export const MOCK_EXTRACT_RESULT: AiExtractResponse = {
  concepts: [
    { name: 'Variable', difficulty: 1, description: 'Basic variables and data types' },
    { name: 'Loop', difficulty: 2, description: 'for/while loops' },
    { name: 'Array', difficulty: 2, description: 'Arrays and indexing' },
    { name: 'Recursion', difficulty: 4, description: 'Functions that call themselves' },
    { name: 'Sorting', difficulty: 3, description: 'Sorting algorithms' },
  ],
  edges: [
    { from: 'Variable', to: 'Loop' },
    { from: 'Loop', to: 'Array' },
    { from: 'Array', to: 'Sorting' },
    { from: 'Array', to: 'Recursion' },
  ],
  language_detected: 'en',
};
