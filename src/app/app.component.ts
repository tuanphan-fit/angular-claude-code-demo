import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PitchDetectorComponent } from './pitch-detector/pitch-detector.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, PitchDetectorComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'Voice Pitch Detector';
}
