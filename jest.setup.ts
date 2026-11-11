// expo-secure-store and expo-notifications are native modules. Jest cannot load
// their native bindings, so tests exercise the pure adapters around them and the
// module surface is stubbed here.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});

// react-native-webview needs its native view manager; render a plain View.
jest.mock('react-native-webview', () => {
  const { View } = jest.requireActual('react-native');
  const WebView = (props: Record<string, unknown>) => {
    const React = jest.requireActual('react');
    return React.createElement(View, { testID: props.testID ?? 'webview' });
  };
  return { __esModule: true, default: WebView, WebView };
});

// Worklets/Reanimated need their native runtime; both ship official Jest mocks.
jest.mock('react-native-worklets', () =>
  jest.requireActual('react-native-worklets/lib/module/mock'),
);
jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));

// The swipe wrapper renders its children.
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const React = jest.requireActual('react');
  const Swipeable = React.forwardRef(({ children }: { children: React.ReactNode }, _ref: unknown) =>
    React.createElement(React.Fragment, null, children),
  );
  return { __esModule: true, default: Swipeable };
});

// expo-video needs its native player: a no-op player and a plain View.
jest.mock('expo-video', () => {
  const { View } = jest.requireActual('react-native');
  const player = {
    play: jest.fn(),
    pause: jest.fn(),
    release: jest.fn(),
    generateThumbnailsAsync: jest.fn(async () => []),
  };
  return {
    useVideoPlayer: () => player,
    createVideoPlayer: () => player,
    VideoView: View,
  };
});
