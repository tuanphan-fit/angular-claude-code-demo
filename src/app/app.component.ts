import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PitchDetectorComponent } from './pitch-detector/pitch-detector.component';
import { PitchChallengeComponent } from './pitch-challenge/pitch-challenge.component';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet, 
    PitchDetectorComponent,
    PitchChallengeComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'Voice Pitch Detector';
  showChallenge = false;
  
  toggleMode(): void {
    this.showChallenge = !this.showChallenge;
  }
}
