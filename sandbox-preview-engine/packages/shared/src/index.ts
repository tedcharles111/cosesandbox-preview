export interface SandboxError {
  id: string;
  message: string;
  stack?: string;
  source?: string;
  line?: number;
  column?: number;
  timestamp: number;
}

export interface CreateSandboxRequest {
  files: Record<string, { content: string; isBinary?: boolean }>;
  template?: string;
}

export interface CreateSandboxResponse {
  sandboxId: string;
  previewUrl: string;
}
