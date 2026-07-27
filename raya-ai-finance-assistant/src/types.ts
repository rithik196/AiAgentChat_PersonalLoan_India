/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Message {
  id: string;
  sender: 'user' | 'raya' | 'system';
  text: string;
  timestamp: string;
  typing?: boolean;
  options?: Array<{ label: string; value: string; actionId?: string }>;
  contentType?: 'calculator' | 'checklist' | 'success' | 'intro' | 'eligibility';
}

export type AppStage = 'landing' | 'chat_journey';

export interface UserSession {
  mobileNumber: string;
  countryCode: string;
  fullName: string;
  financeType: 'islamic' | 'conventional' | null;
  amount: number;
  tenure: number; // in months
  stageIndex: number; // tracks conversational step
}
