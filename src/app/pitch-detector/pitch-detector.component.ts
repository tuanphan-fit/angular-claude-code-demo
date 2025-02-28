import { Component, ElementRef, EventEmitter, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PitchDetector } from 'pitchy';

@Component({
  selector: 'app-pitch-detector',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './pitch-detector.component.html',
  styleUrls: ['./pitch-detector.component.scss']
})
export class PitchDetectorComponent implements OnInit, OnDestroy {
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @Output() pitchDetected = new EventEmitter<{note: string, frequency: number, clarity: number}>();
  
  audioContext: AudioContext | null = null;
  analyser: AnalyserNode | null = null;
  mediaStream: MediaStream | null = null;
  rafId: number | null = null;
  pitchDetector: any = null;
  
  isListening = false;
  detectedNote = '';
  detectedFrequency = 0;
  clarity = 0;
  
  notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  constructor() {}

  ngOnInit(): void {
    this.setupCanvas();
  }

  ngOnDestroy(): void {
    this.stopListening();
  }

  setupCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    canvas.width = 400;
    canvas.height = 200;
  }

  async toggleListening(): Promise<void> {
    if (this.isListening) {
      this.stopListening();
    } else {
      await this.startListening();
    }
  }

  async startListening(): Promise<void> {
    try {
      this.audioContext = new AudioContext();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;

      // Create the pitch detector
      this.pitchDetector = PitchDetector.forFloat32Array(this.analyser.fftSize);
      // Set a clarity threshold
      this.pitchDetector.clarityThreshold = 0.8;

      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      source.connect(this.analyser);
      
      this.isListening = true;
      this.updatePitch();
    } catch (err) {
      console.error('Error accessing microphone:', err);
      this.detectedNote = 'Error accessing microphone';
    }
  }

  stopListening(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    this.analyser = null;
    this.pitchDetector = null;
    this.isListening = false;
    this.detectedNote = '';
    this.detectedFrequency = 0;
    this.clarity = 0;
    
    this.clearCanvas();
  }

  updatePitch(): void {
    if (!this.analyser || !this.isListening || !this.pitchDetector) return;
    
    const buffer = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buffer);
    
    // Find the pitch using our pre-created detector
    const [pitch, clarity] = this.pitchDetector.findPitch(buffer, this.audioContext!.sampleRate);
    
    if (clarity > 0.8 && pitch > 30) { // Only update if we have a clear signal
      this.detectedFrequency = Math.round(pitch * 10) / 10;
      this.clarity = Math.round(clarity * 100);
      this.detectedNote = this.getNote(pitch);
      
      // Draw the waveform
      this.drawWaveform(buffer);
      
      // Emit the detected pitch for parent components
      this.pitchDetected.emit({
        note: this.detectedNote,
        frequency: this.detectedFrequency,
        clarity: this.clarity / 100 // Convert back to 0-1 range
      });
    }
    
    this.rafId = requestAnimationFrame(() => this.updatePitch());
  }
  
  getNote(frequency: number): string {
    // A4 is 440Hz, which is note index 69
    const noteIndex = Math.round(12 * Math.log2(frequency / 440) + 69);
    const octave = Math.floor(noteIndex / 12) - 1;
    const noteName = this.notes[noteIndex % 12];
    return `${noteName}${octave}`;
  }
  
  drawWaveform(buffer: Float32Array): void {
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d')!;
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Draw waveform
    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = this.getColorForNote(this.detectedNote);
    
    const bufferLength = buffer.length;
    const sliceWidth = width / bufferLength;
    let x = 0;
    
    for (let i = 0; i < bufferLength; i++) {
      const v = buffer[i];
      const y = (v + 1) / 2 * height;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      
      x += sliceWidth;
    }
    
    ctx.stroke();
  }
  
  clearCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  
  getColorForNote(note: string): string {
    if (!note) return '#cccccc';
    
    // Map the note to a color
    const noteBase = note.charAt(0);
    const colors: Record<string, string> = {
      'C': '#FF0000', // Red
      'C#': '#FF4500', // OrangeRed
      'D': '#FFA500', // Orange
      'D#': '#FFD700', // Gold
      'E': '#FFFF00', // Yellow
      'F': '#32CD32', // LimeGreen
      'F#': '#008000', // Green
      'G': '#00FFFF', // Cyan
      'G#': '#1E90FF', // DodgerBlue
      'A': '#0000FF', // Blue
      'A#': '#8A2BE2', // BlueViolet
      'B': '#FF00FF', // Magenta
    };
    
    return colors[noteBase] || '#cccccc';
  }
}