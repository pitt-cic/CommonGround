/**
 * API Client for CommonGround Backend
 * Handles all communication with AWS Lambda functions via API Gateway
 */

import { userPool } from '../config/cognito';

const API_BASE_URL = import.meta.env.VITE_API_URL;

if (!API_BASE_URL) {
  throw new Error('VITE_API_URL environment variable is not set');
}

/**
 * Get JWT token from Cognito session
 */
async function getAuthToken(): Promise<string | null> {
  return new Promise((resolve) => {
    const currentUser = userPool.getCurrentUser();
    if (!currentUser) {
      resolve(null);
      return;
    }
    currentUser.getSession((err: Error | null, session: any) => {
      if (err || !session?.isValid()) {
        resolve(null);
        return;
      }
      resolve(session.getIdToken().getJwtToken());
    });
  });
}

// Type definitions for API responses
export interface UploadUrlResponse {
  upload_url: string;
  s3_key: string;
}

export interface SummarizeResponse {
  job_id: string;
  status: 'processing';
}

export interface CostEntry {
  type: 'generate' | 'refine' | 'infographic_generation' | 'infographic_polish';
  model: string;
  input_tokens?: number;
  output_tokens?: number;
  cost: number;
  template_id?: string;
  prompt?: string;
  output_format?: string;
  at?: string;
}

export interface SummaryCitation {
  statistic: string;
  verbatim_quote: string;
  section: string;
  verified?: boolean;
}

export interface JobStatusResponse {
  job_status: 'processing' | 'completed' | 'failed';
  job_id: string;
  audience?: string;
  output_format?: string;
  summary?: string;
  current_output?: string;
  messages?: Array<{ role: string; content: string }>;
  job_error?: string;
  cost_entries?: CostEntry[];
  total_cost?: number;
  // Summary citations
  summary_citations?: SummaryCitation[];
  // Infographic fields
  infographic_keys?: Record<string, string>;
  infographic_urls?: Record<string, string>;
  [key: `infographic_${string}_status`]: 'pending' | 'processing' | 'completed' | 'failed' | 'not_applicable' | undefined;
  [key: `infographic_${string}_reason`]: string | undefined;
}

export interface RefineResponse {
  job_id: string;
  status: 'completed';
  current_output: string;
  messages: Array<{ role: string; content: string }>;
}

export interface SaveEditResponse {
  job_id: string;
  status: 'saved';
  edited_output: string;
}

/**
 * Request a presigned S3 URL for uploading a PDF
 */
export async function requestUploadUrl(filename: string): Promise<UploadUrlResponse> {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${API_BASE_URL}papers/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ filename }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Upload request failed' }));
    throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Upload a file directly to S3 using a presigned URL
 */
export async function uploadToS3(presignedUrl: string, file: File): Promise<void> {
  const response = await fetch(presignedUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/pdf',
    },
    body: file,
  });

  if (!response.ok) {
    throw new Error(`S3 upload failed: HTTP ${response.status}`);
  }
}

/**
 * Start an async summarization job
 */
