export type SessionStatus = "idle" | "running" | "stopped" | "error";

export type ModelId = "opus" | "sonnet" | "haiku";

export interface Session {
  id: string;
  name: string;
  target_dir: string;
  model: ModelId;
  status: SessionStatus;
  /** SDK-side session id captured from the first SDKMessage; lets us resume after restart. */
  sdk_session_id: string | null;
  created_at: number;
  updated_at: number;
}

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type VulnStatus = "candidate" | "confirmed" | "false_positive";

export interface Vulnerability {
  id: string;
  session_id: string;
  title: string;
  type: string;
  severity: Severity;
  status: VulnStatus;
  file_path: string | null;
  line: number | null;
  description: string;
  poc_path: string | null;
  created_at: number;
  updated_at: number;
}

export type ChatRole = "user" | "assistant" | "tool" | "system";

export interface ChatMessage {
  id: string;
  session_id: string;
  role: ChatRole;
  content: string;
  tool_name: string | null;
  tool_input: string | null;
  tool_result: string | null;
  created_at: number;
}

export interface StatusBriefing {
  id: string;
  session_id: string;
  text: string;
  mailed: 0 | 1;
  created_at: number;
}

export interface MailingSettings {
  mailing_status_enabled: boolean;
  mailing_status_interval_min: number;
  mailing_vulns_enabled: boolean;
}

export type RateLimitInfo = { kind: "rate_limit"; message: string };

export type WsServerEvent =
  | { type: "session.list"; sessions: Session[] }
  | { type: "session.upsert"; session: Session }
  | { type: "session.delete"; session_id: string }
  | { type: "session.status"; session_id: string; status: SessionStatus; error?: string }
  | { type: "session.activity"; session_id: string; label: string | null }
  | { type: "session.rate_limit"; session_id: string; message: string }
  | { type: "messages.list"; session_id: string; messages: ChatMessage[] }
  | { type: "message.append"; session_id: string; message: ChatMessage }
  | { type: "vuln.list"; session_id: string; vulns: Vulnerability[] }
  | { type: "vuln.upsert"; session_id: string; vuln: Vulnerability }
  | { type: "vuln.delete"; session_id: string; vuln_id: string }
  | { type: "status.list"; session_id: string; items: StatusBriefing[] }
  | { type: "status.append"; session_id: string; item: StatusBriefing }
  | { type: "settings.update"; settings: MailingSettings };

export type WsClientEvent =
  | { type: "session.send"; session_id: string; text: string }
  | { type: "session.interrupt"; session_id: string }
  | { type: "subscribe"; session_id: string };
