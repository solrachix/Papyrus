import React from 'react';
import ReactDOM from 'react-dom/client';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import workerUrl from 'pdfjs-dist/build/pdf.worker?url';
import { configurePdfjsWorker, setPdfjsLib } from '@papyrus-sdk/engine-pdfjs';
import '@papyrus-sdk/ui-react/base.css';
import App from './App';

setPdfjsLib(pdfjsLib);
configurePdfjsWorker(workerUrl, pdfjsLib);

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
