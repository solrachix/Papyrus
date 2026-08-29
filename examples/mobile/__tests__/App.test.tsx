/**
 * @format
 */

import 'react-native';
import React from 'react';
import {View} from 'react-native';

// Note: import explicitly to use the types shipped with jest.
import {it} from '@jest/globals';
import {jest} from '@jest/globals';

// Note: test renderer must be required after react-native.
import renderer from 'react-test-renderer';

jest.mock('../assets/tracemonkey-pldi-09.pdf', () => 'tracemonkey.pdf');
jest.mock('../assets/sample.pdf', () => 'sample.pdf');

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const SafeAreaInsetsContext = React.createContext({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  });
  return {
    SafeAreaInsetsContext,
    SafeAreaProvider: ({children}: {children: React.ReactNode}) => children,
  };
});

jest.mock('@papyrus-sdk/engine-native', () => ({
  MobileDocumentEngine: class {
    async load() {}
    getPageCount() {
      return 12;
    }
    getCurrentPage() {
      return 1;
    }
    goToPage() {}
    setZoom() {}
    getZoom() {
      return 1;
    }
    rotate() {}
    getRotation() {
      return 0;
    }
    async renderPage() {}
    async renderTextLayer() {}
    async getTextContent() {
      return [];
    }
    async getPageDimensions() {
      return {width: 800, height: 1200};
    }
    async getOutline() {
      return [];
    }
    async getPageIndex() {
      return null;
    }
    destroy() {}
  },
}));

jest.mock(
  '@papyrus-sdk/ui-react-native',
  () => {
    const React = require('react');
    const {View} = require('react-native');

    return {
      ReadingShell: () =>
        React.createElement(View, {testID: 'papyrus-rn-reading-shell'}),
      ToolDock: () => null,
      AnnotationEditor: () => null,
      MOBILE_CHROME_METRICS: {
        screenPadding: 16,
        maxFloatingWidth: 360,
        iconSize: 20,
        iconBoxSize: 28,
        topbarPageButtonSize: 30,
        bottomBarItemPaddingHorizontal: 5,
        bottomBarItemPaddingVertical: 3,
      },
    };
  },
  {virtual: true},
);

import App from '../App';

it('renders the phase-1 mobile reading shell', async () => {
  let tree: renderer.ReactTestRenderer;
  await renderer.act(async () => {
    tree = renderer.create(<App />);
    await Promise.resolve();
  });
  expect(
    tree!.root.findByProps({testID: 'papyrus-rn-reading-shell'}),
  ).toBeTruthy();
  expect(
    tree!.root.findByProps({testID: 'papyrus-document-switcher'}),
  ).toBeTruthy();
});

it('keeps the document switcher below the page counter', async () => {
  let tree: renderer.ReactTestRenderer;
  await renderer.act(async () => {
    tree = renderer.create(<App />);
    await Promise.resolve();
  });

  const switcherFrame = tree!.root.findByProps({
    testID: 'papyrus-document-switcher',
  });

  expect(switcherFrame.props.style.top).toBeGreaterThanOrEqual(132);
  expect(switcherFrame.props.style.paddingHorizontal).toBe(16);
});

it('shows a CBZ/CBR option in the document switcher', async () => {
  let tree: renderer.ReactTestRenderer;
  await renderer.act(async () => {
    tree = renderer.create(<App />);
    await Promise.resolve();
  });

  expect(
    tree!.root.findByProps({testID: 'papyrus-document-type-comic'}),
  ).toBeTruthy();
});
