/**
 * The entry route must resolve — Expo Router opens the app at `/`, and without
 * an `index` route that URL is unmatched upstream of any screen. It hands over
 * to the conversation list, which owns the empty state for a fresh install.
 */

import { render, screen } from '@testing-library/react-native';

import Index from '@/app/index';

jest.mock('expo-router', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Redirect: ({ href }: { href: string }) =>
      React.createElement(Text, { testID: 'redirect' }, href),
  };
});

describe('entry route', () => {
  it('redirects to the conversation list', () => {
    render(<Index />);
    expect(screen.getByTestId('redirect')).toHaveTextContent('/discussions');
  });
});
