/**
 * ATS (Applicant Tracking System) keyword match scoring.
 * Compares a resume against a job description to produce a match percentage.
 */

interface ATSScoreResult {
  score: number; // 0-100
  matchedKeywords: string[];
  missingKeywords: string[];
  totalKeywords: number;
}

// Common non-meaningful words to exclude
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with",
  "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does",
  "did", "will", "would", "could", "should", "may", "might", "shall", "can", "need",
  "dare", "ought", "used", "not", "no", "nor", "so", "yet", "also", "very", "just",
  "about", "above", "after", "again", "all", "am", "any", "because", "before", "between",
  "both", "by", "each", "few", "from", "further", "get", "got", "here", "how", "if",
  "into", "it", "its", "like", "more", "most", "must", "my", "new", "now", "only", "other",
  "our", "out", "over", "own", "same", "she", "he", "they", "their", "than", "that", "then",
  "there", "these", "this", "those", "through", "too", "under", "up", "us", "we", "what",
  "when", "where", "which", "while", "who", "whom", "why", "you", "your", "work", "working",
  "experience", "team", "role", "ability", "strong", "good", "well", "including", "such",
  "using", "use", "used", "etc", "based", "join", "looking", "seeking", "ideal", "plus",
  "bonus", "preferred", "required", "requirements", "qualifications", "responsibilities",
]);

// Multi-word tech terms to detect as single keywords
const COMPOUND_TERMS = [
  "machine learning", "deep learning", "natural language processing", "computer vision",
  "data science", "data engineering", "data analysis", "full stack", "front end", "back end",
  "ci cd", "ci/cd", "rest api", "restful api", "graphql api", "web development",
  "cloud computing", "distributed systems", "system design", "microservices architecture",
  "test driven", "agile methodology", "scrum master", "product management",
  "project management", "software engineering", "mobile development",
  "react native", "node js", "next js", "vue js", "angular js",
  "amazon web services", "google cloud", "microsoft azure",
  "spring boot", "ruby on rails", "asp net",
];

function extractKeywords(text: string): string[] {
  let normalized = text.toLowerCase();

  // Extract compound terms first
  const found: string[] = [];
  for (const term of COMPOUND_TERMS) {
    const variants = [term, term.replace(/\s+/g, ""), term.replace(/\s+/g, "-")];
    for (const v of variants) {
      if (normalized.includes(v)) {
        found.push(term.replace(/\s+/g, " "));
        // Remove to avoid double-counting
        normalized = normalized.replace(new RegExp(v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), " ");
        break;
      }
    }
  }

  // Extract single words
  const words = normalized
    .replace(/[^a-z0-9#+.]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));

  // Deduplicate
  return [...new Set([...found, ...words])];
}

/**
 * Score how well a resume matches a job description.
 * Returns 0-100 score with matched/missing keywords.
 */
export function scoreATSMatch(resumeText: string, jobDescription: string): ATSScoreResult {
  if (!resumeText || !jobDescription) {
    return { score: 0, matchedKeywords: [], missingKeywords: [], totalKeywords: 0 };
  }

  const jdKeywords = extractKeywords(jobDescription);
  const resumeKeywords = new Set(extractKeywords(resumeText));

  // Also check the full resume text for partial matches
  const resumeLower = resumeText.toLowerCase();

  const matched: string[] = [];
  const missing: string[] = [];

  for (const kw of jdKeywords) {
    if (resumeKeywords.has(kw) || resumeLower.includes(kw)) {
      matched.push(kw);
    } else {
      missing.push(kw);
    }
  }

  const total = jdKeywords.length;
  const score = total > 0 ? Math.round((matched.length / total) * 100) : 0;

  return {
    score: Math.min(score, 100),
    matchedKeywords: [...new Set(matched)].slice(0, 30),
    missingKeywords: [...new Set(missing)].slice(0, 20),
    totalKeywords: total,
  };
}
