import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/preact';
import { HowToScreen } from '@/ui/screens/HowToScreen';
import { currentScreen } from '@/ui/router';

import { setLocale } from '@/i18n/locale';

describe('HowToScreen component', () => {
  beforeEach(() => {
    setLocale('hu');
    currentScreen.value = { name: 'howto' };
  });

  afterEach(() => {
    cleanup();
  });

  it('renders educational content, meters and categories', () => {
    render(<HowToScreen />);

    expect(screen.getByText('Hogyan működik?')).toBeDefined();
    expect(screen.getByText('The Empathy Firewall')).toBeDefined();
    expect(screen.getByText('The 3 Meters')).toBeDefined();
    expect(screen.getByText('Card Categories')).toBeDefined();
  });

  it('navigates back to home on back and primary button clicks', () => {
    render(<HowToScreen />);

    const backBtn = screen.getByTestId('howto-back-btn');
    act(() => {
      fireEvent.click(backBtn);
    });
    expect(currentScreen.value).toEqual({ name: 'home' });

    currentScreen.value = { name: 'howto' };
    const homeBtn = screen.getByTestId('howto-home-btn');
    act(() => {
      fireEvent.click(homeBtn);
    });
    expect(currentScreen.value).toEqual({ name: 'home' });
  });
});
