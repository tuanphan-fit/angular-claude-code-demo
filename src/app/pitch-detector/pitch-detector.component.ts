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
  @ViewChild('spectrumCanvas', { static: true }) spectrumCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('historyCanvas', { static: true }) historyCanvasRef!: ElementRef<HTMLCanvasElement>;
  @Output() pitchDetected = new EventEmitter<{note: string, frequency: number, clarity: number, centDifference: number}>();
  
  audioContext: AudioContext | null = null;
  analyser: AnalyserNode | null = null;
  mediaStream: MediaStream | null = null;
  rafId: number | null = null;
  pitchDetector: any = null;
  
  isListening = false;
  detectedNote = '';
  detectedFrequency = 0;
  clarity = 0;
  noteHistory: {time: number, note: string, frequency: number, clarity: number}[] = [];
  centDifference = 0; // Difference from perfect pitch in cents
  
  // Visualization options
  visualizationMode = 'waveform'; // waveform, spectrum, history
  
  // Spectrum analyzer data
  spectrumData: Uint8Array = new Uint8Array();
  
  notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  
  // Constants for frequency visualization
  readonly A4_FREQ = 440;
  readonly NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  constructor() {}

  ngOnInit(): void {
    this.setupCanvases();
  }

  ngOnDestroy(): void {
    this.stopListening();
  }

  setupCanvases(): void {
    // Main visualization canvas
    const canvas = this.canvasRef.nativeElement;
    canvas.width = 400;
    canvas.height = 200;
    
    // Spectrum analyzer canvas
    const spectrumCanvas = this.spectrumCanvasRef.nativeElement;
    spectrumCanvas.width = 400;
    spectrumCanvas.height = 150;
    
    // Pitch history canvas
    const historyCanvas = this.historyCanvasRef.nativeElement;
    historyCanvas.width = 400;
    historyCanvas.height = 150;
  }

  async toggleListening(): Promise<void> {
    if (this.isListening) {
      this.stopListening();
    } else {
      await this.startListening();
    }
  }

  toggleVisualization(): void {
    // Cycle through visualization modes
    if (this.visualizationMode === 'waveform') {
      this.visualizationMode = 'spectrum';
    } else if (this.visualizationMode === 'spectrum') {
      this.visualizationMode = 'history';
    } else {
      this.visualizationMode = 'waveform';
    }
  }

  async startListening(): Promise<void> {
    try {
      this.audioContext = new AudioContext();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.spectrumData = new Uint8Array(this.analyser.frequencyBinCount);

      // Create the pitch detector
      this.pitchDetector = PitchDetector.forFloat32Array(this.analyser.fftSize);
      // Set a clarity threshold
      this.pitchDetector.clarityThreshold = 0.8;

      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      source.connect(this.analyser);
      
      this.isListening = true;
      this.noteHistory = [];
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
    
    this.clearCanvases();
  }

  updatePitch(): void {
    if (!this.analyser || !this.isListening || !this.pitchDetector) return;
    
    const buffer = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buffer);
    
    // Update spectrum data (for frequency visualization)
    this.analyser.getByteFrequencyData(this.spectrumData);
    
    // Find the pitch using our pre-created detector
    const [pitch, clarity] = this.pitchDetector.findPitch(buffer, this.audioContext!.sampleRate);
    
    if (clarity > 0.8 && pitch > 30) { // Only update if we have a clear signal
      this.detectedFrequency = Math.round(pitch * 10) / 10;
      this.clarity = Math.round(clarity * 100);
      const noteInfo = this.getNoteWithCents(pitch);
      this.detectedNote = noteInfo.note;
      this.centDifference = noteInfo.cents;
      
      // Add to history (limiting to 100 entries)
      this.noteHistory.push({
        time: Date.now(),
        note: this.detectedNote,
        frequency: this.detectedFrequency,
        clarity: this.clarity / 100
      });
      
      if (this.noteHistory.length > 100) {
        this.noteHistory.shift();
      }
      
      // Draw the appropriate visualization
      switch (this.visualizationMode) {
        case 'waveform':
          this.drawWaveform(buffer);
          break;
        case 'spectrum':
          this.drawSpectrum();
          break;
        case 'history':
          this.drawPitchHistory();
          break;
      }
      
      // Emit the detected pitch for parent components
      this.pitchDetected.emit({
        note: this.detectedNote,
        frequency: this.detectedFrequency,
        clarity: this.clarity / 100, // Convert back to 0-1 range
        centDifference: this.centDifference
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
  
  getNoteWithCents(frequency: number): { note: string, cents: number } {
    // A4 is 440Hz, which is note index 69
    const noteNum = 12 * Math.log2(frequency / this.A4_FREQ) + 69;
    const noteIndex = Math.round(noteNum);
    const octave = Math.floor(noteIndex / 12) - 1;
    const noteName = this.notes[noteIndex % 12];
    
    // Calculate cents deviation (difference between actual and nearest note)
    // 100 cents = 1 semitone
    const cents = Math.round((noteNum - noteIndex) * 100);
    
    return {
      note: `${noteName}${octave}`,
      cents: cents
    };
  }
  
  drawWaveform(buffer: Float32Array): void {
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d')!;
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Draw centerline
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(200, 200, 200, 0.5)';
    ctx.lineWidth = 1;
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    
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
    
    // Draw note info
    if (this.detectedFrequency > 0) {
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'right';
      ctx.font = '12px Arial';
      ctx.fillText(`Pitch: ${this.detectedFrequency} Hz`, width - 10, 20);
      ctx.fillText(`Clarity: ${this.clarity}%`, width - 10, 40);
      ctx.fillText(`Cents: ${this.centDifference > 0 ? '+' : ''}${this.centDifference}`, width - 10, 60);
    }
  }
  
  drawSpectrum(): void {
    const canvas = this.spectrumCanvasRef.nativeElement;
    const ctx = canvas.getContext('2d')!;
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Draw frequency spectrum
    const barWidth = width / this.spectrumData.length * 4; // Zoom in to show more detail at lower frequencies
    let x = 0;
    
    // Create gradient for bars
    const gradient = ctx.createLinearGradient(0, height, 0, 0);
    gradient.addColorStop(0, '#0077FF');
    gradient.addColorStop(0.5, '#00DDFF');
    gradient.addColorStop(1, '#FFFFFF');
    
    // Calculate bar heights and draw
    for (let i = 0; i < this.spectrumData.length / 4; i++) { // Only show quarter of the spectrum (low frequencies)
      const barHeight = this.spectrumData[i] / 255 * height;
      
      ctx.fillStyle = gradient;
      ctx.fillRect(x, height - barHeight, barWidth, barHeight);
      
      x += barWidth;
    }
    
    // Draw frequency labels
    ctx.fillStyle = '#fff';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    
    // Find the fundamental frequency and mark it
    if (this.detectedFrequency > 0) {
      const fundamentalX = (this.detectedFrequency / (this.audioContext?.sampleRate || 44100) * 2) * width;
      if (fundamentalX < width) {
        ctx.fillStyle = 'rgba(255, 255, 0, 0.7)';
        ctx.fillRect(fundamentalX - 2, 0, 4, height);
        ctx.fillStyle = '#fff';
        ctx.fillText(`${this.detectedFrequency}Hz`, fundamentalX, height - 5);
      }
    }
    
    // Draw some frequency markers
    const markers = [100, 200, 500, 1000, 2000];
    markers.forEach(freq => {
      const markerX = (freq / (this.audioContext?.sampleRate || 44100) * 2) * width;
      if (markerX < width) {
        ctx.fillStyle = 'rgba(150, 150, 150, 0.5)';
        ctx.fillRect(markerX, 0, 1, height);
        ctx.fillStyle = '#aaa';
        ctx.fillText(`${freq}Hz`, markerX, 12);
      }
    });
  }
  
  drawPitchHistory(): void {
    const canvas = this.historyCanvasRef.nativeElement;
    const ctx = canvas.getContext('2d')!;
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    if (this.noteHistory.length < 2) return;
    
    // Draw background grid
    this.drawNoteGrid(ctx, width, height);
    
    // Find the time range
    const now = Date.now();
    const timeWindow = 5000; // 5 seconds
    const startTime = now - timeWindow;
    
    // Draw history
    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    
    // Draw pitch line
    let firstPoint = true;
    this.noteHistory.forEach((entry, i) => {
      if (entry.time >= startTime) {
        const x = ((entry.time - startTime) / timeWindow) * width;
        // Calculate y based on midi note number
        const noteNum = 12 * Math.log2(entry.frequency / 440) + 69;
        // Map note range to canvas height (central 2 octaves)
        // Middle C (C4) = 60
        const y = height * (1 - ((noteNum - 48) / 24));
        
        if (firstPoint) {
          ctx.moveTo(x, y);
          firstPoint = false;
        } else {
          ctx.lineTo(x, y);
        }
        
        // Add dots with varying opacity based on clarity
        ctx.fillStyle = `rgba(255, 255, 255, ${entry.clarity})`;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.stroke();
  }
  
  drawNoteGrid(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    // Draw horizontal lines for each note
    ctx.strokeStyle = 'rgba(100, 100, 100, 0.3)';
    ctx.fillStyle = 'rgba(150, 150, 150, 0.5)';
    ctx.font = '10px Arial';
    ctx.textAlign = 'left';
    
    // Draw grid for 2 octaves centered around middle C (C4=60)
    for (let i = 0; i <= 24; i++) {
      const y = (i / 24) * height;
      const noteNum = 48 + (24 - i);
      const octave = Math.floor(noteNum / 12);
      const noteName = this.NOTE_NAMES[noteNum % 12];
      
      // Draw line
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      
      // Label C notes
      if (noteName === 'C') {
        ctx.fillText(`${noteName}${octave}`, 5, y - 2);
      }
    }
    
    // Draw vertical time markers
    ctx.strokeStyle = 'rgba(100, 100, 100, 0.2)';
    for (let i = 0; i <= 5; i++) {
      const x = (i / 5) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      
      // Label
      ctx.fillText(`${(5-i)}s`, x + 2, height - 5);
    }
  }
  
  clearCanvases(): void {
    // Clear main canvas
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Clear spectrum canvas
    const spectrumCanvas = this.spectrumCanvasRef.nativeElement;
    const spectrumCtx = spectrumCanvas.getContext('2d')!;
    spectrumCtx.clearRect(0, 0, spectrumCanvas.width, spectrumCanvas.height);
    
    // Clear history canvas
    const historyCanvas = this.historyCanvasRef.nativeElement;
    const historyCtx = historyCanvas.getContext('2d')!;
    historyCtx.clearRect(0, 0, historyCanvas.width, historyCanvas.height);
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
  
  // Get a color based on cent difference (green for on-pitch, yellow for slightly off, red for very off)
  getCentColor(): string {
    const absCents = Math.abs(this.centDifference);
    if (absCents < 10) {
      return '#00FF00'; // Green - very on pitch
    } else if (absCents < 25) {
      return '#CCFF00'; // Yellow-green - slightly off
    } else if (absCents < 40) {
      return '#FFCC00'; // Yellow - somewhat off
    } else {
      return '#FF0000'; // Red - very off pitch
    }
  }
  
  // Performance Analytics Methods
  
  // Calculate average clarity from the note history
  getAverageClarity(): number {
    if (this.noteHistory.length === 0) return 0;
    
    const sum = this.noteHistory.reduce((total, entry) => total + entry.clarity * 100, 0);
    return Math.round(sum / this.noteHistory.length);
  }
  
  // Calculate pitch stability as percentage
  getPitchStability(): number {
    if (this.noteHistory.length < 5) return 0;
    
    // Consider the last 3 seconds of history 
    const now = Date.now();
    const recentHistory = this.noteHistory.filter(entry => entry.time > now - 3000);
    
    if (recentHistory.length < 5) return 0;
    
    // Calculate frequency standard deviation
    const mean = recentHistory.reduce((sum, entry) => sum + entry.frequency, 0) / recentHistory.length;
    const squaredDiffs = recentHistory.map(entry => Math.pow(entry.frequency - mean, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / recentHistory.length;
    const stdDev = Math.sqrt(variance);
    
    // Convert to percentage (lower standard deviation = higher stability)
    // Scale so that stdDev of 5Hz or less = 100% stable, 30Hz or more = 0% stable
    const maxStdDev = 30;
    const minStdDev = 5;
    const stabilityPercentage = 100 - (Math.min(Math.max(stdDev - minStdDev, 0), maxStdDev - minStdDev) / (maxStdDev - minStdDev) * 100);
    
    return Math.round(stabilityPercentage);
  }
  
  // Get a color for stability display
  getStabilityColor(): string {
    const stability = this.getPitchStability();
    if (stability >= 90) {
      return '#00FF00'; // Excellent stability
    } else if (stability >= 70) {
      return '#AAFF00'; // Good stability
    } else if (stability >= 50) {
      return '#FFCC00'; // Moderate stability
    } else {
      return '#FF5500'; // Poor stability
    }
  }
  
  // Calculate average cent deviation (how in-tune the singing is)
  getAverageCentDeviation(): string {
    if (this.noteHistory.length < 5) return '0';
    
    // Calculate cent differences for each detected note
    const centDifferences = this.noteHistory.map(entry => {
      const noteInfo = this.getNoteWithCents(entry.frequency);
      return Math.abs(noteInfo.cents); // Use absolute value for average deviation
    });
    
    const avgCentDeviation = centDifferences.reduce((sum, cents) => sum + cents, 0) / centDifferences.length;
    return `±${Math.round(avgCentDeviation)}`;
  }
  
  // Get color for cent deviation display
  getDeviationColor(): string {
    const deviation = parseFloat(this.getAverageCentDeviation().replace('±', ''));
    if (deviation < 15) {
      return '#00FF00'; // Excellent tuning
    } else if (deviation < 30) {
      return '#AAFF00'; // Good tuning
    } else if (deviation < 45) {
      return '#FFCC00'; // Moderate tuning
    } else {
      return '#FF5500'; // Poor tuning
    }
  }
  
  // Get lowest note in history
  getLowestNote(): string {
    if (this.noteHistory.length === 0) return '---';
    
    const lowestFrequency = Math.min(...this.noteHistory.map(entry => entry.frequency));
    return this.getNote(lowestFrequency);
  }
  
  // Get highest note in history
  getHighestNote(): string {
    if (this.noteHistory.length === 0) return '---';
    
    const highestFrequency = Math.max(...this.noteHistory.map(entry => entry.frequency));
    return this.getNote(highestFrequency);
  }
}