import { signal } from '@preact/signals';

export type Screen =
  | { name: 'home' }
  | { name: 'onboarding' }
  | { name: 'howto' }
  | { name: 'briefing'; scenarioId: string }
  | { name: 'game'; scenarioId: string }
  | { name: 'debrief'; runId: string }
  | { name: 'settings' }
  | { name: 'stats' };

export const currentScreen = signal<Screen>({ name: 'home' });

export function navigateTo(screen: Screen, replace: boolean = false): void {
  currentScreen.value = screen;
  if (typeof window !== 'undefined' && window.history) {
    if (replace) {
      window.history.replaceState({ screen }, '');
    } else {
      window.history.pushState({ screen }, '');
    }
  }
}
