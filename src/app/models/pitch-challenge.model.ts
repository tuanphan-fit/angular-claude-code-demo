export interface NoteAttempt {
  targetNote: string;
  reachedNote: boolean;
  timeToReachMs: number;
  stabilityScore: number; // 0-100
  accuracyScore: number;  // 0-100
  averageFrequency: number;
  centDifference?: number; // Pitch difference in cents (-50 to +50)
}

export interface ChallengeResult {
  id?: number;
  date: Date;
  attempts: NoteAttempt[];
  totalScore: number;
  averageTimeToReach: number;
  averageStability: number;
  averageAccuracy: number;
}

export interface PitchChallengeState {
  isActive: boolean;
  currentNoteIndex: number;
  notes: string[];
  currentAttempt: NoteAttempt | null;
  attempts: NoteAttempt[];
  startTime: number;
  noteStartTime: number;
  frequencySamples: number[];
  stabilityThreshold: number;
  accuracyThreshold: number;
}