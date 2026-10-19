import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import registry from './viewports.json';
import './viewer.css';

declare const document: { getElementById(id: string): Parameters<typeof createRoot>[0] | null };
declare const window: {
  location: { search: string };
  history: { replaceState(data: null, unused: string, url: string): void };
};

const presets = [registry.default, ...registry.additional];
const initialId = new URLSearchParams(window.location.search).get('viewport');
const initialPreset = presets.find((preset) => preset.id === initialId) ?? registry.default;

export function BrowserVerificationViewer() {
  const [preset, setPreset] = useState(initialPreset);
  return (
    <main className="viewer">
      <header className="viewer-controls">
        <div>
          <h1>Workout preview</h1>
          <p>Choose a viewport. Your workout and appearance stay in place.</p>
        </div>
        <div className="viewport-presets" role="group" aria-label="Preview viewport">
          {presets.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={preset.id === option.id}
              onClick={() => {
                setPreset(option);
                window.history.replaceState(null, '', `?viewport=${option.id}`);
              }}
            >
              {option.label} {option.width} × {option.height}
            </button>
          ))}
        </div>
      </header>
      <div className="preview-frame">
        <iframe title="Workout preview" src="/workout.html" style={{ width: preset.width, height: preset.height }} />
      </div>
    </main>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing browser verification root');
createRoot(root).render(<BrowserVerificationViewer />);
