import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ChallengeResult, NoteAttempt, PitchChallengeState } from '../models/pitch-challenge.model';
import { DbService } from './db.service';

@Injectable({
  providedIn: 'root'
})
export class PitchChallengeService {
  // For randomizing notes in different octaves
  private possibleNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  private possibleOctaves = [3, 4, 5]; // Reasonable range for most people
  
  // Minimum time required for a 'stable' pitch
  private stabilityDurationMs = 1000;
  
  // Maximum time per note attempt
  private maxAttemptTimeMs = 10000;
  
  // Challenge state
  private challengeState: PitchChallengeState = {
    isActive: false,
    currentNoteIndex: 0,
    notes: [],
    currentAttempt: null,
    attempts: [],
    startTime: 0,
    noteStartTime: 0,
    frequencySamples: [],
    stabilityThreshold: 0.9, // 90% of samples should match the target note
    accuracyThreshold: 10    // Frequency must be within 10Hz of target
  };
  
  private challengeStateSubject = new BehaviorSubject<PitchChallengeState>(this.challengeState);
  private resultsSubject = new BehaviorSubject<ChallengeResult[]>([]);

  constructor(private dbService: DbService) {
    this.loadResults();
  }

  get state$(): Observable<PitchChallengeState> {
    return this.challengeStateSubject.asObservable();
  }

  get results$(): Observable<ChallengeResult[]> {
    return this.resultsSubject.asObservable();
  }

  // Generate a new 10-note challenge
  startChallenge(): void {
    // Generate 10 random notes
    const notes = Array.from({ length: 10 }, () => this.getRandomNote());
    
    // Initialize challenge state
    this.challengeState = {
      isActive: true,
      currentNoteIndex: 0,
      notes,
      currentAttempt: null,
      attempts: [],
      startTime: Date.now(),
      noteStartTime: Date.now(),
      frequencySamples: [],
      stabilityThreshold: 0.9,
      accuracyThreshold: 10
    };
    
    this.challengeStateSubject.next({...this.challengeState});
  }

  // Process pitch detection result during an active challenge
  processPitch(detectedNote: string, frequency: number, clarity: number): void {
    if (!this.challengeState.isActive) return;
    
    const currentTime = Date.now();
    const targetNote = this.challengeState.notes[this.challengeState.currentNoteIndex];
    const elapsedTime = currentTime - this.challengeState.noteStartTime;
    
    // Add frequency to samples for stability calculation
    if (clarity > 0.8) {
      this.challengeState.frequencySamples.push(frequency);
    }
    
    // Compare detected note with target note
    const noteMatches = this.stripOctave(detectedNote) === this.stripOctave(targetNote);
    const baseNoteMatches = this.stripOctave(detectedNote) === this.stripOctave(targetNote);
    
    // Initialization of current attempt if needed
    if (!this.challengeState.currentAttempt && clarity > 0.8) {
      this.challengeState.currentAttempt = {
        targetNote,
        reachedNote: noteMatches,
        timeToReachMs: elapsedTime,
        stabilityScore: 0,
        accuracyScore: 0,
        averageFrequency: frequency
      };
    }
    
    // Update current attempt
    if (this.challengeState.currentAttempt) {
      // Update flags
      if (noteMatches && !this.challengeState.currentAttempt.reachedNote) {
        this.challengeState.currentAttempt.reachedNote = true;
        this.challengeState.currentAttempt.timeToReachMs = elapsedTime;
      }
    }
    
    // Check if we should move to the next note (either reached success or timed out)
    const isStable = this.calculateStability(targetNote) >= this.challengeState.stabilityThreshold;
    const hasTimedOut = elapsedTime >= this.maxAttemptTimeMs;
    
    if ((isStable && noteMatches) || hasTimedOut) {
      this.completeCurrentAttempt(hasTimedOut);
    }
    
    // Update the state
    this.challengeStateSubject.next({...this.challengeState});
  }

  private completeCurrentAttempt(timedOut: boolean): void {
    // Finalize current attempt
    if (this.challengeState.currentAttempt) {
      // Calculate scores
      const stabilityScore = this.calculateStability(this.challengeState.currentAttempt.targetNote) * 100;
      const accuracyScore = this.calculateAccuracy(this.challengeState.currentAttempt.targetNote) * 100;
      const avgFrequency = this.calculateAverageFrequency();
      
      // Update the attempt
      this.challengeState.currentAttempt = {
        ...this.challengeState.currentAttempt,
        stabilityScore,
        accuracyScore,
        averageFrequency: avgFrequency,
        reachedNote: this.challengeState.currentAttempt.reachedNote || timedOut
      };
      
      // Add to attempts array
      this.challengeState.attempts.push({ ...this.challengeState.currentAttempt });
    } else if (timedOut) {
      // Create a failed attempt if timed out without any valid pitch
      this.challengeState.attempts.push({
        targetNote: this.challengeState.notes[this.challengeState.currentNoteIndex],
        reachedNote: false,
        timeToReachMs: this.maxAttemptTimeMs,
        stabilityScore: 0,
        accuracyScore: 0,
        averageFrequency: 0
      });
    }
    
    // Move to next note or finish the challenge
    this.challengeState.currentNoteIndex++;
    this.challengeState.currentAttempt = null;
    this.challengeState.frequencySamples = [];
    this.challengeState.noteStartTime = Date.now();
    
    // Check if the challenge is complete
    if (this.challengeState.currentNoteIndex >= this.challengeState.notes.length) {
      this.finishChallenge();
    }
  }

