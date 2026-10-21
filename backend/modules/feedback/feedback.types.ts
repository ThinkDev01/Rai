// Feedback module — types + input caps (mirrored on the frontend modal).

export const FEEDBACK_TITLE_MAX = 150;
export const FEEDBACK_BODY_MIN  = 5;
export const FEEDBACK_BODY_MAX  = 5000;

export interface FeedbackRow {
  id:         string;
  user_id:    string;
  org_id:     string | null;
  title:      string;
  body:       string;
  created_at: string;
}
