import { AiExtractResponse } from '../schemas/ai-extract.schema';

// Fixed sample DAG (Variable -> Loop -> Array -> {Sorting, Recursion}) used when
// USE_MOCK_AI=true, so frontend/backend dev and demos don't consume Gemini quota.
export const MOCK_EXTRACT_RESULT: AiExtractResponse = {
  concepts: [
    // prettier-ignore
    { name: 'Variable', difficulty: 1, description: 'Basic variables and data types', source_page: 1, source_excerpt: 'A variable is a named location in memory that holds a value of a given type.' },
    // prettier-ignore
    { name: 'Loop', difficulty: 2, description: 'for/while loops', source_page: 3, source_excerpt: 'A loop repeatedly executes a block of statements while a condition holds.' },
    // prettier-ignore
    { name: 'Array', difficulty: 2, description: 'Arrays and indexing', source_page: 5, source_excerpt: 'An array stores a fixed-size sequence of elements accessed by a zero-based index.' },
    // prettier-ignore
    { name: 'Recursion', difficulty: 4, description: 'Functions that call themselves', source_page: 9, source_excerpt: 'A recursive function solves a problem by calling itself on a smaller subproblem.' },
    // prettier-ignore
    { name: 'Sorting', difficulty: 3, description: 'Sorting algorithms', source_page: 7, source_excerpt: 'Sorting arranges the elements of a collection into a defined order.' },
  ],
  edges: [
    { from: 'Variable', to: 'Loop' },
    { from: 'Loop', to: 'Array' },
    { from: 'Array', to: 'Sorting' },
    { from: 'Array', to: 'Recursion' },
  ],
  language_detected: 'en',
};

// Người tạo: QA/Tester dùng để mock test AI, đảm bảo ko ảnh hưởng logic backend AI, xóa nếu cần
export const MOCK_EXTRACT_RESULT_CYCLE: AiExtractResponse = {
  concepts: [
    { name: 'Định thức', difficulty: 1, description: '...', source_page: 1, source_excerpt: '...' },
    {
      name: 'Ma trận nghịch đảo',
      difficulty: 2,
      description: '...',
      source_page: 1,
      source_excerpt: '...',
    },
    {
      name: 'Hệ phương trình',
      difficulty: 3,
      description: '...',
      source_page: 1,
      source_excerpt: '...',
    },
  ],
  edges: [
    { from: 'Hệ phương trình', to: 'Định thức' },
    { from: 'Định thức', to: 'Ma trận nghịch đảo' },
    { from: 'Ma trận nghịch đảo', to: 'Hệ phương trình' },
  ],
  language_detected: 'vi',
};