  private finishChallenge(): void {
    // Calculate overall scores
    const successfulAttempts = this.challengeState.attempts.filter(a => a.reachedNote);
    
    const totalScore = Math.round(
      (successfulAttempts.length / this.challengeState.attempts.length) * 100
    );
    
    const avgTimeToReach = successfulAttempts.length > 0 ? 
      successfulAttempts.reduce((sum, a) => sum + a.timeToReachMs, 0) / successfulAttempts.length : 
      this.maxAttemptTimeMs;
    
    const avgStability = this.challengeState.attempts.reduce((sum, a) => sum + a.stabilityScore, 0) / 
      this.challengeState.attempts.length;
    
    const avgAccuracy = this.challengeState.attempts.reduce((sum, a) => sum + a.accuracyScore, 0) / 
      this.challengeState.attempts.length;
    
    // Create challenge result
    const result: ChallengeResult = {
      date: new Date(),
      attempts: [...this.challengeState.attempts],
      totalScore,
      averageTimeToReach: avgTimeToReach,
      averageStability: avgStability,
      averageAccuracy: avgAccuracy
    };
    
    // Save to IndexedDB
    this.dbService.saveResult(result)
      .then(() => {
        this.loadResults();
      })
      .catch(error => {
        console.error('Error saving challenge result:', error);
      });
    
    // Reset challenge state
    this.challengeState.isActive = false;
    this.challengeStateSubject.next({...this.challengeState});
  }

  // Cancel a challenge in progress
  cancelChallenge(): void {
    this.challengeState.isActive = false;
    this.challengeStateSubject.next({...this.challengeState});
  }

  // Helper method to get a random note
  private getRandomNote(): string {
    const note = this.possibleNotes[Math.floor(Math.random() * this.possibleNotes.length)];
    const octave = this.possibleOctaves[Math.floor(Math.random() * this.possibleOctaves.length)];
    return `${note}${octave}`;
  }

  // Helper method to strip octave from a note (e.g., 'C4' -> 'C')
  private stripOctave(note: string): string {
    return note.replace(/[0-9]/g, '');
  }

  // Calculate pitch stability from frequency samples
  private calculateStability(targetNote: string): number {
    if (this.challengeState.frequencySamples.length < 5) {
      return 0;
    }
    
    // Count how many samples match the target note
    let matchingCount = 0;
    
    for (const frequency of this.challengeState.frequencySamples) {
      const noteFromFreq = this.getNoteFromFrequency(frequency);
      if (this.stripOctave(noteFromFreq) === this.stripOctave(targetNote)) {
        matchingCount++;
      }
    }
    
    return matchingCount / this.challengeState.frequencySamples.length;
  }

  // Calculate accuracy as a score from 0-1 based on frequency distance from target
  private calculateAccuracy(targetNote: string): number {
    if (this.challengeState.frequencySamples.length === 0) {
      return 0;
    }
    
    const targetFreq = this.getFrequencyFromNote(targetNote);
    let totalError = 0;
    
    for (const frequency of this.challengeState.frequencySamples) {
      // Calculate the error as percentage of target frequency
      const error = Math.abs(frequency - targetFreq) / targetFreq;
      totalError += error;
    }
    
    const avgError = totalError / this.challengeState.frequencySamples.length;
    // Convert to a score where 0 error = 1.0 and more error approaches 0
    return Math.max(0, 1 - (avgError * 10));
  }
  
  // Estimate frequency from a note
  private getFrequencyFromNote(note: string): number {
    // A4 is 440Hz
    const baseNote = this.stripOctave(note);
    const octave = parseInt(note.replace(/[^0-9]/g, ''), 10);
    
    const noteIndex = this.possibleNotes.indexOf(baseNote);
    const stepsFromA4 = noteIndex - 9 + ((octave - 4) * 12);
    
    // Using formula: f = 440 * 2^(n/12) where n is semitones from A4
    return 440 * Math.pow(2, stepsFromA4 / 12);
  }
  
  // Get note from frequency
  private getNoteFromFrequency(frequency: number): string {
    // A4 = 440Hz, and we compute semitones from A4 using: n = 12 * log2(f/440)
    const semitones = 12 * Math.log2(frequency / 440);
    const roundedSemitones = Math.round(semitones);
    
    // Calculate note index (0-11) and octave
    let noteIndex = (9 + roundedSemitones) % 12;
    if (noteIndex < 0) noteIndex += 12;
    
    const octave = 4 + Math.floor((9 + roundedSemitones) / 12);
    
    return `${this.possibleNotes[noteIndex]}${octave}`;
  }
  
  // Calculate average frequency
  private calculateAverageFrequency(): number {
    if (this.challengeState.frequencySamples.length === 0) {
      return 0;
    }
    
    const sum = this.challengeState.frequencySamples.reduce((acc, freq) => acc + freq, 0);
    return sum / this.challengeState.frequencySamples.length;
  }

  // Load results from IndexedDB
  private loadResults(): void {
    this.dbService.getResults()
      .then(results => {
        this.resultsSubject.next(results);
      })
      .catch(error => {
        console.error('Error loading results:', error);
      });
  }

  // Delete a challenge result
  deleteResult(id: number): Promise<void> {
    return this.dbService.deleteResult(id)
      .then(() => {
        this.loadResults();
      });
  }
}