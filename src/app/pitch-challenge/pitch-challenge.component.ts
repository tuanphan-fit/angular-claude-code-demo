import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { ChallengeResult, PitchChallengeState } from '../models/pitch-challenge.model';
import { PitchChallengeService } from '../services/pitch-challenge.service';
import { PitchDetectorComponent } from '../pitch-detector/pitch-detector.component';

@Component({
  selector: 'app-pitch-challenge',
  standalone: true,
  imports: [CommonModule, PitchDetectorComponent],
  templateUrl: './pitch-challenge.component.html',
  styleUrl: './pitch-challenge.component.scss'
})
export class PitchChallengeComponent implements OnInit, OnDestroy {
  // Make Math available for use in template
  Math = Math;
  // Challenge state
  challengeState: PitchChallengeState = {
    isActive: false,
    currentNoteIndex: 0,
    notes: [],
    currentAttempt: null,
    attempts: [],
    startTime: 0,
    noteStartTime: 0,
    frequencySamples: [],
    stabilityThreshold: 0.9,
    accuracyThreshold: 10
  };
  
  // Subscriptions
  private stateSubscription!: Subscription;
  
  // Target note visualization properties
  targetNoteFrequency: number = 0;
  
  // Results view
  showResults = false;
  results: ChallengeResult[] = [];
  selectedResult: ChallengeResult | null = null;
  
  constructor(private pitchChallengeService: PitchChallengeService) {}

  ngOnInit(): void {
    // Subscribe to challenge state changes
    this.stateSubscription = this.pitchChallengeService.state$.subscribe(state => {
      this.challengeState = state;
      
      if (state.isActive && state.notes.length > 0) {
        const currentTarget = state.notes[state.currentNoteIndex];
        this.targetNoteFrequency = this.getFrequencyFromNote(currentTarget);
      }
    });
    
    // Subscribe to results changes
    this.pitchChallengeService.results$.subscribe(results => {
      this.results = results;
    });
  }

  ngOnDestroy(): void {
    if (this.stateSubscription) {
      this.stateSubscription.unsubscribe();
    }
  }

  // Start a new challenge
  startChallenge(): void {
    this.showResults = false;
    this.pitchChallengeService.startChallenge();
  }

  // Cancel the current challenge
  cancelChallenge(): void {
    this.pitchChallengeService.cancelChallenge();
  }

  // Process pitch from the detector component
  onPitchDetected(pitch: { note: string, frequency: number, clarity: number, centDifference: number }): void {
    if (this.challengeState?.isActive) {
      this.pitchChallengeService.processPitch(pitch.note, pitch.frequency, pitch.clarity, pitch.centDifference);
    }
  }

  // Show results list
  viewResults(): void {
    this.showResults = true;
    this.selectedResult = null;
  }

  // View a specific result
  viewResult(result: ChallengeResult): void {
    this.selectedResult = result;
  }

  // Delete a result
  deleteResult(id: number | undefined): void {
    if (id !== undefined) {
      this.pitchChallengeService.deleteResult(id).then(() => {
        if (this.selectedResult?.id === id) {
          this.selectedResult = null;
        }
      });
    }
  }

  // Back to results list
  backToResults(): void {
    this.selectedResult = null;
  }

  // Back to challenge
  backToChallenge(): void {
    this.showResults = false;
  }

  // Get frequency from note name
  private getFrequencyFromNote(note: string): number {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const baseNote = note.replace(/[0-9]/g, '');
    const octave = parseInt(note.replace(/[^0-9]/g, ''), 10);
    
    const noteIndex = noteNames.indexOf(baseNote);
    const stepsFromA4 = noteIndex - 9 + ((octave - 4) * 12);
    
    // Using formula: f = 440 * 2^(n/12) where n is semitones from A4
    return 440 * Math.pow(2, stepsFromA4 / 12);
  }
  
  // Format time in ms to readable format
  formatTime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const milliseconds = ms % 1000;
    return `${seconds}.${milliseconds.toString().padStart(3, '0')}s`;
  }
  
  // Helper methods for calculations
  getSuccessRate(): number {
    if (!this.challengeState.attempts.length) return 0;
    return (this.challengeState.attempts.filter(a => a.reachedNote).length / this.challengeState.attempts.length) * 100;
  }

  getAverageTimeToReach(): number {
    if (!this.challengeState.attempts.length) return 0;
    return this.challengeState.attempts.reduce((sum, a) => sum + a.timeToReachMs, 0) / this.challengeState.attempts.length;
  }

  getAverageStability(): number {
    if (!this.challengeState.attempts.length) return 0;
    return this.challengeState.attempts.reduce((sum, a) => sum + a.stabilityScore, 0) / this.challengeState.attempts.length;
  }

  getAverageAccuracy(): number {
    if (!this.challengeState.attempts.length) return 0;
    return this.challengeState.attempts.reduce((sum, a) => sum + a.accuracyScore, 0) / this.challengeState.attempts.length;
  }
  
  getProgressPercentage(): number {
    if (!this.challengeState.notes.length) return 0;
    return ((this.challengeState.currentNoteIndex + 1) / this.challengeState.notes.length) * 100;
  }
  
  getCurrentTargetNote(): string {
    if (!this.challengeState.notes.length || 
        this.challengeState.currentNoteIndex >= this.challengeState.notes.length) {
      return '';
    }
    return this.challengeState.notes[this.challengeState.currentNoteIndex];
  }
  
  isCurrentNoteReached(): boolean {
    return !!this.challengeState.currentAttempt?.reachedNote;
  }

  // Get color for a score
  getScoreColor(score: number): string {
    if (score >= 80) return '#4CAF50'; // Green
    if (score >= 60) return '#8BC34A'; // Light Green
    if (score >= 40) return '#FFC107'; // Amber
    if (score >= 20) return '#FF9800'; // Orange
    return '#F44336'; // Red
  }
  
  // Get color for tuning meter based on cent difference
  getTuningColor(cents: number = 0): string {
    const absCents = Math.abs(cents);
    if (absCents < 10) {
      return '#00FF00'; // Green - very on pitch
    } else if (absCents < 25) {
      return '#AAFF00'; // Yellow-green - slightly off
    } else if (absCents < 40) {
      return '#FFCC00'; // Yellow - somewhat off
    } else {
      return '#FF5500'; // Red - very off pitch
    }
  }
}