export async function startSummarization(
  s3Key: string,
  audience: string,
  outputFormat: string,
  customAudienceDetails?: string,
  infographicTemplate?: string
): Promise<SummarizeResponse> {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const body: Record<string, string> = {
    s3_key: s3Key,
    audience,
    output_format: outputFormat,
  };

  if (customAudienceDetails) {
    body.custom_audience_details = customAudienceDetails;
  }

  if (infographicTemplate) {
    body.infographic_template = infographicTemplate;
  }

  const response = await fetch(`${API_BASE_URL}papers/summarize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Summarization request failed' }));
    throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Check the status of a summarization job
 */
export async function checkJobStatus(jobId: string): Promise<JobStatusResponse> {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${API_BASE_URL}papers/summarize/${jobId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Job not found');
    }
    const error = await response.json().catch(() => ({ error: 'Status check failed' }));
    throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Refine an existing output with a follow-up message
 */
export async function refineOutput(jobId: string, message: string): Promise<RefineResponse> {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${API_BASE_URL}papers/summarize/${jobId}/refine`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ message }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Refine request failed' }));
    throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Save user's manually edited output
 */
export async function saveEditedOutput(jobId: string, editedOutput: string): Promise<SaveEditResponse> {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${API_BASE_URL}papers/summarize/${jobId}/edit`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ edited_output: editedOutput }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Save edit request failed' }));
    throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

// ─── Infographic Generation ─────────────────────────────────────────────────

export interface GenerateInfographicResponse {
  job_id: string;
  svg_content: string;
  s3_key: string;
  cost: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface TemplateNotApplicableResponse {
  not_applicable: true;
  template_id: string;
  reason: string;
}

export type GenerateInfographicResult =
  | GenerateInfographicResponse
  | TemplateNotApplicableResponse;

export async function generateInfographic(
  jobId: string,
  templateId: string
): Promise<GenerateInfographicResult> {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  // Resolve alias to canonical template id for polling
  const aliases: Record<string, string> = {
    'template-1': 'stat_grid',
    'template-2': 'method_steps',
    'template-3': 'key_findings',
  };
  const canonical = aliases[templateId] ?? templateId;

  // POST kicks off async generation, returns 202
  const response = await fetch(`${API_BASE_URL}papers/summarize/${jobId}/infographic`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ template_id: templateId, regenerate: true }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Infographic generation failed' }));
    if (response.status === 422 && body.error === 'template_not_applicable') {
      return { not_applicable: true, template_id: body.template_id, reason: body.reason };
    }
    throw new Error(body.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  // Poll job status until infographic_{canonical}_status is completed/failed/not_applicable
  const statusKey = `infographic_${canonical}_status`;
  const reasonKey = `infographic_${canonical}_reason`;

  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    const status = await checkJobStatus(jobId);
    const infStatus = (status as any)[statusKey];

    if (infStatus === 'completed') {
      // Fetch SVG from S3 using presigned URL
      const presignedUrl = status.infographic_urls?.[canonical];
      if (!presignedUrl) {
        throw new Error('Infographic URL not available');
      }
      const svgResponse = await fetch(presignedUrl);
      if (!svgResponse.ok) {
        throw new Error(`Failed to fetch infographic from S3: HTTP ${svgResponse.status}`);
      }
      const svg = await svgResponse.text();
      return { job_id: jobId, svg_content: svg, s3_key: '', cost: { input_tokens: 0, output_tokens: 0 } };
    } else if (infStatus === 'not_applicable') {
      return { not_applicable: true, template_id: canonical, reason: (status as any)[reasonKey] ?? 'Template does not fit this paper.' };
    } else if (infStatus === 'failed') {
      throw new Error('Infographic generation failed. Please try again.');
    }
  }

  throw new Error('Infographic generation timed out. Please try again.');
}

export interface PolishInfographicResponse {
  job_id: string;
  template_id: string;
  svg_content: string;
  s3_key: string;
  cost: {
    input_tokens: number;
    output_tokens: number;
  };
}

export async function polishInfographic(
  jobId: string,
  templateId: string,
  prompt: string
): Promise<PolishInfographicResponse> {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${API_BASE_URL}papers/summarize/${jobId}/infographic/polish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ template_id: templateId, prompt }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Infographic polish failed' }));
    throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

// ─── Infographic Content Editing ────────────────────────

export interface InfographicFieldSchema {
  description: string;
  max_length: number | null;
}

export interface SourceCitation {
  verbatim_quote: string;
  section: string;
  verified?: boolean;
}

export interface VerificationFailure {
  type: string;
  index?: number;
  value?: string;
  title?: string;
  reason: string;
  match_score?: number;
}

export interface GetInfographicContentResponse {
  job_id: string;
  template_id: string;
  content: Record<string, unknown>;
  schema: Record<string, InfographicFieldSchema>;
  verification_status?: 'found' | 'not_found' | 'verified' | 'needs_review' | 'pending';
  verification_failures?: VerificationFailure[];
}

export async function getInfographicContent(
  jobId: string,
  templateId: string
): Promise<GetInfographicContentResponse> {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(
    `${API_BASE_URL}papers/summarize/${jobId}/infographic/content?template_id=${templateId}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to fetch content' }));
    throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

export interface SaveInfographicContentResponse {
  job_id: string;
  template_id: string;
  svg_content: string;
  s3_key: string;
}

export async function saveInfographicContent(
  jobId: string,
  templateId: string,
  content: Record<string, unknown>
): Promise<SaveInfographicContentResponse> {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(
    `${API_BASE_URL}papers/summarize/${jobId}/infographic/content`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ template_id: templateId, content }),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to save content' }));
    throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

export interface PreviewInfographicContentResponse {
  job_id: string;
  template_id: string;
  svg_content: string;
  preview: true;
}

export async function previewInfographicContent(
  jobId: string,
  templateId: string,
  content: Record<string, unknown>
): Promise<PreviewInfographicContentResponse> {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(
    `${API_BASE_URL}papers/summarize/${jobId}/infographic/content`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ template_id: templateId, content, preview: true }),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to preview content' }));
    throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}
