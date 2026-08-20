/**
 * Utility functions to map frontend values to backend API formats
 */

import type { OutputTypeId } from '../components/Steps/CustomizeStep';

/**
 * Map reading level index to backend audience type
 * 0 (General public) → "general_public"
 * 1 (Clinicians) → "clinicians"
 * 2 (Academic health researchers) → "academic_health_researchers"
 */
export function mapReadingLevelToAudience(level: number): string {
  const mapping: Record<number, string> = {
    0: 'general_public',
    1: 'clinicians',
    2: 'academic_health_researchers',
  };

  return mapping[level] || 'general_public';
}

/**
 * Map output type ID to backend output format
 * "summary" → "summary"
 * "press_release" → "press_release"
 * "linkedin" → "linkedin_post"
 * "blog" → "blog_post"
 * "x" → "x_post"
 */
export function mapOutputTypeToFormat(type: OutputTypeId): string {
  const mapping: Record<OutputTypeId, string> = {
    summary: 'summary',
    press_release: 'press_release',
    linkedin: 'linkedin_post',
    blog: 'blog_post',
    x: 'x_post',
  };

  return mapping[type];
}
